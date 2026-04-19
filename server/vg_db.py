"""vg_db — Postgres helpers for the VG server (multi-user)."""

import os
import sys
import threading

import psycopg2
import psycopg2.pool
import psycopg2.extras
from psycopg2.extras import Json
import requests

# ---------------------------------------------------------------------------
# Module state
# ---------------------------------------------------------------------------

_pool = None
_pool_lock = threading.Lock()
_geo_cache = {}  # ip -> {country, lat, lng}

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgres://vg:vg@localhost:5432/vg"
)


def _log(msg):
    print(f"[vg_db] {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Pool
# ---------------------------------------------------------------------------

def init_pool():
    global _pool
    with _pool_lock:
        if _pool is not None:
            return
        try:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                1, 10, DATABASE_URL
            )
            _log("connection pool created")
        except Exception as e:
            _log(f"failed to create pool: {e}")
            raise


def _get_conn():
    if _pool is None:
        init_pool()
    return _pool.getconn()


def _put_conn(conn):
    _pool.putconn(conn)


# ---------------------------------------------------------------------------
# Geo lookup
# ---------------------------------------------------------------------------

def _geo_lookup(ip):
    if ip in _geo_cache:
        return _geo_cache[ip]
    try:
        r = requests.get(
            f"http://ip-api.com/json/{ip}?fields=country,lat,lon", timeout=3
        )
        data = r.json()
        result = {
            "country": data.get("country"),
            "lat": data.get("lat"),
            "lng": data.get("lon"),
        }
    except Exception as e:
        _log(f"geo lookup failed for {ip}: {e}")
        result = {"country": None, "lat": None, "lng": None}
    _geo_cache[ip] = result
    return result


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def upsert_user(player_uuid, handle, client_ip):
    """Insert or update user, return user id."""
    geo = _geo_lookup(client_ip)
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users
                    (player_uuid, player_handle, client_ip,
                     country, lat, lng,
                     connected_at, last_seen_at, is_online)
                VALUES (%s, %s, %s, %s, %s, %s, now(), now(), true)
                ON CONFLICT (player_uuid) DO UPDATE SET
                    player_handle = EXCLUDED.player_handle,
                    client_ip     = EXCLUDED.client_ip,
                    country       = EXCLUDED.country,
                    lat           = EXCLUDED.lat,
                    lng           = EXCLUDED.lng,
                    connected_at  = now(),
                    last_seen_at  = now(),
                    is_online     = true
                RETURNING id
                """,
                (player_uuid, handle, client_ip,
                 geo["country"], geo["lat"], geo["lng"]),
            )
            user_id = cur.fetchone()[0]
        conn.commit()
        return user_id
    except Exception as e:
        conn.rollback()
        _log(f"upsert_user error: {e}")
        return None
    finally:
        _put_conn(conn)


def set_user_online(player_uuid, online):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE users
                SET is_online = %s, last_seen_at = now()
                WHERE player_uuid = %s
                """,
                (online, player_uuid),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        _log(f"set_user_online error: {e}")
    finally:
        _put_conn(conn)


def heartbeat_user(player_uuid):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET last_seen_at = now() WHERE player_uuid = %s",
                (player_uuid,),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        _log(f"heartbeat_user error: {e}")
    finally:
        _put_conn(conn)


# ---------------------------------------------------------------------------
# RPC logs
# ---------------------------------------------------------------------------

def insert_rpc_log(user_id, ts, method, category, status, url, host,
                   req_json, res_json, extracted_json):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO rpc_logs
                    (user_id, ts, method, category, status, url, host,
                     req, res, extracted)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (user_id, ts, method, category, status, url, host,
                 Json(req_json), Json(res_json), Json(extracted_json)),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        _log(f"insert_rpc_log error: {e}")
    finally:
        _put_conn(conn)


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------

def create_match(user_id, match_id, real_host, real_port):
    """Create a match row, return its DB id."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO matches
                    (user_id, match_id, real_host, real_port,
                     started_at, status)
                VALUES (%s, %s, %s, %s, now(), 'live')
                RETURNING id
                """,
                (user_id, match_id, real_host, real_port),
            )
            db_id = cur.fetchone()[0]
        conn.commit()
        return db_id
    except Exception as e:
        conn.rollback()
        _log(f"create_match error: {e}")
        return None
    finally:
        _put_conn(conn)


_MATCH_ALLOWED = {"game_mode", "status", "ended_at", "duration_s",
                  "total_packets", "winning_team"}


def update_match(match_id_text, **fields):
    """Update match by its text match_id."""
    fields = {k: v for k, v in fields.items() if k in _MATCH_ALLOWED}
    if not fields:
        return
    cols = ", ".join(f"{k} = %s" for k in fields)
    vals = list(fields.values())
    vals.append(match_id_text)
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE matches SET {cols} WHERE match_id = %s", vals
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        _log(f"update_match error: {e}")
    finally:
        _put_conn(conn)


# ---------------------------------------------------------------------------
# Match players
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Ranked data
# ---------------------------------------------------------------------------

# Maps DB column names to the KV key names used by the game client
_RANKED_COLS = [
    "new_5v5_elo_bucket", "prev_5v5_elo_bucket", "new_5v5_m_elo_bucket",
    "prev_5v5_m_elo_earned", "new_5v5_m_elo_earned",
    "new_3v3_elo_bucket", "prev_3v3_elo_bucket", "new_3v3_m_elo_bucket",
    "prev_3v3_m_elo_earned", "new_3v3_m_elo_earned",
]

_RANKED_TO_KV = {
    "new_5v5_elo_bucket": "new5v5RankedDataEloBucket",
    "prev_5v5_elo_bucket": "prev5v5RankedDataEloBucket",
    "new_5v5_m_elo_bucket": "new5v5RankedDatamEloBucket",
    "prev_5v5_m_elo_earned": "prev5v5RankedDatamEloEarned",
    "new_5v5_m_elo_earned": "new5v5RankedDatamEloEarned",
    "new_3v3_elo_bucket": "new3v3RankedDataEloBucket",
    "prev_3v3_elo_bucket": "prev3v3RankedDataEloBucket",
    "new_3v3_m_elo_bucket": "new3v3RankedDatamEloBucket",
    "prev_3v3_m_elo_earned": "prev3v3RankedDatamEloEarned",
    "new_3v3_m_elo_earned": "new3v3RankedDatamEloEarned",
}

_KV_TO_RANKED = {v: k for k, v in _RANKED_TO_KV.items()}


def get_ranked_data(account_handle):
    """Get ranked elo data for an account handle, creating defaults if new."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ranked_data (account_handle)
                VALUES (%s)
                ON CONFLICT (account_handle) DO NOTHING
                """,
                (account_handle,),
            )
            cur.execute(
                "SELECT {} FROM ranked_data WHERE account_handle = %s".format(
                    ", ".join(_RANKED_COLS)
                ),
                (account_handle,),
            )
            row = cur.fetchone()
        conn.commit()
        if not row:
            return None
        return {_RANKED_TO_KV[col]: row[i] for i, col in enumerate(_RANKED_COLS)}
    except Exception as e:
        conn.rollback()
        _log(f"get_ranked_data error: {e}")
        return None
    finally:
        _put_conn(conn)


def upsert_ranked_data(account_handle, **fields):
    """Update ranked elo fields for an account. Keys are KV names."""
    updates = {}
    for kv_key, val in fields.items():
        db_col = _KV_TO_RANKED.get(kv_key)
        if db_col is not None:
            updates[db_col] = int(val)
    if not updates:
        return None
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    vals = list(updates.values())
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO ranked_data (account_handle, {", ".join(updates.keys())})
                VALUES (%s, {", ".join(["%s"] * len(updates))})
                ON CONFLICT (account_handle) DO UPDATE SET
                    {set_clause}, updated_at = now()
                """,
                [account_handle] + vals + vals,
            )
        conn.commit()
        return get_ranked_data(account_handle)
    except Exception as e:
        conn.rollback()
        _log(f"upsert_ranked_data error: {e}")
        return None
    finally:
        _put_conn(conn)


# ---------------------------------------------------------------------------
# Match players
# ---------------------------------------------------------------------------

_MP_ALLOWED = {"handle", "team", "entity_id", "kills", "deaths", "assists",
               "cs", "level", "gold", "xp", "pos_x", "pos_y", "items_bought",
               "in_combat", "energy_regen", "energy_delta", "hp_delta",
               "ability_cd", "gold_spent", "move_speed"}


def upsert_match_player(db_match_id, slot, **fields):
    """Insert or update a match_player row by (match_id, slot)."""
    fields = {k: v for k, v in fields.items() if k in _MP_ALLOWED}
    col_names = ["match_id", "slot"] + list(fields.keys())
    placeholders = ["%s", "%s"] + ["%s"] * len(fields)
    values = [db_match_id, slot] + list(fields.values())

    update_clause = ", ".join(
        f"{k} = EXCLUDED.{k}" for k in fields
    ) if fields else "slot = EXCLUDED.slot"

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO match_players ({', '.join(col_names)})
                VALUES ({', '.join(placeholders)})
                ON CONFLICT (match_id, slot) DO UPDATE SET {update_clause}
                """,
                values,
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        _log(f"upsert_match_player error: {e}")
    finally:
        _put_conn(conn)


# ---------------------------------------------------------------------------
# Match events
# ---------------------------------------------------------------------------

def insert_match_event(db_match_id, time_s, event_type, text):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO match_events (match_id, time_s, event_type, text)
                VALUES (%s, %s, %s, %s)
                """,
                (db_match_id, time_s, event_type, text),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        _log(f"insert_match_event error: {e}")
    finally:
        _put_conn(conn)
