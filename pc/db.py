"""TOUGHENING MACHINE — SQLite persistence layer (Phase 2C Stage 2).

Minimal schema: only the `records` and `schema_version` tables.
Per-type tables (cycles, alarm_events, etc.) are PROPOSED — NOT APPROVED
(spec §14) and are intentionally NOT created here.

Only stdlib sqlite3 is used. No ORM. No migrations yet
(schema_version = 1 only).
"""

import json
import os
import sqlite3
import time
from typing import Optional

from pathlib import Path

DEFAULT_DB_PATH = "pc/toughening.db"
DEFAULT_SCHEMA_VERSION = 1

# Repository root (parent of pc/). Relative DB paths are resolved against it,
# so the server finds the same database whatever the working directory is
# (before this fix, starting the server from inside pc/ created/used
# pc/pc/toughening.db or failed with "unable to open database file").
_REPO_ROOT = Path(__file__).resolve().parent.parent


def resolve_path(path: str) -> str:
    """Return `path` as an absolute path (relative = relative to repo root)."""
    p = Path(path).expanduser()
    if not p.is_absolute():
        p = _REPO_ROOT / p
    return str(p)


def get_db_path() -> str:
    """Return the database path.

    Priority: TOUGHENING_DB_PATH env var > pc/config.json "db_path" > default.
    The previous version ignored pc/config.json, so the server, the admin
    panel and the backup scheduler could each use a different database.
    """
    path = os.environ.get("TOUGHENING_DB_PATH")
    if not path:
        try:
            from pc import config as pc_config
            path = pc_config.load_config().get("db_path") or DEFAULT_DB_PATH
        except Exception:
            path = DEFAULT_DB_PATH
    return resolve_path(path)


def open_db(path: Optional[str] = None) -> sqlite3.Connection:
    """Open a SQLite connection in WAL mode with foreign keys enabled.

    `check_same_thread=False` is required because FastAPI's TestClient
    (and uvicorn) run the ASGI app in a worker thread that differs from
    the thread that created the connection. The connection is used
    by a single logical caller at a time (sequential message processing),
    so concurrent access does not occur within this stage.
    """
    if path is None:
        path = get_db_path()
    if path != ":memory:" and not str(path).startswith("file:"):
        path = resolve_path(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    # WARNING: check_same_thread=False is safe ONLY because
    # this phase uses a single ESP32 connection processed
    # sequentially. If concurrent writers are added, replace
    # with a per-request connection or a connection pool +
    # threading.Lock. See pc/README.md "Known limitations".
    conn = sqlite3.connect(path, check_same_thread=False, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    # Readers (GUI / admin / export) use their own connections; wait for a
    # writer instead of failing with "database is locked".
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Create tables if missing and set schema_version = 1."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS records (
            record_id      TEXT PRIMARY KEY,
            record_type    TEXT NOT NULL,
            pc_received_ms INTEGER NOT NULL,
            payload_json   TEXT NOT NULL,
            schema_version INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );
        """
    )
    conn.execute(
        "INSERT OR IGNORE INTO schema_version (version) VALUES (?)",
        (DEFAULT_SCHEMA_VERSION,),
    )
    conn.commit()


def close_db(conn: Optional[sqlite3.Connection]) -> None:
    """Safely commit and close the database connection."""
    if conn is not None:
        conn.commit()
        conn.close()


def commit_record(conn: sqlite3.Connection, record: dict) -> str:
    """Commit a durable record to the `records` table.

    The record dict is the full ESP32-originated message. The function
    extracts record_id (envelope), type (envelope) and payload (envelope)
    for storage. Idempotency is enforced by the PRIMARY KEY on record_id:
    a replay of a record_id that already exists returns "duplicate"
    without raising.

    Returns:
        "inserted"  — new record, committed
        "duplicate" — record_id already existed; no action, no error
        "error"     — record could not be stored (missing/invalid fields,
                      unserializable payload, or database error)
    """
    record_id = record.get("record_id")
    if not isinstance(record_id, str) or record_id.strip() == "":
        return "error"

    record_type = record.get("type")
    if not isinstance(record_type, str) or record_type.strip() == "":
        return "error"

    payload = record.get("payload", {})
    try:
        payload_json = json.dumps(payload, sort_keys=True)
    except (TypeError, ValueError):
        return "error"

    received_at_ms = int(time.time() * 1000)

    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO records "
            "(record_id, record_type, pc_received_ms, payload_json, schema_version) "
            "VALUES (?, ?, ?, ?, ?)",
            (record_id, record_type, received_at_ms,
             payload_json, DEFAULT_SCHEMA_VERSION),
        )
        conn.commit()
        return "inserted"
    except sqlite3.IntegrityError:
        # Duplicate record_id — PRIMARY KEY violation (idempotent replay, §12.2)
        return "duplicate"
    except sqlite3.Error:
        conn.rollback()
        return "error"
