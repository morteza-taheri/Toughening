"""Tests for the operator-GUI read model (pc/history.py) and its endpoints."""

import os
import tempfile

from fastapi.testclient import TestClient

from pc import db as pc_db
from pc import history
from pc.server import app


def _conn():
    conn = pc_db.open_db(":memory:")
    pc_db.init_db(conn)
    return conn


def _cycle(conn, rid, sid, end_ms, valid=1, p=1.2):
    pc_db.commit_record(conn, {"record_id": rid, "type": "cycle_summary", "payload": {
        "station_id": sid, "cycle_end_ms": end_ms, "end_time_valid": valid,
        "faulted_channel_count": 0, "duration_ms": 1000,
        "nozzles": [{"nozzle_id": 1, "pressure_avg": p, "temperature_avg": 50.0}]}})


def test_station_history_filters_station_and_window():
    conn = _conn()
    now = history.now_ms()
    _cycle(conn, "a", 1, now - 1000)
    _cycle(conn, "b", 1, now - 13 * 3600 * 1000)   # outside default 12 h
    _cycle(conn, "c", 2, now - 1000)
    data = history.station_history(conn, 1)
    assert [p["record_id"] for p in data["points"]] == ["a"]
    assert data["points"][0]["time_source"] == "device"


def test_invalid_device_time_falls_back_to_pc_time():
    conn = _conn()
    _cycle(conn, "x", 3, 0, valid=0)
    data = history.station_history(conn, 3)
    assert data["points"][0]["time_source"] == "pc"


def test_overview_has_sixteen_stations():
    conn = _conn()
    _cycle(conn, "a", 5, history.now_ms() - 1000)
    ov = history.stations_overview(conn)
    assert len(ov["stations"]) == 16
    assert ov["stations"][4]["cycle_count"] == 1


def test_history_endpoint_rejects_unknown_station():
    client = TestClient(app)
    assert client.get("/api/stations/17/history").status_code == 404


def test_root_serves_console_without_cache():
    client = TestClient(app)
    r = client.get("/")
    assert r.status_code == 200
    assert "/static/console.css" in r.text
    assert r.headers.get("cache-control") == "no-store"
