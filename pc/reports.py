"""TOUGHENING MACHINE — Report and export skeleton (Phase 2C Stage 2C-3e).

Minimal helpers that consume the existing `records` SQLite table
and return export text. No file I/O. No templates. No scheduling.

Formats implemented here: CSV, JSON.
PDF and Excel are DEFERRED — not implemented in this stage.
"""

import csv
import io
import json
import sqlite3


def _base_query():
    return (
        "SELECT record_id, record_type, pc_received_ms, payload_json "
        "FROM records"
    )


def _time_filter(since_ms=None, until_ms=None):
    """Return (where_sql, params) for inclusive time bounds."""
    clauses = []
    params = []
    if since_ms is not None:
        clauses.append("pc_received_ms >= ?")
        params.append(since_ms)
    if until_ms is not None:
        clauses.append("pc_received_ms <= ?")
        params.append(until_ms)
    if clauses:
        return " WHERE " + " AND ".join(clauses), params
    return "", params


def export_csv(conn: sqlite3.Connection, since_ms=None, until_ms=None) -> str:
    """Return CSV text with columns: record_id, record_type, pc_received_ms, payload_json."""
    where_sql, params = _time_filter(since_ms, until_ms)
    sql = _base_query() + where_sql + " ORDER BY pc_received_ms ASC"
    cursor = conn.execute(sql, params)
    rows = cursor.fetchall()
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["record_id", "record_type", "pc_received_ms", "payload_json"])
    for row in rows:
        writer.writerow(row)
    return output.getvalue()


def export_json(conn: sqlite3.Connection, since_ms=None, until_ms=None) -> str:
    """Return a JSON array of record objects."""
    where_sql, params = _time_filter(since_ms, until_ms)
    sql = _base_query() + where_sql + " ORDER BY pc_received_ms ASC"
    cursor = conn.execute(sql, params)
    rows = cursor.fetchall()
    records = []
    for row in rows:
        record_id, record_type, pc_received_ms, payload_json = row
        try:
            payload = json.loads(payload_json)
        except (TypeError, ValueError):
            payload = None
        records.append({
            "record_id": record_id,
            "record_type": record_type,
            "pc_received_ms": pc_received_ms,
            "payload": payload,
        })
    return json.dumps(records, indent=2)
