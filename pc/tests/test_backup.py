import datetime
import os
import sqlite3
import threading
import time

import pytest
from fastapi.testclient import TestClient

import pc.backup
import pc.config
import pc.db as pc_db
import pc.server as server_module
from pc.server import app

CLIENT = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_server_backup_state():
    server_module._backup_stop_event = None
    server_module._backup_thread = None
    yield
    if server_module._backup_stop_event is not None:
        server_module._backup_stop_event.set()
    if server_module._backup_thread is not None:
        server_module._backup_thread.join(timeout=2)
    server_module._backup_stop_event = None
    server_module._backup_thread = None


def _seed_source_db(db_path, records=None):
    conn = pc_db.open_db(db_path)
    pc_db.init_db(conn)
    for rid in (records or []):
        pc_db.commit_record(conn, {
            "record_id": rid,
            "type": "cycle_summary",
            "payload": {"station_id": 1},
        })
    conn.close()


def test_is_destination_available(tmp_path):
    good = tmp_path / "good"
    good.mkdir()
    assert pc.backup.is_destination_available(str(good)) is True
    assert pc.backup.is_destination_available(str(tmp_path / "missing")) is False
    assert pc.backup.is_destination_available(None) is False
    assert pc.backup.is_destination_available("") is False


def test_filename_timestamp_parses_and_rejects():
    parsed = pc.backup._filename_timestamp("backup_20260101_120000.sqlite")
    assert parsed == datetime.datetime(2026, 1, 1, 12, 0, 0)
    assert pc.backup._filename_timestamp("toughening.db") is None
    assert pc.backup._filename_timestamp("backup_notadate.sqlite") is None
    assert pc.backup._filename_timestamp("backup_20260101_120000.txt") is None


def test_make_backup_creates_patterned_file(tmp_path):
    src = tmp_path / "src.sqlite"
    _seed_source_db(str(src), records=["r1"])
    out = tmp_path / "out"
    out.mkdir()
    path = pc.backup.make_backup(str(src), str(out))
    assert path is not None
    name = os.path.basename(path)
    assert name.startswith("backup_") and name.endswith(".sqlite")
    assert pc.backup._filename_timestamp(name) is not None


def test_make_backup_produces_readable_database(tmp_path):
    src = tmp_path / "src.sqlite"
    _seed_source_db(str(src), records=["r1", "r2"])
    out = tmp_path / "out"
    out.mkdir()
    path = pc.backup.make_backup(str(src), str(out))
    assert path is not None
    conn = sqlite3.connect(path)
    try:
        rows = conn.execute("SELECT COUNT(*) FROM records").fetchall()
        assert rows[0][0] == 2
    finally:
        conn.close()


def test_make_backup_skips_missing_source(tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    path = pc.backup.make_backup(str(tmp_path / "nope.sqlite"), str(out))
    assert path is None
    assert list(out.glob("backup_*.sqlite")) == []


def test_enforce_retention_keeps_newest_by_filename(tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    files = [
        "backup_20260101_120000.sqlite",
        "backup_20260102_120000.sqlite",
        "backup_20260103_120000.sqlite",
        "backup_20260104_120000.sqlite",
        "backup_20260105_120000.sqlite",
    ]
    for name in files:
        (out / name).write_bytes(b"x")
    oldest = out / files[0]
    newest = out / files[-1]
    os.utime(str(oldest), (1, 1))
    os.utime(str(newest), (2, 2))
    deleted = pc.backup.enforce_retention(str(out), keep=2)
    assert deleted == 3
    remaining = sorted(p.name for p in out.glob("backup_*.sqlite"))
    assert remaining == files[-2:]


def test_backup_now_unavailable_destination(tmp_path):
    src = tmp_path / "src.sqlite"
    _seed_source_db(str(src), records=["r1"])
    result = pc.backup.backup_now(str(src), str(tmp_path / "missing"), 30)
    assert result["attempted"] is True
    assert result["succeeded"] is False
    assert result["backup_path"] is None
    assert result["reason"] is not None


def test_scheduler_runs_catchup_on_startup(tmp_path):
    src = tmp_path / "src.sqlite"
    _seed_source_db(str(src), records=["r1"])
    out = tmp_path / "out"
    out.mkdir()
    stop = threading.Event()
    pc.backup.start_scheduler(str(src), str(out), 12, 30, stop)
    for _ in range(100):
        if list(out.glob("backup_*.sqlite")):
            break
        time.sleep(0.01)
    assert list(out.glob("backup_*.sqlite"))
    stop.set()
    stop.wait(2)


def test_scheduler_thread_stops_on_stop_event(tmp_path):
    src = tmp_path / "src.sqlite"
    _seed_source_db(str(src), records=["r1"])
    out = tmp_path / "out"
    out.mkdir()
    stop = threading.Event()
    thread = pc.backup.start_scheduler(str(src), str(out), 0, 30, stop)
    stop.set()
    thread.join(timeout=2)
    assert not thread.is_alive()


def test_server_startup_without_backup_dir(monkeypatch):
    monkeypatch.delenv("TOUGHENING_BACKUP_DIR", raising=False)
    monkeypatch.delenv("TOUGHENING_DB_PATH", raising=False)
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
    assert server_module._backup_thread is None


def test_server_startup_with_backup_dir_creates_first_backup(tmp_path, monkeypatch):
    src = tmp_path / "src.sqlite"
    _seed_source_db(str(src), records=["r1"])
    out = tmp_path / "out"
    out.mkdir()
    monkeypatch.setenv("TOUGHENING_DB_PATH", str(src))
    monkeypatch.setenv("TOUGHENING_BACKUP_DIR", str(out))
    monkeypatch.setenv("TOUGHENING_BACKUP_HOUR", "12")
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        for _ in range(200):
            if list(out.glob("backup_*.sqlite")):
                break
            time.sleep(0.01)
        assert list(out.glob("backup_*.sqlite"))
    assert server_module._backup_thread is None