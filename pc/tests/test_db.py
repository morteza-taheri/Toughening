"""Focused unit tests for pc/db.py (Phase 2C Stage 2).

These tests use temp-file databases — not the server — to verify the
SQLite persistence layer directly. No sensor, calibration, or hardware
values appear anywhere in this file.
"""

import json
import os
import tempfile

import pytest

from pc import db


@pytest.fixture
def temp_db():
    """Create a fresh SQLite database for each test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    conn = db.open_db(path)
    db.init_db(conn)
    yield conn, path
    db.close_db(conn)
    os.close(fd)
    os.unlink(path)
    for ext in ("wal", "shm"):
        sidecar = f"{path}-{ext}"
        if os.path.exists(sidecar):
            os.unlink(sidecar)


def test_init_db_creates_tables(temp_db):
    """init_db creates `records` and `schema_version` and sets version = 1."""
    conn, _ = temp_db
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    table_names = [row[0] for row in tables]
    assert "records" in table_names
    assert "schema_version" in table_names
    version = conn.execute("SELECT version FROM schema_version").fetchone()
    assert version[0] == 1


def test_init_db_idempotent(temp_db):
    """Calling init_db twice does not error or duplicate schema_version."""
    conn, _ = temp_db
    db.init_db(conn)  # second call should be a no-op
    versions = conn.execute(
        "SELECT COUNT(*) FROM schema_version"
    ).fetchone()[0]
    assert versions == 1


def test_commit_record_inserts_row(temp_db):
    """A new record_id is inserted and the row is retrievable."""
    conn, _ = temp_db
    record = {
        "record_id": "esp32-01:<boot>:1",
        "type": "cycle_summary",
        "payload": {"event_time": 0, "duration_ms": 0, "duration_basis": "calendar"},
    }
    result = db.commit_record(conn, record)
    assert result == "inserted"

    row = conn.execute(
        "SELECT record_id, record_type, payload_json, schema_version "
        "FROM records WHERE record_id = ?",
        ("esp32-01:<boot>:1",),
    ).fetchone()
    assert row is not None
    assert row[0] == "esp32-01:<boot>:1"
    assert row[1] == "cycle_summary"
    assert json.loads(row[2]) == record["payload"]
    assert row[3] == 1


def test_commit_record_duplicate(temp_db):
    """Inserting the same record_id twice returns 'duplicate' and
    creates exactly one row."""
    conn, _ = temp_db
    record = {
        "record_id": "esp32-01:<boot>:dup",
        "type": "alarm_event",
        "payload": {"event_time": 0},
    }
    assert db.commit_record(conn, record) == "inserted"
    assert db.commit_record(conn, record) == "duplicate"

    count = conn.execute(
        "SELECT COUNT(*) FROM records WHERE record_id = ?",
        ("esp32-01:<boot>:dup",),
    ).fetchone()[0]
    assert count == 1


def test_commit_record_malformed(temp_db):
    """Missing record_id, missing type, unserializable payload → 'error'."""
    conn, _ = temp_db

    # Missing record_id
    assert db.commit_record(conn, {"type": "cycle_summary", "payload": {}}) == "error"

    # Empty-string record_id
    assert db.commit_record(conn, {"record_id": "", "type": "test", "payload": {}}) == "error"

    # Missing type
    assert db.commit_record(conn, {"record_id": "x", "payload": {}}) == "error"

    # Unserializable payload (set is not JSON-encodable)
    assert db.commit_record(
        conn, {"record_id": "x", "type": "test", "payload": {"bad": {1, 2}}}
    ) == "error"

    # Nothing should have been inserted
    count = conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
    assert count == 0


def test_wal_two_connections_see_same_data(temp_db):
    """Two separate connections to the same file see committed data (WAL)."""
    conn1, path = temp_db
    record = {
        "record_id": "esp32-01:<boot>:wal",
        "type": "system_event",
        "payload": {"event_code": "test"},
    }
    assert db.commit_record(conn1, record) == "inserted"

    conn2 = db.open_db(path)
    row = conn2.execute(
        "SELECT record_id, record_type FROM records WHERE record_id = ?",
        ("esp32-01:<boot>:wal",),
    ).fetchone()
    assert row is not None
    assert row[0] == "esp32-01:<boot>:wal"
    assert row[1] == "system_event"
    db.close_db(conn2)
