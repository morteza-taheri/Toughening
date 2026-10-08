"""TOUGHENING MACHINE — history read-model for the operator GUI (Phase 2C).

Read-only helpers over the existing minimal `records` table. Nothing here
writes to the database and no new table is created (the per-type schema
of spec §14 is still PROPOSED — NOT APPROVED).

Time base for a point (presentation only, stored timestamps stay UTC):

  * cycle_summary  -> payload.cycle_end_ms when end_time_valid == 1,
                      otherwise pc_received_ms
  * other records  -> payload.event_time  when event_time_valid == 1,
                      otherwise pc_received_ms

`time_source` on every returned point says which one was used
("device" or "pc"), so the GUI can label PC-time fallbacks honestly.
"""

import json
import sqlite3
import time
from typing import Iterable, Optional

STATION_COUNT = 16
DEFAULT_WINDOW_MS = 12 * 60 * 60 * 1000  # GUI default: 12 hours
MAX_POINTS = 2000
SPARK_POINTS = 48

EVENT_TYPES = (
    "alarm_event",
    "system_event",
    "settings_change",
    "interrupted_cycle",
    "data_loss",
    "raw_voltage_record",
)

NOZZLE_FIELDS = (
    "nozzle_id",
    "pressure_avg", "pressure_min", "pressure_max",
    "temperature_avg", "temperature_min", "temperature_max",
    "valid_samples_pressure", "valid_samples_temperature",
    "temp_conversion_configured",
)


def now_ms() -> int:
    return int(time.time() * 1000)


def resolve_window(since_ms: Optional[int], until_ms: Optional[int]):
    """Return (since, until); default is the last 12 hours."""
    until = until_ms if until_ms is not None else now_ms()
    since = since_ms if since_ms is not None else until - DEFAULT_WINDOW_MS
    if since > until:
        since, until = until, since
    return since, until


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    return None


def _cycle_time(payload: dict, pc_received_ms: int):
    end = payload.get("cycle_end_ms")
    if payload.get("end_time_valid") == 1 and _is_int(end) and end > 0:
        return end, "device"
    return pc_received_ms, "pc"


def _event_time(payload: dict, pc_received_ms: int):
    t = payload.get("event_time")
    if payload.get("event_time_valid") == 1 and _is_int(t) and t > 0:
        return t, "device"
    if record_cycle_start(payload):
        return payload["cycle_start_ms"], "device"
    return pc_received_ms, "pc"


def record_cycle_start(payload: dict) -> bool:
    s = payload.get("cycle_start_ms")
    return payload.get("start_time_valid") == 1 and _is_int(s) and s > 0


def _loads(text):
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _downsample(points: list, limit: int) -> list:
    if len(points) <= limit:
        return points
    step = len(points) / float(limit)
    return [points[int(i * step)] for i in range(limit)]


def _nozzles(payload: dict) -> list:
    out = []
    for n in payload.get("nozzles") or []:
        if not isinstance(n, dict):
            continue
        row = {}
        for key in NOZZLE_FIELDS:
            val = n.get(key)
            row[key] = val if key in ("nozzle_id", "temp_conversion_configured") else _num(val)
        out.append(row)
    return out


def _cycle_rows(conn: sqlite3.Connection, station_id: Optional[int] = None):
    sql = ("SELECT record_id, pc_received_ms, payload_json FROM records "
           "WHERE record_type = 'cycle_summary'")
    params = []
    if station_id is not None:
        sql += " AND json_extract(payload_json, '$.station_id') = ?"
        params.append(station_id)
    for record_id, received, text in conn.execute(sql, params):
        payload = _loads(text)
        if payload is None:
            continue
        t, src = _cycle_time(payload, received)
        yield record_id, t, src, payload


def station_history(conn, station_id: int, since_ms=None, until_ms=None,
                    limit: int = MAX_POINTS) -> dict:
    """All cycle_summary points of one station inside the window."""
    since, until = resolve_window(since_ms, until_ms)
    points = []
    for record_id, t, src, payload in _cycle_rows(conn, station_id):
        if since <= t <= until:
            points.append({
                "t": t,
                "time_source": src,
                "record_id": record_id,
                "duration_ms": _num(payload.get("duration_ms")),
                "duration_basis": payload.get("duration_basis"),
                "faulted_channel_count": _num(payload.get("faulted_channel_count")),
                "nozzles": _nozzles(payload),
            })
    points.sort(key=lambda p: p["t"])
    total = len(points)
    return {
        "station_id": station_id,
        "since_ms": since,
        "until_ms": until,
        "total_points": total,
        "downsampled": total > limit,
        "points": _downsample(points, limit),
    }


def _first_nozzle_value(payload: dict, key: str):
    for n in payload.get("nozzles") or []:
        if isinstance(n, dict) and _num(n.get(key)) is not None:
            return _num(n.get(key))
    return None


def stations_overview(conn, since_ms=None, until_ms=None) -> dict:
    """Per-station cycle count, last cycle and a small pressure sparkline."""
    since, until = resolve_window(since_ms, until_ms)
    buckets = {sid: [] for sid in range(1, STATION_COUNT + 1)}
    for _rid, t, _src, payload in _cycle_rows(conn):
        sid = payload.get("station_id")
        if not _is_int(sid) or sid not in buckets or not (since <= t <= until):
            continue
        buckets[sid].append((t, payload))
    stations = []
    for sid, rows in buckets.items():
        rows.sort(key=lambda r: r[0])
        spark = [
            {"t": t, "p": _first_nozzle_value(p, "pressure_avg"),
             "c": _first_nozzle_value(p, "temperature_avg")}
            for t, p in rows
        ]
        last = rows[-1] if rows else None
        stations.append({
            "station_id": sid,
            "cycle_count": len(rows),
            "fault_cycles": sum(1 for _t, p in rows
                                if (_num(p.get("faulted_channel_count")) or 0) > 0),
            "last_cycle_ms": last[0] if last else None,
            "last_duration_ms": _num(last[1].get("duration_ms")) if last else None,
            "spark": _downsample(spark, SPARK_POINTS),
        })
    return {"since_ms": since, "until_ms": until, "stations": stations}


def events(conn, since_ms=None, until_ms=None, types: Optional[Iterable[str]] = None,
           limit: int = 500) -> dict:
    """Non-cycle durable records, newest first."""
    since, until = resolve_window(since_ms, until_ms)
    wanted = [t for t in (types or EVENT_TYPES) if t in EVENT_TYPES] or list(EVENT_TYPES)
    marks = ",".join("?" for _ in wanted)
    sql = ("SELECT record_id, record_type, pc_received_ms, payload_json FROM records "
           f"WHERE record_type IN ({marks})")
    items = []
    for record_id, rtype, received, text in conn.execute(sql, wanted):
        payload = _loads(text) or {}
        t, src = _event_time(payload, received)
        if since <= t <= until:
            items.append({"record_id": record_id, "record_type": rtype, "t": t,
                          "time_source": src, "pc_received_ms": received,
                          "payload": payload})
    items.sort(key=lambda e: e["t"], reverse=True)
    return {"since_ms": since, "until_ms": until, "total": len(items),
            "events": items[:max(1, min(limit, 5000))]}


def summary(conn, since_ms=None, until_ms=None) -> dict:
    """Record counts per type inside the window (report preview)."""
    since, until = resolve_window(since_ms, until_ms)
    counts = {}
    per_station = {sid: 0 for sid in range(1, STATION_COUNT + 1)}
    rows = conn.execute("SELECT record_type, pc_received_ms, payload_json FROM records")
    for rtype, received, text in rows:
        payload = _loads(text) or {}
        if rtype == "cycle_summary":
            t, _ = _cycle_time(payload, received)
        else:
            t, _ = _event_time(payload, received)
        if not (since <= t <= until):
            continue
        counts[rtype] = counts.get(rtype, 0) + 1
        sid = payload.get("station_id")
        if rtype == "cycle_summary" and _is_int(sid) and sid in per_station:
            per_station[sid] += 1
    return {"since_ms": since, "until_ms": until, "counts": counts,
            "total": sum(counts.values()),
            "cycles_per_station": [{"station_id": k, "cycles": v}
                                   for k, v in per_station.items()]}
