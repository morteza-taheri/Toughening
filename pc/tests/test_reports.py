"""Tests for pc/reports.py (Phase 2C Stage 2C-3e).

Tests cover CSV and JSON export from the existing `records` table.
PDF and Excel export are DEFERRED — not implemented in this stage.
"""

import csv
import io
import json
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from pc import db as pc_db
from pc.reports import export_csv, export_json
import pc.server as server
from pc.server import app

CLIENT = TestClient(app)


def _setup_db():
    """Create a fresh in-memory database for a direct-function test."""
    conn = pc_db.open_db(":memory:")
    pc_db.init_db(conn)
    return conn


def _teardown_db(conn):
    if conn is not None:
        conn.close()


def test_empty_db_csv_has_header_only():
    """An empty database produces a CSV with only the header row."""
    conn = None
    try:
        conn = _setup_db()
        text = export_csv(conn)
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0] == ["record_id", "record_type", "pc_received_ms", "payload_json"]
    finally:
        _teardown_db(conn)


def test_empty_db_json_is_empty_array():
    """An empty database produces an empty JSON array."""
    conn = None
    try:
        conn = _setup_db()
        text = export_json(conn)
        data = json.loads(text)
        assert data == []
    finally:
        _teardown_db(conn)


def test_one_record_csv_has_one_data_row():
    """A single record produces CSV with header + one data row."""
    conn = None
    try:
        conn = _setup_db()
        pc_db.commit_record(conn, {
            "record_id": "r1",
            "type": "cycle_summary",
            "payload": {"station_id": 1},
        })
        text = export_csv(conn)
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "r1"
        assert rows[1][1] == "cycle_summary"
    finally:
        _teardown_db(conn)


def test_one_record_json_has_one_object():
    """A single record produces a JSON array with one object."""
    conn = None
    try:
        conn = _setup_db()
        pc_db.commit_record(conn, {
            "record_id": "r1",
            "type": "cycle_summary",
            "payload": {"station_id": 1},
        })
        text = export_json(conn)
        data = json.loads(text)
        assert len(data) == 1
        assert data[0]["record_id"] == "r1"
        assert data[0]["record_type"] == "cycle_summary"
        assert data[0]["payload"]["station_id"] == 1
    finally:
        _teardown_db(conn)


def test_multiple_records_count():
    """Multiple records are all present in the export."""
    conn = None
    try:
        conn = _setup_db()
        for i in range(5):
            pc_db.commit_record(conn, {
                "record_id": f"r{i}",
                "type": "cycle_summary",
                "payload": {"station_id": i},
            })
        csv_text = export_csv(conn)
        json_text = export_json(conn)
        csv_rows = list(csv.reader(io.StringIO(csv_text)))
        json_data = json.loads(json_text)
        assert len(csv_rows) == 6  # header + 5
        assert len(json_data) == 5
    finally:
        _teardown_db(conn)


def test_time_filter_narrows_results():
    """Since/until bounds filter records correctly."""
    conn = None
    try:
        conn = _setup_db()
        base_ts = 1000000
        for i in range(3):
            conn.execute(
                "INSERT INTO records (record_id, record_type, pc_received_ms, payload_json, schema_version) VALUES (?, ?, ?, ?, ?)",
                (f"r{i}", "cycle_summary", base_ts + i, '{"station_id": %d}' % i, 1),
            )
        conn.commit()
        since_ms = base_ts + 1
        until_ms = base_ts + 2
        csv_text = export_csv(conn, since_ms=since_ms, until_ms=until_ms)
        json_text = export_json(conn, since_ms=since_ms, until_ms=until_ms)
        csv_rows = list(csv.reader(io.StringIO(csv_text)))
        json_data = json.loads(json_text)
        assert len(csv_rows) == 3  # header + 2
        assert len(json_data) == 2
        assert json_data[0]["record_id"] == "r1"
        assert json_data[1]["record_id"] == "r2"
    finally:
        _teardown_db(conn)


def test_csv_endpoint_empty_db():
    """GET /api/export/csv returns header-only CSV on empty DB."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        conn.close()
        os.environ["TOUGHENING_DB_PATH"] = db_path
        response = CLIENT.get("/api/export/csv")
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment" in response.headers["content-disposition"]
        reader = csv.reader(io.StringIO(response.text))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0] == ["record_id", "record_type", "pc_received_ms", "payload_json"]
    finally:
        os.environ.pop("TOUGHENING_DB_PATH", None)
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_json_endpoint_empty_db():
    """GET /api/export/json returns [] on empty DB."""
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
        data = json.loads(response.text)
        assert data == []
    finally:
        os.environ.pop("TOUGHENING_DB_PATH", None)
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_csv_endpoint_with_data():
    """GET /api/export/csv returns valid CSV with data rows."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        pc_db.commit_record(conn, {
            "record_id": "r1",
            "type": "cycle_summary",
            "payload": {"station_id": 1},
        })
        conn.close()
        os.environ["TOUGHENING_DB_PATH"] = db_path
        response = CLIENT.get("/api/export/csv")
        assert response.status_code == 200
        reader = csv.reader(io.StringIO(response.text))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[1][0] == "r1"
        assert rows[1][1] == "cycle_summary"
    finally:
        os.environ.pop("TOUGHENING_DB_PATH", None)
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_json_endpoint_with_data():
    """GET /api/export/json returns valid JSON array with data."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        pc_db.commit_record(conn, {
            "record_id": "r1",
            "type": "cycle_summary",
            "payload": {"station_id": 1},
        })
        conn.close()
        os.environ["TOUGHENING_DB_PATH"] = db_path
        response = CLIENT.get("/api/export/json")
        assert response.status_code == 200
        data = json.loads(response.text)
        assert len(data) == 1
        assert data[0]["record_id"] == "r1"
        assert data[0]["payload"]["station_id"] == 1
    finally:
        os.environ.pop("TOUGHENING_DB_PATH", None)
        if os.path.exists(db_path):
            os.unlink(db_path)


def test_no_pdf_or_excel_in_reports():
    """pc/reports.py imports no PDF or Excel libraries."""
    import inspect
    import pc.reports
    source = inspect.getsource(pc.reports)
    assert "import reportlab" not in source
    assert "import openpyxl" not in source
    assert "import xlsxwriter" not in source
    assert "from reportlab" not in source
    assert "from openpyxl" not in source
