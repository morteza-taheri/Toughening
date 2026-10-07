"""Tests for the GUI History panel and report buttons (Phase 2C Stage 2C-3g-3).

These tests exercise the same endpoints the browser's app.js calls, but
through the exact fetch pattern the GUI uses:

  GET /api/export/json   -> JSON array, newest-first client-side
  GET /api/export/csv    -> CSV text with Content-Disposition attachment

They overlap with pc/tests/test_reports.py on purpose: this file is the
integration check that the GUI fetch contract holds, not a duplicate of
the export unit tests.
"""

import csv
import io
import json
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from pc import db as pc_db
import pc.server as server
from pc.server import app

CLIENT = TestClient(app)


def _seed_db(record_ids):
    """Create a temp DB, init it, and insert len(record_ids) records."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    conn = pc_db.open_db(db_path)
    pc_db.init_db(conn)
    for i, rid in enumerate(record_ids):
        pc_db.commit_record(conn, {
            "record_id": rid,
            "type": "cycle_summary",
            "payload": {"station_id": i},
        })
    conn.close()
    os.environ["TOUGHENING_DB_PATH"] = db_path
    return db_path


def _cleanup(db_path):
    os.environ.pop("TOUGHENING_DB_PATH", None)
    if os.path.exists(db_path):
        os.unlink(db_path)


def test_history_json_empty_db_returns_empty_array():
    """GET /api/export/json returns [] on an empty database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        conn.close()
        os.environ["TOUGHENING_DB_PATH"] = db_path
        response = CLIENT.get("/api/export/json")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        assert json.loads(response.text) == []
    finally:
        _cleanup(db_path)


def test_history_json_returns_all_inserted_records():
    """GET /api/export/json returns every inserted record with the
    expected keys (record_id, record_type, pc_received_ms, payload)."""
    db_path = _seed_db(["r1", "r2", "r3"])
    try:
        response = CLIENT.get("/api/export/json")
        assert response.status_code == 200
        data = json.loads(response.text)
        assert isinstance(data, list)
        assert len(data) == 3
        for record in data:
            assert "record_id" in record
            assert "record_type" in record
            assert "pc_received_ms" in record
            assert "payload" in record
        ids = [r["record_id"] for r in data]
        assert ids == ["r1", "r2", "r3"]
    finally:
        _cleanup(db_path)


def test_history_csv_has_header_and_one_line_per_record():
    """GET /api/export/csv returns the header row plus one line per record."""
    db_path = _seed_db(["r1", "r2"])
    try:
        response = CLIENT.get("/api/export/csv")
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        rows = list(csv.reader(io.StringIO(response.text)))
        assert rows[0] == ["record_id", "record_type", "pc_received_ms", "payload_json"]
        assert len(rows) == 3  # header + 2 records
        assert rows[1][0] == "r1"
        assert rows[2][0] == "r2"
    finally:
        _cleanup(db_path)


def test_history_csv_response_has_attachment_header():
    """GET /api/export/csv sets Content-Disposition: attachment;
    filename="records.csv" so the browser downloads rather than navigating."""
    db_path = _seed_db(["r1"])
    try:
        response = CLIENT.get("/api/export/csv")
        disposition = response.headers["content-disposition"]
        assert "attachment" in disposition
        assert 'filename="records.csv"' in disposition
    finally:
        _cleanup(db_path)