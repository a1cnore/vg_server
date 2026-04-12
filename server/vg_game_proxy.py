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

_OP_POSITION = 1070
_OP_HERO_DEATH = 1074
_OP_XP_CREDIT = 1052
_OP_LEVEL_UP = 1076
_OP_CS_UPDATE = 1084
_OP_GOLD_UPDATE = 1093
_OP_SNAPSHOT = 1114
_OP_PLAYER_INFO = 1006


def _parse_messages(data):
    """Parse decrypted data into (opcode, payload) tuples.

    Match protocol framing: each message is [2B opcode_le][2B length_le][payload].
    """
    msgs = []
    offset = 0
    while offset + 4 <= len(data):
        opcode = struct.unpack_from('<H', data, offset)[0]
        length = struct.unpack_from('<H', data, offset + 2)[0]
        if offset + 4 + length > len(data):
            break
        payload = data[offset + 4:offset + 4 + length]
        msgs.append((opcode, payload))
        offset += 4 + length
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
        self._entity_map = {}        # entity_id -> {handle, team, slot}
        self._last_pos_time = {}     # entity_id -> last position write time
        self._start_time = time.time()

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
                vg_db.update_match(
                    self.match_id,
                    status="completed",
                    ended_at=datetime.now(timezone.utc).isoformat(),
                    duration_s=round(duration_s, 1),
                    total_packets=self._packet_count,
                )
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
                        # Never crash the relay for analysis errors
                        pass
        except (ConnectionError, OSError):
            pass

    def _advance_handshake(self, direction: str, data: bytes):
        """Track which phase of the handshake we're in."""
        if self._handshake_phase == 0 and direction == "C->S" and len(data) == 136:
            # HANDSHAKE_HELLO sent
            self._handshake_phase = 1
        elif self._handshake_phase == 1 and direction == "S->C" and len(data) == 5:
            # HANDSHAKE_ACK received
            self._handshake_phase = 2
        elif self._handshake_phase == 2 and direction == "C->S" and len(data) == 74:
            # AUTH_TOKEN sent (already modified if force_key)
            self._handshake_phase = 3
        elif self._handshake_phase == 3 and direction == "S->C" and len(data) == 106:
            # SERVER_HELLO received
            self._handshake_phase = 4
            if self.force_key:
                self._check_server_hello(data)

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

    def _analyze_packet(self, data):
        """Decrypt and parse a server packet for real-time match analysis."""
        if len(data) < 8:
            return
        decrypted = decrypt_msg(self._cipher, data)
        msgs = _parse_messages(decrypted)
        now = time.time()
        match_time = now - self._start_time

        for opcode, payload in msgs:
            if opcode == _OP_PLAYER_INFO and len(payload) >= 6:
                # Player info: extract handle and entity_id mapping
                try:
                    # handle is null-terminated string at offset 0, entity_id at end
                    null_pos = payload.index(0)
                    handle = payload[:null_pos].decode("utf-8", errors="replace")
                    if len(payload) >= null_pos + 3:
                        eid = struct.unpack_from('<H', payload, null_pos + 1)[0]
                        self._entity_map[eid] = {"handle": handle, "team": -1, "slot": -1}
                except (ValueError, struct.error):
                    pass

            elif opcode == _OP_SNAPSHOT and len(payload) >= 161:
                # Snapshot: 6x161B player records
                record_size = 161
                for i in range(6):
                    off = i * record_size
                    if off + record_size > len(payload):
                        break
                    rec = payload[off:off + record_size]
                    try:
                        null_pos = rec.index(0)
                        handle = rec[:null_pos].decode("utf-8", errors="replace")
                        if len(rec) >= null_pos + 5:
                            eid = struct.unpack_from('<H', rec, null_pos + 1)[0]
                            team = rec[null_pos + 3] if null_pos + 3 < len(rec) else -1
                            slot = rec[null_pos + 4] if null_pos + 4 < len(rec) else i
                            self._entity_map[eid] = {"handle": handle, "team": team, "slot": slot}
                            if vg_db is not None and self.db_match_id is not None:
                                try:
                                    vg_db.upsert_match_player(self.db_match_id, slot, handle=handle, team=team, entity_id=eid)
                                except Exception:
                                    pass
                    except (ValueError, struct.error):
                        pass

            elif opcode == _OP_POSITION and len(payload) >= 6:
                # Position: entity_id(2B), x(2B), y(2B) — throttle to every 2s
                try:
                    eid = struct.unpack_from('<H', payload, 0)[0]
                    last = self._last_pos_time.get(eid, 0)
                    if now - last >= 2.0:
                        self._last_pos_time[eid] = now
                        x = struct.unpack_from('<H', payload, 2)[0]
                        y = struct.unpack_from('<H', payload, 4)[0]
                        info = self._entity_map.get(eid)
                        if info and vg_db is not None and self.db_match_id is not None:
                            try:
                                vg_db.upsert_match_player(self.db_match_id, info.get("slot", -1), pos_x=x, pos_y=y)
                            except Exception:
                                pass
                except struct.error:
                    pass

            elif opcode == _OP_HERO_DEATH and len(payload) >= 2:
                # Hero death: victim entity_id
                try:
                    eid = struct.unpack_from('<H', payload, 0)[0]
                    info = self._entity_map.get(eid, {})
                    handle = info.get("handle", f"entity_{eid}")
                    print(f"\033[31m[MATCH DEATH]\033[0m {handle} died at {match_time:.1f}s", file=sys.stderr)
                    if vg_db is not None and self.db_match_id is not None:
                        try:
                            vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "death", handle)
                            slot = info.get("slot", -1)
                            if slot >= 0:
                                vg_db.upsert_match_player(self.db_match_id, slot, deaths=1)
                        except Exception:
                            pass
                except struct.error:
                    pass

            elif opcode == _OP_XP_CREDIT and len(payload) >= 4:
                # XP/kill credit: entity_id(2B), stat_type(1B) — 0x29 = kill
                try:
                    eid = struct.unpack_from('<H', payload, 0)[0]
                    stat_type = payload[2] if len(payload) > 2 else 0
                    if stat_type == 0x29:
                        info = self._entity_map.get(eid, {})
                        handle = info.get("handle", f"entity_{eid}")
                        print(f"\033[32m[MATCH KILL]\033[0m {handle} got a kill at {match_time:.1f}s", file=sys.stderr)
                        if vg_db is not None and self.db_match_id is not None:
                            try:
                                vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "kill", handle)
                                slot = info.get("slot", -1)
                                if slot >= 0:
                                    vg_db.upsert_match_player(self.db_match_id, slot, kills=1)
                            except Exception:
                                pass
                except struct.error:
                    pass

            elif opcode == _OP_LEVEL_UP and len(payload) >= 2:
                # Level up: entity_id
                try:
                    eid = struct.unpack_from('<H', payload, 0)[0]
                    info = self._entity_map.get(eid, {})
                    handle = info.get("handle", f"entity_{eid}")
                    if vg_db is not None and self.db_match_id is not None:
                        try:
                            vg_db.insert_match_event(self.db_match_id, round(match_time, 1), "level_up", handle)
                        except Exception:
                            pass
                except struct.error:
                    pass

            elif opcode == _OP_CS_UPDATE and len(payload) >= 4:
                # CS update: entity_id(2B), cs(2B)
                try:
                    eid = struct.unpack_from('<H', payload, 0)[0]
                    cs = struct.unpack_from('<H', payload, 2)[0]
                    info = self._entity_map.get(eid)
                    if info and vg_db is not None and self.db_match_id is not None:
                        try:
                            vg_db.upsert_match_player(self.db_match_id, info.get("slot", -1), cs=cs)
                        except Exception:
                            pass
                except struct.error:
                    pass

            elif opcode == _OP_GOLD_UPDATE and len(payload) >= 4:
                # Gold update: entity_id(2B), gold(2B)
                try:
                    eid = struct.unpack_from('<H', payload, 0)[0]
                    gold = struct.unpack_from('<H', payload, 2)[0]
                    info = self._entity_map.get(eid)
                    if info and vg_db is not None and self.db_match_id is not None:
                        try:
                            vg_db.upsert_match_player(self.db_match_id, info.get("slot", -1), gold=gold)
                        except Exception:
                            pass
                except struct.error:
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
