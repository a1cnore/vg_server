#!/usr/bin/env python3
"""
vg_game_proxy — TCP proxy for Vainglory in-match game server traffic.

Listens on a local port, forwards to the real game server, and logs all
packets (both directions) to a per-match directory as raw binary + hex dump.

The vg_interceptor.py addon rewrites the game server host in `update`
responses to point here. This proxy captures the raw game protocol.

Usage: python3 vg_game_proxy.py [--listen-port PORT]
       (started automatically by the interceptor when a match begins)

Force-key mode (--force-key):
  Intercepts the AUTH_TOKEN (packet #3, C->S) and replaces the first 40 bytes
  with zeros, then recomputes the Blowfish zeros pattern using a known key.
  This attempts to force the server to accept a known encryption key so that
  all subsequent traffic can be decrypted.

  The forced key = MD5(salt + 0x00*40) where salt is the 64-byte constant
  from the game binary. If the server validates the auth data, this will
  cause a connection failure; if it doesn't, we get full decryption.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import struct
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import vg_db
except ImportError:
    vg_db = None

LOG_BASE = Path(os.environ.get("VG_LOG_DIR", Path(__file__).parent)) / "matches"

# Blowfish salt from game binary (64 bytes)
_BF_SALT = bytes.fromhex(
    "467c46341a2f5f1ea778c8d74b1ca88b459d33ab9685e0e3f378e7b493322ceb"
    "4036be8b31396d3330ddaa6d7031415efe903f60be8834c53299e3e8877c3a26"
)

# Global flag: when True, the proxy rewrites AUTH_TOKEN to force a known key
_force_key_mode = False


# MARK: - Blowfish decryption for real-time match analysis

def _swap4(b):
    return b[3::-1] + b[7:3:-1]


def make_cipher(match_id):
    try:
        from Crypto.Cipher import Blowfish
    except ImportError:
        return None
    key = hashlib.md5(_BF_SALT + match_id.encode()).digest()
    return Blowfish.new(key, Blowfish.MODE_ECB)


def decrypt_msg(bf, msg):
    out = bytearray()
    for j in range(0, len(msg) - len(msg) % 8, 8):
        out.extend(_swap4(bf.decrypt(_swap4(msg[j:j+8]))))
    return bytes(out)


# MARK: - Match protocol opcodes for real-time analysis

# Opcodes are used as literals (1006, 1052, 1070, 1074, 1076, 1084, 1093, 1114)
# matching the POC vg_dashboard_server.py big-endian protocol


def _split_and_decrypt(cipher, raw_tcp_data):
    """Split a raw TCP frame into sub-messages, decrypt each, return (opcode, payload) tuples.

    Wire framing: [2B BE msg_len][msg_data of msg_len bytes]
    Each msg_data is Blowfish ECB encrypted (with LE word swap).
    After decryption: [2B BE opcode][payload].
    """
    msgs = []
    pos = 0
    while pos + 2 <= len(raw_tcp_data):
        msg_len = struct.unpack(">H", raw_tcp_data[pos:pos + 2])[0]
        if msg_len == 0 or pos + 2 + msg_len > len(raw_tcp_data):
            break
        msg_data = raw_tcp_data[pos + 2:pos + 2 + msg_len]
        if len(msg_data) >= 8:
            dec = decrypt_msg(cipher, msg_data)
            if len(dec) >= 2:
                opcode = struct.unpack(">H", dec[0:2])[0]
                msgs.append((opcode, dec[2:]))
        elif len(msg_data) >= 2:
            opcode = struct.unpack(">H", msg_data[0:2])[0]
            msgs.append((opcode, msg_data[2:]))
        pos += 2 + msg_len
    return msgs


def _compute_forced_key():
    """Compute the Blowfish key and zeros pattern for zeroed auth data."""
    forced_key = hashlib.md5(_BF_SALT + b'\x00' * 40).digest()
    try:
        from Crypto.Cipher import Blowfish
        cipher = Blowfish.new(forced_key, Blowfish.MODE_ECB)
        zeros_enc = cipher.encrypt(b'\x00' * 8)
    except ImportError:
        # Fallback: precomputed value
        zeros_enc = bytes.fromhex("44789e7ca869ce30")
    return forced_key, zeros_enc


class MatchProxy:
    """Bidirectional TCP proxy for a single match."""

    def __init__(self, match_id: str, real_host: str, real_port: int, listen_port: int,
                 force_key: bool = False, user_id=None, db_match_id=None):
        self.match_id = match_id
        self.real_host = real_host
        self.real_port = real_port
        self.listen_port = listen_port
        self.force_key = force_key or _force_key_mode
        self.user_id = user_id
        self.db_match_id = db_match_id
        self.match_dir = LOG_BASE / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{match_id[:8]}"
        self.match_dir.mkdir(parents=True, exist_ok=True)
        self._packet_count = 0
        self._bytes_client = 0
        self._bytes_server = 0
        self._running = False
        self._server_sock = None
        self._handshake_phase = 0  # 0=hello, 1=ack, 2=auth, 3=server_hello, 4=encrypted
        self._forced_key = None
        self._forced_zeros_enc = None
        if self.force_key:
            self._forced_key, self._forced_zeros_enc = _compute_forced_key()
            print(f"[game_proxy] FORCE-KEY mode enabled for match {match_id[:8]}", file=sys.stderr)
            print(f"[game_proxy]   Key: {self._forced_key.hex()}", file=sys.stderr)
            print(f"[game_proxy]   Zeros pattern: {self._forced_zeros_enc.hex()}", file=sys.stderr)
        self._meta = {
            "match_id": match_id,
            "real_host": real_host,
            "real_port": real_port,
            "listen_port": listen_port,
            "force_key": self.force_key,
            "start_time": datetime.now(timezone.utc).isoformat(),
            "packets": [],
        }
        # Real-time match analysis state
        self._cipher = make_cipher(match_id)
        self._entity_map = {}        # entity_id -> {handle, team, slot, level, kills, deaths, assists, xp, ...}
        self._last_pos_time = {}     # entity_id -> last position write time
        self._last_stat_time = {}    # entity_id -> last stat write time
        self._start_time = time.time()
        # Kill/assist attribution: sliding window of recent hero-hero interactions
        self._recent_interactions = []  # [(ts, source_eid, target_eid, family)]
        # Death dedup
        self._last_death_ts = {}     # entity_id -> last death timestamp
        # Entity state tracking for death/respawn detection (opcode 1067)
        self._entity_state = {}      # entity_id -> last state_value (state_index=0)
        # Gold/XP counter tracking from opcode 1086
        self._counter_state = {}     # (entity_id, prop_type) -> last combined value
        self._counter_deltas = []    # [(ts, entity_id, delta)] for reward window
        # Level detection: stat cluster analysis
        self._prev_stats = {}        # (entity_id, stat_type) -> value
        self._last_level_ts = {}     # entity_id -> last level-up timestamp
        self._pending_level_check = {}  # entity_id -> (ts, msg_index) for deferred stat check
        # Winner detection from opcode 1077 burst
        self._result_burst = []      # [(ts, source_id, target_id, team_hint)]
        self._winning_team = 0

    def start(self):
        self._server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server_sock.settimeout(120)
        self._server_sock.bind(("0.0.0.0", self.listen_port))
        # If listen_port was 0, OS assigned a port — store it
        if self.listen_port == 0:
            self.listen_port = self._server_sock.getsockname()[1]
        self._server_sock.listen(1)
        self._running = True
        print(f"[game_proxy] match {self.match_id[:8]} listening on :{self.listen_port} -> {self.real_host}:{self.real_port}", file=sys.stderr)
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def stop(self):
        self._running = False
        if self._server_sock:
            try:
                self._server_sock.close()
            except Exception:
                pass
        self._meta["end_time"] = datetime.now(timezone.utc).isoformat()
        self._meta["total_packets"] = self._packet_count
        self._meta["bytes_from_client"] = self._bytes_client
        self._meta["bytes_from_server"] = self._bytes_server
        meta_path = self.match_dir / "match_meta.json"
        meta_path.write_text(json.dumps(self._meta, indent=2))
        print(f"[game_proxy] match {self.match_id[:8]} ended: {self._packet_count} packets, "
              f"{self._bytes_client + self._bytes_server} bytes total, saved to {self.match_dir}", file=sys.stderr)

        # DB: mark match completed
        if vg_db is not None and self.db_match_id is not None:
            try:
                duration_s = time.time() - self._start_time
                update_fields = dict(
                    status="completed",
                    ended_at=datetime.now(timezone.utc).isoformat(),
                    duration_s=round(duration_s, 1),
                    total_packets=self._packet_count,
                )
                if self._winning_team in (1, 2):
                    update_fields["winning_team"] = self._winning_team
                vg_db.update_match(self.match_id, **update_fields)
            except Exception as e:
                print(f"[game_proxy] DB update_match error: {e}", file=sys.stderr)

    def _accept_loop(self):
        try:
            client_sock, addr = self._server_sock.accept()
        except (socket.timeout, OSError):
            print(f"[game_proxy] match {self.match_id[:8]} no connection received", file=sys.stderr)
            self.stop()
            return

        print(f"[game_proxy] match {self.match_id[:8]} client connected from {addr}", file=sys.stderr)

        # Connect to real game server
        try:
            remote_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            remote_sock.settimeout(10)
            remote_sock.connect((self.real_host, self.real_port))
            remote_sock.settimeout(None)
        except Exception as e:
            print(f"[game_proxy] match {self.match_id[:8]} failed to connect to real server: {e}", file=sys.stderr)
            client_sock.close()
            self.stop()
            return

        # Open raw packet log
        raw_log = open(self.match_dir / "packets.bin", "wb")
        hex_log = open(self.match_dir / "packets.txt", "w")

        # Bidirectional relay
        t1 = threading.Thread(target=self._relay, args=(client_sock, remote_sock, "C->S", raw_log, hex_log), daemon=True)
        t2 = threading.Thread(target=self._relay, args=(remote_sock, client_sock, "S->C", raw_log, hex_log), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        client_sock.close()
        remote_sock.close()
        raw_log.close()
        hex_log.close()
        self.stop()

    def _relay(self, src: socket.socket, dst: socket.socket, direction: str,
               raw_log, hex_log):
        try:
            while self._running:
                data = src.recv(65536)
                if not data:
                    break

                # Force-key interception: modify AUTH_TOKEN packet
                if self.force_key and direction == "C->S" and self._handshake_phase == 2:
                    data = self._rewrite_auth_token(data)

                # Track handshake phase
                self._advance_handshake(direction, data)

                dst.sendall(data)
                self._log_packet(direction, data, raw_log, hex_log)

                # Real-time match analysis (only after handshake, S->C only)
                if self._cipher and self._handshake_phase >= 4 and direction == "S->C":
                    try:
                        self._analyze_packet(data)
                    except Exception as e:
                        print(f"[game_proxy] _analyze_packet error: {e}", file=sys.stderr)
        except (ConnectionError, OSError):
            pass

    def _advance_handshake(self, direction: str, data: bytes):
        """Track which phase of the handshake we're in."""
        if self._handshake_phase == 0 and direction == "C->S" and len(data) == 136:
            self._handshake_phase = 1
        elif self._handshake_phase == 1 and direction == "S->C" and len(data) == 5:
            self._handshake_phase = 2
        elif self._handshake_phase == 2 and direction == "C->S" and len(data) == 74:
            self._handshake_phase = 3
        elif self._handshake_phase == 3 and direction == "S->C" and len(data) == 106:
            self._handshake_phase = 4
            print(f"[game_proxy] handshake complete (phase 4), analysis active", file=sys.stderr)
            if self.force_key:
                self._check_server_hello(data)
        # Fallback: if we've seen enough packets and are still stuck, force phase 4
        # The handshake is always exactly 4 packets, so after packet 5+ we're in game data
        if self._handshake_phase < 4 and self._packet_count >= 5:
            print(f"[game_proxy] forcing handshake phase 4 after {self._packet_count} packets (was phase {self._handshake_phase})", file=sys.stderr)
            self._handshake_phase = 4

    def _rewrite_auth_token(self, data: bytes) -> bytes:
        """Replace AUTH_TOKEN auth data with zeros and recompute zeros pattern.

        Original: [2B len=0x0048][40B auth_data][32B = 4x Blowfish(key, 0x00*8)]
        Modified: [2B len=0x0048][40B zeros][32B = 4x Blowfish(forced_key, 0x00*8)]
        """
        if len(data) != 74:
            print(f"[game_proxy] WARNING: AUTH_TOKEN unexpected size {len(data)}, not modifying",
                  file=sys.stderr)
            return data

        original_auth = data[2:42]
        original_zeros = data[42:50]

        print(f"[game_proxy] FORCE-KEY: Rewriting AUTH_TOKEN", file=sys.stderr)
        print(f"[game_proxy]   Original auth data: {original_auth.hex()}", file=sys.stderr)
        print(f"[game_proxy]   Original zeros pattern: {original_zeros.hex()}", file=sys.stderr)

        # Build new AUTH_TOKEN: [2B len][40B zeros][4 x 8B forced_zeros_enc]
        new_data = (
            data[:2]                           # length prefix (0x0048)
            + b'\x00' * 40                     # zeroed auth data
            + self._forced_zeros_enc * 4       # 4 copies of new zeros pattern
        )

        print(f"[game_proxy]   New zeros pattern: {self._forced_zeros_enc.hex()}", file=sys.stderr)
        print(f"[game_proxy]   Forced key: {self._forced_key.hex()}", file=sys.stderr)

        # Save the original for analysis
        orig_path = self.match_dir / "original_auth_token.bin"
        orig_path.write_bytes(data)

        return new_data

    def _check_server_hello(self, data: bytes):
        """Check if the server's zeros pattern matches our forced key."""
        if len(data) < 34:
            return

        # SERVER_HELLO: [2B len][24B data][8B zeros_pattern]...
        server_zeros = data[26:34]  # offset 24 in content = offset 26 absolute
        matches = server_zeros == self._forced_zeros_enc

        print(f"[game_proxy] FORCE-KEY: SERVER_HELLO zeros check", file=sys.stderr)
        print(f"[game_proxy]   Server zeros: {server_zeros.hex()}", file=sys.stderr)
        print(f"[game_proxy]   Expected:     {self._forced_zeros_enc.hex()}", file=sys.stderr)
        print(f"[game_proxy]   {'MATCH - Server accepted our key!' if matches else 'MISMATCH - Server uses different key'}", file=sys.stderr)

        if not matches:
            # The server has its own key. Log this for analysis.
            print(f"[game_proxy]   Server key unknown. Connection will likely fail.", file=sys.stderr)
            # Save the server hello for analysis
            sh_path = self.match_dir / "server_hello_forced.bin"
            sh_path.write_bytes(data)

    def _ensure_entity(self, eid, handle="", team=-1, slot=-1):
        """Get or create entity entry with all stat fields."""
        if eid in self._entity_map:
            info = self._entity_map[eid]
            if handle:
                info["handle"] = handle
            if team in (1, 2):
                info["team"] = team
            if slot >= 0:
                info["slot"] = slot
            return info
        if slot < 0:
            slot = len(self._entity_map)
        info = {
            "handle": handle, "team": team, "slot": slot,
            "level": 1, "kills": 0, "deaths": 0, "assists": 0, "xp": 0.0,
            "items_bought": 0, "gold_spent": 0.0,
        }
        self._entity_map[eid] = info
        return info

    def _analyze_packet(self, data):
        """Decrypt and parse a server TCP frame for real-time match analysis.

        Wire format: raw TCP data contains [2B BE msg_len][encrypted msg_data]...
        Each msg_data after decryption: [2B BE opcode][payload]

        Opcodes match vg_dashboard_server.py (big-endian protocol).
        """
        if len(data) < 4:
            return
        msgs = _split_and_decrypt(self._cipher, data)
        if not msgs:
            return
        now = time.time()
        match_time = now - self._start_time
        _db = vg_db is not None and self.db_match_id is not None

        # Log first few analysis results for debugging
        if self._packet_count <= 10:
            opcodes = [op for op, _ in msgs]
            print(f"[game_proxy] analyze pkt#{self._packet_count}: {len(msgs)} msgs, opcodes={opcodes[:8]}", file=sys.stderr)

        for opcode, payload in msgs:
            try:
                self._handle_opcode(opcode, payload, now, match_time, _db)
            except Exception as e:
                if self._packet_count <= 20:
                    print(f"[game_proxy] opcode {opcode} error: {e}", file=sys.stderr)

    def _handle_opcode(self, opcode, payload, now, match_time, _db):
        # Reset 1077 burst on any non-1077 opcode
        if opcode != 1077 and self._result_burst:
            self._maybe_commit_burst()
            self._result_burst = []

        if opcode == 1006 and len(payload) >= 164:
            # Player info: handle at [0:44], entity_id at [162:164] BE
            handle = payload[:44].split(b"\x00")[0].decode("ascii", errors="replace")
            eid = struct.unpack(">H", payload[162:164])[0]
            if handle and 1000 <= eid <= 2000:
                team = payload[210] if len(payload) > 210 and payload[210] in (1, 2) else -1
                info = self._ensure_entity(eid, handle=handle, team=team)
                if _db:
                    try:
                        vg_db.upsert_match_player(self.db_match_id, info["slot"], handle=handle, team=team, entity_id=eid)
                    except Exception:
                        pass

        elif opcode == 1114 and len(payload) >= 1 + 6 * 161:
            # Snapshot: 1B offset + 6x161B records
            for i in range(6):
                off = 1 + i * 161
                rec = payload[off:off + 161]
                if len(rec) < 161:
                    break
                handle = rec[24:56].split(b"\x00")[0].decode("ascii", errors="replace")
                eid = struct.unpack(">H", rec[18:20])[0]
                team = rec[15]
                slot = rec[8] if rec[8] < 6 else i
                if eid != 0xFFFF:
                    info = self._ensure_entity(eid, handle=handle, team=team, slot=slot)
                    if _db:
                        try:
                            vg_db.upsert_match_player(self.db_match_id, info["slot"], handle=handle, team=team, entity_id=eid)
                        except Exception:
                            pass

        elif opcode == 1070 and len(payload) >= 12:
            # Position: [2B pad][2B eid BE][4B X float BE][4B Y float BE]
            eid = struct.unpack(">H", payload[2:4])[0]
            last = self._last_pos_time.get(eid, 0)
            if now - last >= 2.0:
                self._last_pos_time[eid] = now
                x = round(struct.unpack(">f", payload[4:8])[0], 1)
                y = round(struct.unpack(">f", payload[8:12])[0], 1)
                info = self._entity_map.get(eid)
                if info and _db:
                    try:
                        vg_db.upsert_match_player(self.db_match_id, info["slot"], pos_x=x, pos_y=y)
                    except Exception:
                        pass

        elif opcode == 1067 and len(payload) >= 6:
            # Entity state change: [2B pad][2B eid BE][1B state_index][1B state_value]
            # Death = state_index 0, state_value 3; Respawn = state_index 0, state_value 1 after 3
            eid = struct.unpack(">H", payload[2:4])[0]
            state_index = payload[4]
            state_value = payload[5]
            if state_index != 0:
                return

            prev_state = self._entity_state.get(eid, 0)
            self._entity_state[eid] = state_value

            info = self._entity_map.get(eid)
            if not info:
                return
            handle = info.get("handle", f"entity_{eid}")

            if state_value == 3 and prev_state != 3:
                # Death detected — dedupe within 1.0s
                if now - self._last_death_ts.get(eid, 0) < 1.0:
                    return
                self._last_death_ts[eid] = now
                info["deaths"] += 1
                print(f"\033[31m[MATCH DEATH]\033[0m {handle} died at {match_time:.1f}s", file=sys.stderr)
                if _db:
                    try:
                        vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "death", f"{handle} died")
                        vg_db.upsert_match_player(self.db_match_id, info["slot"], deaths=info["deaths"])
                    except Exception:
                        pass
                # Kill/assist attribution from recent interaction window
                self._attribute_kill(eid, now, match_time, _db)

            elif state_value == 1 and prev_state == 3:
                # Respawn detected
                if _db:
                    try:
                        vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "respawn", f"{handle} respawned")
                    except Exception:
                        pass

        elif opcode == 1086 and len(payload) >= 14:
            # Entity property counter: [2B pad][2B eid BE][2B pad][2B eid][1B type][4B major BE][1B minor][2B aux][6B pad]
            # Gold = type 0x4D, XP = type 0x3E
            eid = struct.unpack(">H", payload[2:4])[0]
            info = self._entity_map.get(eid)
            if not info:
                return
            prop_type = payload[8]
            combined = struct.unpack(">I", payload[9:13])[0] * 256 + payload[13]
            if combined <= 0 or combined > 100_000:
                return

            prev = self._counter_state.get((eid, prop_type))
            self._counter_state[(eid, prop_type)] = combined

            if prop_type == 0x4D:
                info["gold"] = max(info.get("gold", 0), combined)
                last = self._last_stat_time.get(eid, 0)
                if now - last >= 2.0 and _db:
                    self._last_stat_time[eid] = now
                    try:
                        vg_db.upsert_match_player(self.db_match_id, info["slot"], gold=combined)
                    except Exception:
                        pass
            elif prop_type == 0x3E:
                info["xp"] = max(info.get("xp", 0), combined)
                last = self._last_stat_time.get(eid, 0)
                if now - last >= 2.0 and _db:
                    self._last_stat_time[eid] = now
                    try:
                        vg_db.upsert_match_player(self.db_match_id, info["slot"], xp=combined)
                    except Exception:
                        pass
                # Mark pending level check (stat cluster analysis)
                if prev is not None and combined > prev:
                    self._pending_level_check[eid] = now

            # Track counter deltas for reward-window kill attribution
            if prev is not None and combined > prev:
                delta = combined - prev
                if delta <= 4096:
                    self._counter_deltas.append((now, eid, delta))
                    # Prune old deltas
                    cutoff = now - 2.0
                    self._counter_deltas = [(t, e, d) for t, e, d in self._counter_deltas if t >= cutoff]

        elif opcode == 1053 and len(payload) >= 9:
            # Entity stat: [2B pad][2B eid BE][4B float BE][1B stat_type]
            eid = struct.unpack(">H", payload[2:4])[0]
            info = self._entity_map.get(eid)
            if not info:
                return
            fv = struct.unpack(">f", payload[4:8])[0]
            stat_type = payload[8]

            # Track stat values for level detection
            stat_key = (eid, stat_type)
            old_val = self._prev_stats.get(stat_key)
            self._prev_stats[stat_key] = fv

            # Check pending level-up (stat cluster within 0.35s of XP update)
            if eid in self._pending_level_check:
                check_ts = self._pending_level_check[eid]
                if now - check_ts <= 0.35:
                    if old_val is not None and fv == fv:  # not NaN
                        diff = abs(fv - old_val)
                        is_big_change = False
                        if stat_type in (0, 2, 3, 8) and 0.75 < diff < 100:
                            is_big_change = True
                        elif stat_type in (13, 14, 15) and diff > 0.4:
                            is_big_change = True
                        if is_big_change:
                            # Count how many stat types changed for this entity in this window
                            level_key = f"_level_changes_{eid}"
                            changes = info.get(level_key, set())
                            changes.add(stat_type)
                            info[level_key] = changes
                            if len(changes) >= 2 and now - self._last_level_ts.get(eid, 0) >= 5.0:
                                self._last_level_ts[eid] = now
                                info["level"] = min(12, info["level"] + 1)
                                handle = info.get("handle", f"entity_{eid}")
                                print(f"\033[33m[MATCH LEVEL]\033[0m {handle} -> level {info['level']} at {match_time:.1f}s", file=sys.stderr)
                                if _db:
                                    try:
                                        vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "level", f"{handle} reached level {info['level']}")
                                        vg_db.upsert_match_player(self.db_match_id, info["slot"], level=info["level"])
                                    except Exception:
                                        pass
                                info.pop(level_key, None)
                                del self._pending_level_check[eid]
                else:
                    # Window expired, reset
                    info.pop(f"_level_changes_{eid}", None)
                    del self._pending_level_check[eid]

            last = self._last_stat_time.get(eid, 0)
            updated = {}
            if stat_type == 0x00:
                updated["energy_regen"] = round(fv, 1)
            elif stat_type == 0x02:
                updated["energy_delta"] = round(fv, 1)
            elif stat_type == 0x03 and fv > 0:
                updated["move_speed"] = round(fv, 2)
            elif stat_type == 0x06:
                if fv < -500:
                    handle = info.get("handle", f"entity_{eid}")
                    if _db:
                        try:
                            vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "hit", f"{handle} took massive hit: {fv:.0f}")
                        except Exception:
                            pass
                updated["hp_delta"] = round(fv, 0)
            elif stat_type == 0x08:
                updated["ability_cd"] = round(fv, 1)
            elif stat_type == 0x0F:
                updated["in_combat"] = (fv == 1.0)
            if updated and now - last >= 2.0 and _db:
                self._last_stat_time[eid] = now
                try:
                    vg_db.upsert_match_player(self.db_match_id, info["slot"], **updated)
                except Exception:
                    pass

        elif opcode == 1087 and len(payload) >= 16:
            # Entity extended property: [2B pad][2B source_eid BE][2B target_eid BE][1B family][...]
            source_eid = struct.unpack(">H", payload[2:4])[0]
            target_eid = struct.unpack(">H", payload[6:8])[0]

            # Track hero-hero interactions for kill/assist attribution
            if (source_eid in range(1500, 1506)
                    and target_eid in range(1500, 1506)
                    and source_eid != target_eid):
                family = payload[8]
                self._recent_interactions.append((now, source_eid, target_eid, family))
                # Prune old interactions
                cutoff = now - 2.0
                self._recent_interactions = [(t, s, tgt, f) for t, s, tgt, f in self._recent_interactions if t >= cutoff]

            # Item purchase detection (sub_type 0x34)
            info = self._entity_map.get(source_eid)
            if info and len(payload) >= 22 and payload[8] == 0x34:
                cost = struct.unpack(">f", payload[18:22])[0]
                if cost > 0:
                    info["items_bought"] += 1
                    info["gold_spent"] += cost
                    handle = info.get("handle", f"entity_{source_eid}")
                    if _db:
                        try:
                            vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "item", f"{handle} bought item ({cost:.0f}g)")
                            vg_db.upsert_match_player(self.db_match_id, info["slot"],
                                                      items_bought=info["items_bought"],
                                                      gold_spent=round(info["gold_spent"], 0))
                        except Exception:
                            pass

        elif opcode == 1077 and len(payload) >= 16:
            # Match result burst: track consecutive messages for winner detection
            source_id = struct.unpack(">I", payload[0:4])[0]
            target_id = struct.unpack(">I", payload[4:8])[0]
            team_hint = struct.unpack(">I", payload[12:16])[0]

            expected = {eid for eid, info in self._entity_map.items() if info["team"] in (1, 2)}
            if target_id not in expected:
                self._maybe_commit_burst()
                self._result_burst = []
                return

            if (self._result_burst
                    and (target_id != self._result_burst[0][2]
                         or team_hint != self._result_burst[0][3]
                         or now - self._result_burst[-1][0] > 0.25)):
                self._maybe_commit_burst()
                self._result_burst = []

            self._result_burst.append((now, source_id, target_id, team_hint))
            self._maybe_commit_burst()

        elif opcode == 1108 and len(payload) >= 6:
            # Game mode config: game mode string at offset 5
            gm = payload[5:].split(b"\x00")[0].decode("ascii", errors="replace").strip("*")
            if gm and _db:
                try:
                    vg_db.update_match(self.match_id, game_mode=gm)
                except Exception:
                    pass

        elif opcode == 1135 and len(payload) >= 1:
            # Game mode name
            gm = payload.split(b"\x00")[0].decode("ascii", errors="replace").strip("*")
            if gm and _db:
                try:
                    vg_db.update_match(self.match_id, game_mode=gm)
                except Exception:
                    pass

    def _attribute_kill(self, dead_eid, now, match_time, _db):
        """Attribute a kill (and assists) from the recent interaction window."""
        dead_info = self._entity_map.get(dead_eid)
        dead_team = dead_info["team"] if dead_info and dead_info["team"] in (1, 2) else 0

        # Find all hero sources that targeted the dead entity in the last 1.0s
        sources = {}  # source_eid -> latest_ts
        for ts, source_eid, target_eid, family in reversed(self._recent_interactions):
            if now - ts > 1.0:
                break
            if target_eid != dead_eid or source_eid == dead_eid:
                continue
            source_info = self._entity_map.get(source_eid)
            source_team = source_info["team"] if source_info and source_info["team"] in (1, 2) else 0
            if dead_team and source_team == dead_team:
                continue  # Same team, skip
            if source_eid not in sources:
                sources[source_eid] = ts

        killer_eid = None
        if sources:
            # Most recent interaction source = killer
            killer_eid = max(sources, key=sources.get)
        else:
            # Fallback: reward window (counter deltas within 1.0s after death)
            reward_totals = {}
            for ts, eid, delta in self._counter_deltas:
                if ts < now or ts - now > 1.0:
                    continue
                if eid != dead_eid:
                    source_info = self._entity_map.get(eid)
                    source_team = source_info["team"] if source_info and source_info["team"] in (1, 2) else 0
                    if not dead_team or source_team != dead_team:
                        reward_totals[eid] = reward_totals.get(eid, 0) + delta
            if len(reward_totals) == 1:
                killer_eid = next(iter(reward_totals))
            elif len(reward_totals) >= 2:
                ranked = sorted(reward_totals.items(), key=lambda x: x[1], reverse=True)
                if ranked[0][1] >= ranked[1][1] * 2:
                    killer_eid = ranked[0][0]

        if killer_eid is None:
            return

        # Credit kill
        killer_info = self._entity_map.get(killer_eid)
        if killer_info:
            killer_info["kills"] += 1
            killer_name = killer_info.get("handle", f"entity_{killer_eid}")
            dead_name = dead_info.get("handle", f"entity_{dead_eid}") if dead_info else f"entity_{dead_eid}"
            print(f"\033[32m[MATCH KILL]\033[0m {killer_name} killed {dead_name} at {match_time:.1f}s", file=sys.stderr)
            if _db:
                try:
                    vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "kill", f"{killer_name} killed {dead_name}")
                    vg_db.upsert_match_player(self.db_match_id, killer_info["slot"], kills=killer_info["kills"])
                except Exception:
                    pass

        # Credit assists to other attackers
        for assist_eid in sources:
            if assist_eid == killer_eid:
                continue
            assist_info = self._entity_map.get(assist_eid)
            if assist_info:
                assist_info["assists"] += 1
                assist_name = assist_info.get("handle", f"entity_{assist_eid}")
                dead_name = dead_info.get("handle", f"entity_{dead_eid}") if dead_info else f"entity_{dead_eid}"
                if _db:
                    try:
                        vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "assist", f"{assist_name} assisted kill on {dead_name}")
                        vg_db.upsert_match_player(self.db_match_id, assist_info["slot"], assists=assist_info["assists"])
                    except Exception:
                        pass

    def _maybe_commit_burst(self):
        """Check if the current 1077 burst is a complete winner signal."""
        group = self._result_burst
        if len(group) < 7:
            return

        expected = {info["entity_id"] for eid, info in self._entity_map.items() if info["team"] in (1, 2)}
        if len(expected) < 6:
            return

        player_sources = {src for _, src, _, _ in group if src != 0xFFFFFFFF}
        has_sentinel = any(src == 0xFFFFFFFF for _, src, _, _ in group)
        if player_sources != expected or not has_sentinel:
            return

        _, _, target_id, team_hint = group[0]
        # Find target's team
        winning_team = 0
        for eid, info in self._entity_map.items():
            if eid == target_id and info["team"] in (1, 2):
                winning_team = info["team"]
                break
        if not winning_team and team_hint in (1, 2):
            winning_team = team_hint
        if winning_team not in (1, 2):
            return

        self._winning_team = winning_team
        team_name = "Blue" if winning_team == 1 else "Red"
        print(f"\033[35m[MATCH WINNER]\033[0m Team {team_name} wins!", file=sys.stderr)

        _db = vg_db is not None and self.db_match_id is not None
        if _db:
            match_time = time.time() - self._start_time
            try:
                vg_db.update_match(self.match_id, winning_team=winning_team)
                vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "winner", f"Team {team_name} wins")
            except Exception:
                pass

    def _log_packet(self, direction: str, data: bytes, raw_log, hex_log):
        ts = time.time()
        self._packet_count += 1
        pkt_num = self._packet_count

        if direction == "C->S":
            self._bytes_client += len(data)
        else:
            self._bytes_server += len(data)

        # Write binary: [8 bytes timestamp][1 byte direction: 0=C->S, 1=S->C][4 bytes length][data]
        dir_byte = b'\x00' if direction == "C->S" else b'\x01'
        raw_log.write(struct.pack("!d", ts) + dir_byte + struct.pack("!I", len(data)) + data)
        raw_log.flush()

        # Write hex dump
        ts_str = datetime.fromtimestamp(ts, timezone.utc).strftime("%H:%M:%S.%f")[:-3]
        hex_log.write(f"\n--- #{pkt_num} {direction} {ts_str} {len(data)} bytes ---\n")
        # Hex dump first 256 bytes
        for i in range(0, min(len(data), 256), 16):
            chunk = data[i:i+16]
            hex_part = " ".join(f"{b:02x}" for b in chunk)
            ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            hex_log.write(f"  {i:04x}  {hex_part:<48}  {ascii_part}\n")
        if len(data) > 256:
            hex_log.write(f"  ... ({len(data) - 256} more bytes)\n")
        hex_log.flush()

        # Track in meta
        self._meta["packets"].append({
            "n": pkt_num,
            "dir": direction,
            "ts": ts,
            "size": len(data),
        })

        # Print summary
        if pkt_num <= 5 or pkt_num % 50 == 0:
            preview = data[:32].hex()
            print(f"[game_proxy] #{pkt_num} {direction} {len(data):>5}b  {preview}...", file=sys.stderr)


# Global registry of active match proxies
_active_proxies: dict[str, MatchProxy] = {}


def start_match_proxy(match_id: str, real_host: str, real_port: int, listen_port: int,
                      force_key: bool = False, user_id=None) -> MatchProxy:
    """Start a proxy for a new match. Called from vg_interceptor."""
    if match_id in _active_proxies:
        return _active_proxies[match_id]

    # Create DB match record
    db_match_id = None
    if vg_db is not None:
        try:
            db_match_id = vg_db.create_match(user_id, match_id, real_host, real_port)
        except Exception as e:
            print(f"[game_proxy] DB create_match error: {e}", file=sys.stderr)

    proxy = MatchProxy(match_id, real_host, real_port, listen_port,
                       force_key=force_key, user_id=user_id, db_match_id=db_match_id)
    proxy.start()
    _active_proxies[match_id] = proxy
    return proxy


def stop_match_proxy(match_id: str):
    proxy = _active_proxies.pop(match_id, None)
    if proxy:
        proxy.stop()


def main():
    global _force_key_mode
    parser = argparse.ArgumentParser(description="VG game server TCP proxy")
    parser.add_argument("--match-id", default="test")
    parser.add_argument("--real-host", required=True)
    parser.add_argument("--real-port", type=int, required=True)
    parser.add_argument("--listen-port", type=int, required=True)
    parser.add_argument("--force-key", action="store_true",
                       help="Replace AUTH_TOKEN with zeros to force a known Blowfish key. "
                            "Key = MD5(salt + 0x00*40). Server may reject the connection.")
    args = parser.parse_args()

    if args.force_key:
        _force_key_mode = True
        forced_key, forced_zeros = _compute_forced_key()
        print(f"[game_proxy] FORCE-KEY mode globally enabled", file=sys.stderr)
        print(f"[game_proxy]   Forced key: {forced_key.hex()}", file=sys.stderr)
        print(f"[game_proxy]   Zeros enc:  {forced_zeros.hex()}", file=sys.stderr)

    proxy = MatchProxy(args.match_id, args.real_host, args.real_port, args.listen_port,
                       force_key=args.force_key)
    proxy.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        proxy.stop()


if __name__ == "__main__":
    main()
