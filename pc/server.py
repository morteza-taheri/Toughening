"""TOUGHENING MACHINE — PC side WebSocket server (Phase 2C Stage 2C-3f).

APPROVED — Phase 2C is authorized as a software-only continuation of
Phase 2A. Hardware phases (3+) remain NOT AUTHORIZED.
See docs/PROJECT_SPECIFICATION.md §12, §15 and
docs/PROTOCOL_CONTRACT.md v1.1.1.

This module validates the message envelope and payload, persists durable
records to SQLite (commit-before-ACK), and dispatches by type.

Phase 2C Stage 1 added payload-level validation and Contract v1.1.0
support (reset_command / reset_result, alarm_state / warning_state).
Phase 2C Stage 2 adds minimal SQLite persistence: commit-before-ACK and
idempotent replay (§12.2).
Phase 2C Stage 2C-3f adds the PC envelope (Decision Round E): every
server-emitted ack, nack and error reply carries `pc_id`, `pc_seq`,
`ts_sent_ms`, `ts_sent_valid` and a `payload` object per Contract
v1.1.1 §3.1, §3.17, §3.18, §3.19.

Where a decision would eventually be needed, a comment names the
OPEN item instead of choosing a value.
"""

import json
import logging
import sys
import threading
import time
from pathlib import Path

# Allow `python pc/server.py` (not only `python -m pc.server`): make the repo
# root importable so `from pc import ...` works from any working directory.
_REPO_ROOT = str(Path(__file__).resolve().parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
from typing import Optional, Tuple
import asyncio

import uvicorn
from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.requests import Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pc import db as pc_db
import pc.reports
import pc.config
import pc.backup
import pc.history
import pc.admin as pc_admin

app = FastAPI(title="Toughening Machine PC side (Phase 2C Stage 2C-3i)")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root() -> FileResponse:
    """Operator console (Phase 2C). no-store so a replaced build is never
    hidden behind a stale browser cache."""
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={"Cache-Control": "no-store"},
    )


# ---------------------------------------------------------------------------
# Admin panel (DR-50, Phase 2C-3i, PC-side only, HTTP Basic Auth, loopback)
# ---------------------------------------------------------------------------
# Every admin route uses pc_admin.require_local_admin, which checks the
# loopback address FIRST and only then verifies Basic Auth (the old code
# authenticated first and checked loopback afterwards).

@app.get("/api/admin/status")
async def admin_status_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """Return admin status (loopback-only)."""
    pc_admin.admin_log("status", detail="ok", user=admin["username"])
    return pc_admin.get_status()


@app.get("/api/admin/backups")
async def admin_backups_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """List backups (loopback-only)."""
    pc_admin.admin_log("backups_list", detail="ok", user=admin["username"])
    return pc_admin.get_backups()


@app.get("/api/admin/backups/{name}")
async def admin_backup_download_endpoint(
    name: str,
    admin: dict = Depends(pc_admin.require_local_admin),
):
    """Download one backup file (loopback-only, strict file-name check)."""
    path = pc_admin.backup_file_path(name)
    if path is None:
        raise HTTPException(status_code=404, detail="backup not found")
    pc_admin.admin_log("backup_download", detail=name, user=admin["username"])
    return FileResponse(path, filename=name, media_type="application/vnd.sqlite3",
                        headers={"Cache-Control": "no-store"})


@app.post("/api/admin/backup")
async def admin_trigger_backup_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """Trigger a backup (loopback-only)."""
    pc_admin.admin_log("backup_trigger", detail="requested", user=admin["username"])
    try:
        result = await asyncio.to_thread(pc_admin.trigger_backup)
        pc_admin.admin_log("backup_done", detail=f"path={result.get('path', '')}", user=admin["username"])
        return result
    except ValueError as e:
        pc_admin.admin_log("backup_error", detail=str(e), user=admin["username"])
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/admin/db")
async def admin_db_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """Per-type record statistics and database file information."""
    return await asyncio.to_thread(pc_admin.db_overview)


@app.post("/api/admin/db/check")
async def admin_db_check_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """Run a read-only SQLite integrity check (PRAGMA quick_check)."""
    result = await asyncio.to_thread(pc_admin.db_integrity_check)
    pc_admin.admin_log("db_check", detail="ok" if result["ok"] else "FAILED", user=admin["username"])
    return result


@app.get("/api/admin/records")
async def admin_records_endpoint(
    type: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """Browse stored records, newest first (read-only)."""
    return await asyncio.to_thread(pc_admin.list_records, type, q, limit, offset)


@app.get("/api/admin/audit")
async def admin_audit_endpoint(
    lines: int = 200,
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """Tail of the admin audit log (one-time password redacted)."""
    return pc_admin.audit_tail(lines)


@app.get("/api/admin/device")
async def admin_device_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """ESP32 link status as seen by this server."""
    return device_status_snapshot()


@app.get("/api/admin/settings")
async def admin_settings_get_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    pc_admin.admin_log("settings_read", detail="ok", user=admin["username"])
    return pc_admin.get_config_settings()


@app.put("/api/admin/settings")
async def admin_settings_put_endpoint(
    request: Request,
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    try:
        body = await request.json()
        updates = body.get("settings") if isinstance(body, dict) else None
        if not isinstance(updates, dict) or not updates:
            raise ValueError("settings must be a non-empty object")
        result = pc_admin.update_config_settings(updates)
        _restart_backup_scheduler_from_config()
        pc_admin.admin_log("settings_updated",
                           detail="keys=" + ",".join(sorted(updates)),
                           user=admin["username"])
        return result
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/admin/logout")
async def admin_logout_endpoint(
    admin: dict = Depends(pc_admin.require_local_admin),
) -> dict:
    """Logout (loopback-only, clears session)."""
    pc_admin.admin_log("logout", detail="ok", user=admin["username"])
    pc_admin.clear_auth_cache()
    # Return 401 to force browser to clear cached credentials
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        headers={"WWW-Authenticate": 'Basic realm="toughening-admin"'},
    )


@app.get("/admin", include_in_schema=False)
async def admin_page(admin: dict = Depends(pc_admin.require_local_admin)):
    """Serve admin HTML page (loopback-only)."""
    return FileResponse(
        STATIC_DIR / "admin.html",
        headers={"Cache-Control": "no-store"},
    )


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("pc.server")

SERVER_VERSION = "0.1.0"
PROTOCOL_VERSION = "1.1.1"

# SQLite persistence (Phase 2C Stage 2). Lazily initialised by
# init_persistence(); tests set this directly via a fixture.
_db_conn = None

# PC envelope state (Decision Round E, Contract v1.1.1 §3.1).
_pc_seq = 0
PC_ID = "pc-01"

# GUI WebSocket broadcast state (Phase 2C Stage 2C-3g-2).
_gui_clients: set = set()
_gui_lock = asyncio.Lock()
GUI_SEND_TIMEOUT_S = 2.0
# Strong references to fire-and-forget tasks (asyncio only keeps weak ones).
_background_tasks: set = set()

# ESP32 link status (exposed read-only on /api/device/status). Kept out of
# /ws/gui on purpose: GUI sockets only ever carry live_state frames.
_device_state = {
    "connected": False,
    "connections": 0,
    "host": None,
    "connected_at_ms": None,
    "disconnected_at_ms": None,
    "last_message_ms": None,
    "last_live_state_ms": None,
    "messages_received": 0,
    "messages_rejected": 0,
    "device_id": None,
    "boot_id": None,
    "firmware_version": None,
    "protocol_versions_supported": None,
    "last_reject_reason": None,
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def device_status_snapshot() -> dict:
    """Return a copy of the device link status with derived ages."""
    snap = dict(_device_state)
    now = _now_ms()
    last = snap.get("last_message_ms")
    snap["last_message_age_ms"] = (now - last) if last else None
    snap["gui_clients"] = len(_gui_clients)
    snap["server_time_ms"] = now
    return snap


def _spawn(coro) -> None:
    """Schedule a coroutine from sync code; no-op without a running loop
    (dispatch() is also called directly by unit tests)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        coro.close()
        return
    task = loop.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

# Daily backup scheduler state (Phase 2C Stage 2C-3h, DR-18).
# The scheduler is optional: it only starts when a backup_dir is
# configured AND available at startup. If the destination is missing
# or unwritable, a warning is logged and the server still starts.
# NOTE: @app.on_event("startup"/"shutdown") is deprecated in newer
# FastAPI; the preferred migration is a `lifespan` context manager.
# That migration is DEFERRED to a future cleanup — not now.
_backup_stop_event = None
_backup_thread = None


@app.on_event("startup")
async def _start_backup_scheduler():
    """Start the daily backup scheduler if a destination is configured.

    DR-18: a missing or unavailable destination produces a clear warning
    but does NOT prevent the server from starting.
    """
    global _backup_stop_event, _backup_thread
    # DR-50: create the admin config (and the one-time password in the audit
    # log) on first start. Nothing used to create it, so /admin was always 503.
    if not pc_admin.CONFIG_PATH.exists():
        if pc_admin.ensure_config():
            log.warning("admin config created at %s; the one-time admin password "
                        "is in %s (unless TOUGHENING_ADMIN_DEFAULT_PASS was set)",
                        pc_admin.CONFIG_PATH, pc_admin.LOG_PATH)
        else:
            log.error("could not create admin config at %s", pc_admin.CONFIG_PATH)
    cfg = pc.config.load_config()
    backup_dir = cfg.get("backup_dir")
    if backup_dir and pc.backup.is_destination_available(backup_dir):
        _backup_stop_event = threading.Event()
        _backup_thread = pc.backup.start_scheduler(
            pc_db.get_db_path(),
            backup_dir,
            cfg.get("backup_hour"),
            cfg.get("backup_retention"),
            _backup_stop_event,
        )
        log.info("backup scheduler started: dir=%s hour=%s retention=%s",
                 backup_dir, cfg.get("backup_hour"),
                 cfg.get("backup_retention"))
    else:
        log.warning(
            "backup destination unavailable or not configured; "
            "daily backup scheduler not started (DR-18). "
            "Set TOUGHENING_BACKUP_DIR or pc/config.json 'backup_dir'."
        )


@app.on_event("shutdown")
async def _stop_backup_scheduler():
    """Signal the backup scheduler to stop and join with a short timeout."""
    global _backup_stop_event, _backup_thread
    if _backup_stop_event is not None:
        _backup_stop_event.set()
    if _backup_thread is not None:
        _backup_thread.join(timeout=pc.backup.SCHEDULER_JOIN_TIMEOUT)
    _backup_stop_event = None
    _backup_thread = None


def _restart_backup_scheduler_from_config():
    """Apply backup settings without requiring a server restart."""
    global _backup_stop_event, _backup_thread
    if _backup_stop_event is not None:
        _backup_stop_event.set()
    if _backup_thread is not None:
        _backup_thread.join(timeout=pc.backup.SCHEDULER_JOIN_TIMEOUT)
    _backup_stop_event = None
    _backup_thread = None
    cfg = pc.config.load_config()
    backup_dir = cfg.get("backup_dir")
    if backup_dir and pc.backup.is_destination_available(backup_dir):
        _backup_stop_event = threading.Event()
        _backup_thread = pc.backup.start_scheduler(
            pc_db.get_db_path(), backup_dir, cfg.get("backup_hour"),
            cfg.get("backup_retention"), _backup_stop_event)


def init_persistence(db_path: Optional[str] = None):
    """Open the database, create tables, and store the connection.

    Safe to call multiple times; only the first call opens a connection.
    """
    global _db_conn
    if _db_conn is None:
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        _db_conn = conn
    return _db_conn


def build_pc_envelope(msg_type: str, payload: dict) -> dict:
    """Build a PC-originated envelope per Contract v1.1.1 §3.1.

    Returns a complete message dict with pc_id, pc_seq, ts_sent_ms,
    ts_sent_valid and payload. pc_seq is monotonic per PC process.
    """
    global _pc_seq
    envelope = {
        "protocol_version": PROTOCOL_VERSION,
        "type": msg_type,
        "pc_id": PC_ID,
        "pc_seq": _pc_seq,
        "ts_sent_ms": int(time.time() * 1000),
        "ts_sent_valid": 1,
        "payload": payload,
    }
    _pc_seq += 1
    return envelope


def validate_pc_envelope(message: dict) -> Tuple[bool, Optional[str]]:
    """Validate a PC-originated envelope against Contract v1.1.1 §3.1.

    Returns (True, None) when valid, otherwise (False, reason).
    """
    if not isinstance(message, dict):
        return False, "message_is_not_an_object"

    required = (
        "protocol_version",
        "type",
        "pc_id",
        "pc_seq",
        "ts_sent_ms",
        "ts_sent_valid",
        "payload",
    )
    for field in required:
        if field not in message:
            return False, f"missing_field:{field}"

    if not isinstance(message["protocol_version"], str):
        return False, "wrong_type:protocol_version"
    if not isinstance(message["type"], str):
        return False, "wrong_type:type"
    if not isinstance(message["pc_id"], str):
        return False, "wrong_type:pc_id"
    if not isinstance(message["pc_seq"], int) or isinstance(message["pc_seq"], bool):
        return False, "wrong_type:pc_seq"
    if not isinstance(message["ts_sent_ms"], int) or isinstance(message["ts_sent_ms"], bool):
        return False, "wrong_type:ts_sent_ms"
    if message["ts_sent_valid"] not in (0, 1):
        return False, "wrong_type:ts_sent_valid"
    if not isinstance(message["payload"], dict):
        return False, "wrong_type:payload"

    return True, None


# PROTOCOL_CONTRACT.md v1.1.1 §3.1 — envelope fields required on every
# ESP32-originated message. Presence and type are validated; VALUES are
# not interpreted (see the OPEN-item comments in dispatch()).
REQUIRED_ENVELOPE_FIELDS = (
    "protocol_version",
    "type",
    "message_id",
    "device_id",
    "boot_id",
    "seq",
    "ts_sent_ms",
    "ts_sent_valid",
    "payload",
)

# Fields whose JSON type is fixed by the contract.
STRING_FIELDS = ("protocol_version", "type", "message_id", "device_id", "boot_id")
INTEGER_FIELDS = ("seq", "ts_sent_ms", "ts_sent_valid")

# Types that carry a durable record and are acknowledged (§12.1).
DURABLE_TYPES = (
    "cycle_summary",
    "alarm_event",
    "system_event",
    "settings_change",
    "interrupted_cycle",
    "data_loss",
    "raw_voltage_record",
)

KNOWN_TYPES = DURABLE_TYPES + (
    "hello",
    "live_state",
    "batch",
    "time_sync_reply",
    "config_result",
    "reset_command",
    "reset_result",
)

# ---------------------------------------------------------------------------
# Payload schema registry — PROTOCOL_CONTRACT.md v1.1.1 §3.2
# ---------------------------------------------------------------------------
# Each entry defines required and optional payload fields and their type
# specs. Type specs: "str", "int", "bool", "number", "null",
#   "int_or_null", "number_or_null", "str_or_null", "bool_or_null",
#   "list", "list_of_str", "list_of_obj", "obj", "obj_or_null".
#
# The nack reason vocabulary is PROPOSED (contract §8 item 3 — OPEN):
#   "invalid_payload"     — missing field, wrong type, empty string
#   "deprecated_alias"    — `time` or `time_valid` found as a field name
#   "invalid_value"       — enum or literal value outside its allowed set
#   "invariant_violated"  — structural invariant (e.g. DR-03b) violated

DEPRECATED_ALIASES = {"time", "time_valid"}

PAYLOAD_SCHEMAS = {
    "hello": {
        "required": {
            "firmware_version": "str",
            "protocol_versions_supported": "list_of_str",
            "boot_id": "str",
            "station_count": "int",
            "channel_count": "int",
        },
        "optional": {},
        "enums": {},
        "invariant": None,
    },
    "live_state": {
        "required": {
            "event_time": "int_or_null",
            "event_time_valid": "int",
            "stations": "list_of_obj",
            "invalid_channel_count_now": "int",
            "volatile_loss_counter": "int",
            "data_loss_pending": "bool",
            "journal_pressure_indicator": "bool",
            "alarm_state": "str",
            "warning_state": "str",
        },
        "optional": {},
        "enums": {
            "alarm_state": {"inactive", "active"},
            "warning_state": {"inactive", "active", "acknowledged"},
        },
        "invariant": None,
    },
    "cycle_summary": {
        "required": {
            "station_id": "int",
            "nozzles": "list",
            "cycle_start_ms": "int_or_null",
            "start_time_valid": "int",
            "cycle_end_ms": "int_or_null",
            "end_time_valid": "int",
            "duration_ms": "int_or_null",
            "duration_basis": "str",
            "faulted_channel_count": "int",
            "fault_transition_count": "null",
            "valid_samples_pressure_both_nozzles": "int_or_null",
            "valid_samples_temperature_both_nozzles": "int_or_null",
        },
        "optional": {},
        "enums": {
            "duration_basis": {"null", "calendar", "uptime_same_boot"},
        },
        "invariant": "dr03b",
    },
    "alarm_event": {
        "required": {
            "event_time": "int_or_null",
            "event_time_valid": "int",
            "channel_id": "int",
            "station_id": "int",
            "nozzle_id": "int",
            "alarm_state": "str",
            "physical_output_state": "str",
            "raw_voltage": "number",
        },
        "optional": {},
        "enums": {},
        "invariant": None,
    },
    "system_event": {
        "required": {
            "event_time": "int_or_null",
            "event_time_valid": "int",
            "event_code": "str",
        },
        "optional": {
            "detail": "obj",
        },
        "enums": {},
        "invariant": None,
    },
    "settings_change": {
        "required": {
            "event_time": "int_or_null",
            "event_time_valid": "int",
            "change_source": "str",
            "settings_affected": "list_of_str",
        },
        "optional": {
            "old_value": "obj",
            "new_value": "obj",
        },
        "enums": {},
        "invariant": None,
    },
    "interrupted_cycle": {
        "required": {
            "station_id": "int",
            "status": "str",
            "cycle_start_ms": "int_or_null",
            "start_time_valid": "int",
            "cycle_end_ms": "null",
            "end_time_valid": "int",
            "duration_ms": "null",
            "duration_basis": "str",
        },
        "optional": {
            "detection_basis": "str_or_null",
        },
        "enums": {
            "status": {"interrupted"},
            "duration_basis": {"null"},
        },
        "invariant": None,
    },
    "data_loss": {
        "required": {
            "event_time": "int_or_null",
            "event_time_valid": "int",
            "overwrite_priority": "str",
            "records_overwritten": "int",
            "overwrite_counters_durable": "bool",
            "evicted_record_ids": "null",
        },
        "optional": {},
        "enums": {},
        "invariant": None,
    },
    "raw_voltage_record": {
        "required": {
            "event_time": "int_or_null",
            "event_time_valid": "int",
            "channel_id": "int",
            "raw_voltage": "number",
            "sample_count": "int",
            "conversion_result": "null",
        },
        "optional": {},
        "enums": {},
        "invariant": None,
    },
    "time_sync": {
        "required": {
            "pc_time_ms": "int",
            "pc_time_valid": "int",
        },
        "optional": {},
        "enums": {},
        "invariant": None,
    },
    "time_sync_reply": {
        "required": {
            "clock_offset_ms": "int",
            "uptime_ms": "int",
        },
        "optional": {},
        "enums": {},
        "invariant": None,
    },
    "config_set": {
        "required": {
            "config_kind": "str",
        },
        "optional": {
            "request_id": "str",
            "channel_id": "int",
            "conversion_mode": "str",
            "points": "list",
            "valid_window": "obj",
            "polarity": "str",
            "hysteresis": "number",
            "debounce": "number",
        },
        "enums": {},
        "invariant": None,
    },
    "config_result": {
        "required": {
            "config_id": "str",
            "accepted": "bool",
            "rejected_fields": "list_of_str",
        },
        "optional": {
            "request_id": "str",
            "rejection_reason": "str",
        },
        "enums": {},
        "invariant": None,
    },
    "batch": {
        "required": {
            "records": "list_of_obj",
            "record_count": "int",
            "has_more": "bool",
        },
        "optional": {},
        "enums": {},
        "invariant": None,
    },
    "ack": {
        "required": {
            "committed": "bool",
        },
        "optional": {
            "acked_record_id": "str",
            "acked_record_ids": "list_of_str",
            "acked_message_id": "str",
        },
        "enums": {},
        "invariant": None,
    },
    "nack": {
        "required": {
            "nacked_record_id": "str",
            "reason": "str",
            "retryable": "bool",
        },
        "optional": {
            "nacked_message_id": "str",
        },
        "enums": {},
        "invariant": None,
    },
    "reset_command": {
        "required": {
            "target": "str",
            "pc_id": "str",
        },
        "optional": {
            "request_id": "str",
        },
        "enums": {
            "target": {"alarm", "warning", "all"},
        },
        "invariant": None,
    },
    "reset_result": {
        "required": {
            "accepted": "bool",
            "alarm_state": "str",
            "warning_state": "str",
        },
        "optional": {
            "request_id": "str",
        },
        "enums": {
            "alarm_state": {"inactive", "active"},
            "warning_state": {"inactive", "active", "acknowledged"},
        },
        "invariant": None,
    },
}


@app.get("/health")
async def health() -> dict:
    """Liveness probe. Returns a fixed skeleton version."""
    return {"status": "ok", "version": SERVER_VERSION}


@app.get("/api/device/status")
async def device_status_endpoint() -> dict:
    """ESP32 link status for the operator console (read-only)."""
    return device_status_snapshot()


@app.get("/api/export/csv")
async def export_csv_endpoint(
    since: Optional[int] = None,
    until: Optional[int] = None,
) -> Response:
    """Export records as CSV.

    Time bounds are inclusive. None means no bound.
    """
    conn = pc_db.open_db()
    pc_db.init_db(conn)
    try:
        text = pc.reports.export_csv(conn, since_ms=since, until_ms=until)
        return Response(
            content=text,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="records.csv"'},
        )
    finally:
        pc_db.close_db(conn)


@app.get("/api/export/json")
async def export_json_endpoint(
    since: Optional[int] = None,
    until: Optional[int] = None,
) -> Response:
    """Export records as JSON.

    Time bounds are inclusive. None means no bound.
    """
    conn = pc_db.open_db()
    pc_db.init_db(conn)
    try:
        text = pc.reports.export_json(conn, since_ms=since, until_ms=until)
        return Response(content=text, media_type="application/json")
    finally:
        pc_db.close_db(conn)


# ---------------------------------------------------------------------------
# Operator GUI read API (Phase 2C). Read-only views over `records`.
# Window bounds are UTC epoch ms, inclusive; default = last 12 hours.
# ---------------------------------------------------------------------------

def _read_conn():
    conn = pc_db.open_db()
    pc_db.init_db(conn)
    return conn


@app.get("/api/stations/overview")
async def stations_overview_endpoint(
    since: Optional[int] = None,
    until: Optional[int] = None,
) -> dict:
    conn = _read_conn()
    try:
        return pc.history.stations_overview(conn, since, until)
    finally:
        pc_db.close_db(conn)


@app.get("/api/stations/{station_id}/history")
async def station_history_endpoint(
    station_id: int,
    since: Optional[int] = None,
    until: Optional[int] = None,
) -> Response:
    if not 1 <= station_id <= pc.history.STATION_COUNT:
        return Response(status_code=404, content='{"error":"unknown_station"}',
                        media_type="application/json")
    conn = _read_conn()
    try:
        data = pc.history.station_history(conn, station_id, since, until)
        return Response(content=json.dumps(data), media_type="application/json")
    finally:
        pc_db.close_db(conn)


@app.get("/api/events")
async def events_endpoint(
    since: Optional[int] = None,
    until: Optional[int] = None,
    types: Optional[str] = None,
    limit: int = 500,
) -> dict:
    wanted = [t.strip() for t in types.split(",")] if types else None
    conn = _read_conn()
    try:
        return pc.history.events(conn, since, until, wanted, limit)
    finally:
        pc_db.close_db(conn)


@app.get("/api/summary")
async def summary_endpoint(
    since: Optional[int] = None,
    until: Optional[int] = None,
) -> dict:
    conn = _read_conn()
    try:
        return pc.history.summary(conn, since, until)
    finally:
        pc_db.close_db(conn)


def _reject_constant(token: str) -> None:
    """Reject NaN / Infinity / -Infinity, which json.loads accepts by default.

    Contract §6 requires NaN and Infinity to be rejected outright (T-P04).
    """
    raise ValueError(f"non-finite number is not allowed: {token}")


def _is_number(value) -> bool:
    """True for int or float, but not bool (bool is a subclass of int)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_int(value) -> bool:
    """True for int, but not bool."""
    return isinstance(value, int) and not isinstance(value, bool)


def _check_type(value, type_spec: str) -> bool:
    """Check a value against a type spec from the payload schema."""
    if type_spec == "str":
        return isinstance(value, str)
    if type_spec == "int":
        return _is_int(value)
    if type_spec == "bool":
        return isinstance(value, bool)
    if type_spec == "number":
        return _is_number(value)
    if type_spec == "null":
        return value is None
    if type_spec == "int_or_null":
        return value is None or _is_int(value)
    if type_spec == "number_or_null":
        return value is None or _is_number(value)
    if type_spec == "str_or_null":
        return value is None or isinstance(value, str)
    if type_spec == "bool_or_null":
        return value is None or isinstance(value, bool)
    if type_spec == "list":
        return isinstance(value, list)
    if type_spec == "list_of_str":
        return isinstance(value, list) and all(
            isinstance(x, str) for x in value
        )
    if type_spec == "list_of_obj":
        return isinstance(value, list) and all(
            isinstance(x, dict) for x in value
        )
    if type_spec == "obj":
        return isinstance(value, dict)
    if type_spec == "obj_or_null":
        return value is None or isinstance(value, dict)
    return False


def _check_deprecated_aliases(
    obj, path: str = "$"
) -> Optional[str]:
    """Recursively check that `time` and `time_valid` never appear as
    field names. Contract §89 / §11.6 forbids deprecated aliases on
    the wire. Returns the dotted path of the first violation, or None.
    """
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in DEPRECATED_ALIASES:
                return f"{path}.{key}"
            result = _check_deprecated_aliases(value, f"{path}.{key}")
            if result is not None:
                return result
    elif isinstance(obj, list):
        for index, item in enumerate(obj):
            result = _check_deprecated_aliases(item, f"{path}[{index}]")
            if result is not None:
                return result
    return None


def _check_invariants(
    payload: dict, invariant: Optional[str]
) -> bool:
    """Check structural invariants. Returns True if all pass.

    Invariants are only evaluated when the relevant fields are present;
    an absent field is treated as "not yet specified" rather than NULL.
    """
    if invariant == "dr03b":
        if "duration_ms" not in payload or "duration_basis" not in payload:
            return True
        duration_ms = payload["duration_ms"]
        duration_basis = payload["duration_basis"]
        # DR-03b: duration_ms IS NULL <=> duration_basis == 'null'
        if duration_ms is None and duration_basis != "null":
            return False
        if duration_ms is not None and duration_basis == "null":
            return False
        return True
    return True


def validate_envelope(message: dict) -> Tuple[bool, Optional[str]]:
    """Validate an ESP32-originated envelope against contract §3.1.

    Returns (True, None) when valid, otherwise (False, reason).

    NOTE ON PC-ORIGINATED MESSAGES: `time_sync`, `config_set`, `ack` and
    `nack` travel PC -> device and have a different envelope (§3.1 records
    this as defined in §3.17, §3.18, §3.19). This server only RECEIVES
    in Phase 2A, so only the ESP32-originated envelope is validated here.
    Do not reuse this function for a PC-originated message.
    """
    if not isinstance(message, dict):
        return False, "message_is_not_an_object"

    for field in REQUIRED_ENVELOPE_FIELDS:
        if field not in message:
            return False, f"missing_field:{field}"

    for field in STRING_FIELDS:
        value = message[field]
        if not isinstance(value, str):
            return False, f"wrong_type:{field}"
        if value.strip() == "":
            return False, f"empty_string:{field}"

    for field in INTEGER_FIELDS:
        value = message[field]
        # bool is a subclass of int in Python; reject it explicitly so
        # `true` is never accepted where an integer is required.
        if isinstance(value, bool) or not isinstance(value, int):
            return False, f"wrong_type:{field}"

    if message["ts_sent_valid"] not in (0, 1):
        return False, "wrong_type:ts_sent_valid"

    if not isinstance(message["payload"], dict):
        return False, "wrong_type:payload"

    return True, None


def validate_payload(message: dict) -> Tuple[bool, Optional[str]]:
    """Validate the payload against contract §3.2 field tables.

    Returns (True, None) when valid, otherwise (False, reason).

    Reason vocabulary is PROPOSED (contract §8 item 3 — OPEN):
      "invalid_payload"     — missing field, wrong type, empty string
      "deprecated_alias"    — `time` or `time_valid` found as a field name
      "invalid_value"       — enum or literal value outside its allowed set
      "invariant_violated"  — structural invariant (e.g. DR-03b) violated

    Unknown message types are not checked here — the envelope validator
    and dispatch() already handle them with a nack.
    """
    payload = message.get("payload", {})
    if not isinstance(payload, dict):
        return False, "invalid_payload"

    message_type = message.get("type")
    schema = PAYLOAD_SCHEMAS.get(message_type)
    if schema is None:
        return True, None

    # 1. Deprecated aliases (recursive) — §89, §11.6
    alias_path = _check_deprecated_aliases(payload)
    if alias_path is not None:
        return False, "deprecated_alias"

    # 2. Required fields present
    for field_name in schema["required"]:
        if field_name not in payload:
            return False, "invalid_payload"

    # 3. Type checks (required + optional that are present)
    all_fields = {**schema["required"], **schema["optional"]}
    for field_name, type_spec in all_fields.items():
        if field_name in payload:
            if not _check_type(payload[field_name], type_spec):
                return False, "invalid_payload"

    # 4. Empty-string rejection (contract §15.3 / §6)
    for field_name, type_spec in all_fields.items():
        if field_name in payload and type_spec == "str":
            if isinstance(payload[field_name], str) and payload[field_name].strip() == "":
                return False, "invalid_payload"

    # 5. Enum validation
    for field_name, allowed in schema["enums"].items():
        if field_name in payload:
            if payload[field_name] not in allowed:
                return False, "invalid_value"

    # 6. Structural invariants
    invariant = schema.get("invariant")
    if invariant and not _check_invariants(payload, invariant):
        return False, "invariant_violated"

    return True, None


def _record_id(message: dict) -> Optional[str]:
    """Return record_id when present and a non-empty string, else None."""
    value = message.get("record_id")
    if isinstance(value, str) and value.strip() != "":
        return value
    return None


def _ack_payload(record_id: Optional[str], committed: bool = True) -> dict:
    """Build the payload of an ack message."""
    payload: dict = {"committed": committed}
    if record_id is not None:
        payload["acked_record_id"] = record_id
    return payload


def _nack_payload(record_id: Optional[str], reason: str, retryable: bool = False) -> dict:
    """Build the payload of a nack message."""
    payload: dict = {
        "nacked_record_id": record_id,
        "reason": reason,
        "retryable": retryable,
    }
    return payload


def dispatch(message: dict) -> Optional[dict]:
    """Route a validated message to its handler and build the reply.

    OPEN ITEMS THIS FUNCTION DELIBERATELY DOES NOT DECIDE
    ---------------------------------------------------------
    * Gap 8 / DR-27 — `valid_samples_pressure` NULL-vs-0 when pressure
      conversion is unconfigured. OPEN. The server must not branch on
      that value.
    * `nack` reason vocabulary (contract §8 item 3 — OPEN). The
      PROPOSED reasons "invalid_payload", "deprecated_alias",
      "invalid_value", "invariant_violated" are emitted by
      validate_payload; only the literal "unknown_type" is emitted
      here as a skeleton value.
    * Whether `journal_pressure_indicator` has a threshold (D-D6 — OPEN).
      Not read here.
    * Retry limit, timeout and backoff values (§8 item 4 — OPEN).
      Not implemented here.
    * PC-originated envelope fields are defined in Contract v1.1.1
      (§3.1, §3.17, §3.18, §3.19).
    * Any wire-format decision not written in contract v1.1.1.
    """
    message_type = message.get("type")
    record_id = _record_id(message)
    payload = message.get("payload", {})

    if message_type == "hello":
        log.info(
            "hello received (firmware=%r, protocol_versions=%r)",
            payload.get("firmware_version"),
            payload.get("protocol_versions_supported"),
        )
        return None

    if message_type == "live_state":
        stations = payload.get("stations")
        station_count = len(stations) if isinstance(stations, list) else 0
        log.info(
            "live_state received (station_count=%d, alarm_state=%r, "
            "warning_state=%r) — not stored, not acknowledged",
            station_count,
            payload.get("alarm_state"),
            payload.get("warning_state"),
        )
        # No persistence and no reply per contract §12.1.
        # Station simultaneity (HW-02/HW-03 — OPEN) is not decided here.
        _device_state["last_live_state_ms"] = _now_ms()
        _spawn(_broadcast_to_gui(message))
        return None

    if message_type in DURABLE_TYPES:
        log.info("%s received record_id=%r", message_type, record_id)

        if record_id is None:
            # A durable record without record_id cannot be stored or
            # de-duplicated; acknowledging it (old behaviour) silently lost it.
            log.warning("%s without record_id — nack", message_type)
            return _nack_payload(None, "missing_record_id", retryable=False)

        if _db_conn is not None:
            status = pc_db.commit_record(_db_conn, message)
            if status == "error":
                log.error(
                    "storage error for %s record_id=%r",
                    message_type, record_id,
                )
                return _nack_payload(
                    record_id, "storage_error", retryable=True
                )
            log.info(
                "%s record_id=%r committed (status=%s)",
                message_type, record_id, status,
            )
        # Commit-before-ACK invariant (§12.2): the ack is only built
        # AFTER commit_record has called conn.commit().
        return _ack_payload(record_id, committed=True)

    if message_type == "batch":
        records = payload.get("records")
        record_ids: list = []
        if isinstance(records, list):
            for index, record in enumerate(records):
                if not isinstance(record, dict):
                    log.warning("batch record at index %d is not an object", index)
                    continue
                nested_id = _record_id(record)
                log.info("batch record index=%d record_id=%r", index, nested_id)
                if _db_conn is not None and nested_id is not None:
                    status = pc_db.commit_record(_db_conn, record)
                    if status == "error":
                        log.error(
                            "storage error for batch record index=%d record_id=%r",
                            index, nested_id,
                        )
                        return _nack_payload(
                            nested_id, "storage_error", retryable=True
                        )
                if nested_id is not None:
                    # acked_record_ids is list_of_str: never put None in it.
                    record_ids.append(nested_id)
        # v1.1.1 §11.5 (Gap 7): a batch is answered by ONE ack carrying
        # acked_record_ids, never by N separate acks, and never together
        # with acked_record_id. Only sent AFTER all records committed.
        return {
            "acked_record_ids": record_ids,
            "committed": True,
        }

    if message_type == "time_sync_reply":
        log.info(
            "time_sync_reply received clock_offset_ms=%r (diagnostic only, "
            "never applied retroactively — contract §5)",
            payload.get("clock_offset_ms"),
        )
        return None

    if message_type == "config_result":
        log.info(
            "config_result received accepted=%r request_id=%r",
            payload.get("accepted"),
            payload.get("request_id"),
        )
        # No configuration is persisted in Phase 2A.
        # PC -> ESP32 config authentication is OPEN (§8 item 5).
        return None

    if message_type == "reset_command":
        target = payload.get("target")
        pc_id = payload.get("pc_id")
        request_id = payload.get("request_id")
        log.info(
            "reset_command received target=%s pc_id=%s request_id=%r",
            target,
            pc_id,
            request_id,
        )
        # TODO (Phase 3, DR-49): alarm/warning state machine.
        # The current implementation always reports alarm_state="inactive"
        # and warning_state="inactive". DR-49 (alarm output on persistent
        # I2C fault) remains OPEN and will be resolved in Phase 3.
        # No alarm evaluation logic is present until Phase 3.
        result = {
            "accepted": True,
            "alarm_state": "inactive",
            "warning_state": "inactive",
        }
        if request_id is not None:
            result["request_id"] = request_id
        return result

    if message_type == "reset_result":
        log.info(
            "reset_result received accepted=%r alarm_state=%r warning_state=%r",
            payload.get("accepted"),
            payload.get("alarm_state"),
            payload.get("warning_state"),
        )
        # If the server receives a reset_result it is unexpected (this
        # message is ESP32 -> PC); log and do not reply.
        return None

    log.warning("unknown message type %r — sending nack", message_type)
    return _nack_payload(record_id, "unknown_type", retryable=False)


async def _broadcast_to_gui(message: dict) -> None:
    """Broadcast a JSON message to all connected GUI clients.

    Clients that fail are removed from the set. This function is
    safe to call without holding _gui_lock; it acquires the lock
    internally so the set is not mutated during iteration.
    """
    if not _gui_clients:
        return
    text = json.dumps(message)
    async with _gui_lock:
        dead = []
        for ws in list(_gui_clients):
            try:
                # one stalled browser must not freeze the broadcast for all
                await asyncio.wait_for(ws.send_text(text), timeout=GUI_SEND_TIMEOUT_S)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _gui_clients.discard(ws)


@app.websocket("/ws/gui")
async def ws_gui(websocket: WebSocket) -> None:
    """Receive GUI browser connections.

    GUI clients are read-only: the server never expects a message
    from them. The connection is kept open so the server can push
    ESP32-originated live_state updates in real time.
    """
    await websocket.accept()
    async with _gui_lock:
        _gui_clients.add(websocket)
    log.info("gui connected (%d clients)", len(_gui_clients))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # e.g. RuntimeError after an abrupt close
        log.info("gui socket error: %s", exc)
    finally:
        # The old code only cleaned up on WebSocketDisconnect, leaking
        # clients on any other error.
        async with _gui_lock:
            _gui_clients.discard(websocket)
        log.info("gui disconnected (%d clients)", len(_gui_clients))


@app.websocket("/ws/device")
async def ws_device(websocket: WebSocket) -> None:
    """Receive messages from the device, validate, dispatch, reply."""
    client = websocket.client
    host = client.host if client is not None else "unknown"
    await websocket.accept()
    log.info("device connected host=%s", host)
    _device_state.update({
        "connected": True,
        "host": host,
        "connected_at_ms": _now_ms(),
        "connections": _device_state["connections"] + 1,
    })

    if _db_conn is None:
        init_persistence()

    def _rejected(reason):
        _device_state["messages_rejected"] += 1
        _device_state["last_reject_reason"] = reason

    try:
        while True:
            raw = await websocket.receive_text()
            _device_state["last_message_ms"] = _now_ms()
            _device_state["messages_received"] += 1
            try:
                message = json.loads(raw, parse_constant=_reject_constant)
            except json.JSONDecodeError as exc:
                # Corrupt / unparseable handling is OPEN (§8 item 15);
                # the server must not crash on it.
                log.warning("unparseable message: %s", exc)
                _rejected("unparseable")
                await websocket.send_json(
                    build_pc_envelope("nack", {
                        "nacked_record_id": None,
                        "reason": "unparseable",
                        "retryable": False,
                    })
                )
                continue
            except ValueError as exc:
                # NaN / Infinity rejected here per contract §6 (T-P04).
                log.warning("rejected non-finite constant: %s", exc)
                _rejected("non_finite_value")
                await websocket.send_json(
                    build_pc_envelope("nack", {
                        "nacked_record_id": None,
                        "reason": "non_finite_value",
                        "retryable": False,
                    })
                )
                continue

            ok, reason = validate_envelope(message)
            if not ok:
                log.warning("envelope rejected: %s", reason)
                _rejected(reason)
                await websocket.send_json(
                    build_pc_envelope("nack", {
                        "nacked_record_id": (
                            _record_id(message) if isinstance(message, dict) else None
                        ),
                        "reason": reason,
                        "retryable": False,
                    })
                )
                continue

            ok, reason = validate_payload(message)
            if not ok:
                log.warning("payload rejected: %s", reason)
                _rejected(reason)
                await websocket.send_json(
                    build_pc_envelope("nack", {
                        "nacked_record_id": _record_id(message),
                        "reason": reason,
                        "retryable": False,
                    })
                )
                continue

            if message.get("type") == "hello":
                p = message.get("payload") or {}
                _device_state.update({
                    "device_id": message.get("device_id"),
                    "boot_id": message.get("boot_id"),
                    "firmware_version": p.get("firmware_version"),
                    "protocol_versions_supported": p.get("protocol_versions_supported"),
                })

            reply = dispatch(message)
            if reply is not None:
                await websocket.send_json(
                    build_pc_envelope(_reply_type(message.get("type"), reply), reply)
                )
    except WebSocketDisconnect:
        log.info("device disconnected host=%s", host)
    except Exception as exc:
        log.warning("device socket closed with error host=%s: %s", host, exc)
    finally:
        _device_state.update({
            "connected": False,
            "disconnected_at_ms": _now_ms(),
        })


def _reply_type(message_type: Optional[str], reply: dict) -> str:
    """Choose the envelope type of a dispatch() reply.

    BUG FIX: a storage_error for a durable record used to be sent with
    type "ack" (because the type was chosen from the INCOMING message type
    only), so the device would delete a record that was never stored.
    """
    if "reason" in reply and "retryable" in reply:
        return "nack"
    if message_type == "reset_command":
        return "reset_result"
    if message_type in DURABLE_TYPES or message_type == "batch":
        return "ack"
    return "nack"


if __name__ == "__main__":
    # Binds 0.0.0.0 so a device on the ESP32 access point can reach it.
    # The address plan is OPEN (spec D-B2); no Windows network, DHCP or
    # firewall change is made by this code. Windows Firewall must allow
    # inbound TCP 8000 on the Wi-Fi adapter for the ESP32 to connect.
    #
    # Run from the repository root:   python -m pc.server
    # (running `python pc/server.py` also works: the repo root is added to
    # sys.path below so `from pc import ...` resolves).
    import os as _os
    uvicorn.run(app, host=_os.environ.get("TOUGHENING_HOST", "0.0.0.0"),
                port=int(_os.environ.get("TOUGHENING_PORT", "8000")))
