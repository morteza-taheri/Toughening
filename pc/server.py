"""TOUGHENING MACHINE — PC side WebSocket server (Phase 2C Stage 2).

APPROVED — Phase 2C is authorized as a software-only continuation of
Phase 2A. Hardware phases (3+) remain NOT AUTHORIZED.
See docs/PROJECT_SPECIFICATION.md §12, §15 and
docs/PROTOCOL_CONTRACT.md v1.1.0.

This module validates the message envelope and payload, persists durable
records to SQLite (commit-before-ACK), and dispatches by type.

Phase 2C Stage 1 added payload-level validation and Contract v1.1.0
support (reset_command / reset_result, alarm_state / warning_state).
Phase 2C Stage 2 adds minimal SQLite persistence: commit-before-ACK and
idempotent replay (§12.2).

Where a decision would eventually be needed, a comment names the
OPEN item instead of choosing a value.
"""

import json
import logging
from typing import Optional, Tuple

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from pc import db as pc_db

app = FastAPI(title="Toughening Machine PC side (Phase 2C Stage 2)")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("pc.server")

SERVER_VERSION = "0.1.0"
PROTOCOL_VERSION = "1.1.0"

# SQLite persistence (Phase 2C Stage 2). Lazily initialised by
# init_persistence(); tests set this directly via a fixture.
_db_conn = None


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

# PROTOCOL_CONTRACT.md v1.1.0 §3.1 — envelope fields required on every
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
# Payload schema registry — PROTOCOL_CONTRACT.md v1.1.0 §3.2
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
    this as OPEN). This server only RECEIVES in Phase 2A, so only the
    ESP32-originated envelope is validated here. Do not reuse this
    function for a PC-originated message without first resolving the
    PC-side envelope (contract §8 item 24 — OPEN).
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
    * Whether an outgoing ack envelope carries PC-side fields
      (§8 item 24 — OPEN). Replies below are payload-level only.
    * Any wire-format decision not written in contract v1.1.0.
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
        return None

    if message_type in DURABLE_TYPES:
        log.info("%s received record_id=%r", message_type, record_id)

        if _db_conn is not None and record_id is not None:
            status = pc_db.commit_record(_db_conn, message)
            if status == "error":
                log.error(
                    "storage error for %s record_id=%r",
                    message_type, record_id,
                )
                return {
                    "type": "nack",
                    "nacked_record_id": record_id,
                    "reason": "storage_error",
                    "retryable": True,
                }
            log.info(
                "%s record_id=%r committed (status=%s)",
                message_type, record_id, status,
            )
        # Commit-before-ACK invariant (§12.2): the ack is only built
        # AFTER commit_record has called conn.commit().
        return {
            "type": "ack",
            "acked_record_id": record_id,
            "committed": True,
        }

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
                        return {
                            "type": "nack",
                            "nacked_record_id": nested_id,
                            "reason": "storage_error",
                            "retryable": True,
                        }
                record_ids.append(nested_id)
        # v1.1.0 §11.5 (Gap 7): a batch is answered by ONE ack carrying
        # acked_record_ids, never by N separate acks, and never together
        # with acked_record_id. Only sent AFTER all records committed.
        return {
            "type": "ack",
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
        # TODO: replace with real alarm/warning state tracking once the
        # state machine is implemented. Both start at "inactive".
        result = {
            "type": "reset_result",
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
    return {
        "type": "nack",
        "nacked_record_id": record_id,
        "reason": "unknown_type",
        "retryable": False,
    }


@app.websocket("/ws/device")
async def ws_device(websocket: WebSocket) -> None:
    """Receive messages from the device, validate, dispatch, reply."""
    client = websocket.client
    host = client.host if client is not None else "unknown"
    await websocket.accept()
    log.info("device connected host=%s", host)

    if _db_conn is None:
        init_persistence()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw, parse_constant=_reject_constant)
            except json.JSONDecodeError as exc:
                # Corrupt / unparseable handling is OPEN (§8 item 15);
                # the server must not crash on it.
                log.warning("unparseable message: %s", exc)
                await websocket.send_json(
                    {
                        "type": "nack",
                        "nacked_record_id": None,
                        "reason": "unparseable",
                        "retryable": False,
                    }
                )
                continue
            except ValueError as exc:
                # NaN / Infinity rejected here per contract §6 (T-P04).
                log.warning("rejected non-finite constant: %s", exc)
                await websocket.send_json(
                    {
                        "type": "nack",
                        "nacked_record_id": None,
                        "reason": "non_finite_value",
                        "retryable": False,
                    }
                )
                continue

            ok, reason = validate_envelope(message)
            if not ok:
                log.warning("envelope rejected: %s", reason)
                await websocket.send_json(
                    {
                        "type": "nack",
                        "nacked_record_id": (
                            _record_id(message) if isinstance(message, dict) else None
                        ),
                        "reason": reason,
                        "retryable": False,
                    }
                )
                continue

            ok, reason = validate_payload(message)
            if not ok:
                log.warning("payload rejected: %s", reason)
                await websocket.send_json(
                    {
                        "type": "nack",
                        "nacked_record_id": _record_id(message),
                        "reason": reason,
                        "retryable": False,
                    }
                )
                continue

            reply = dispatch(message)
            if reply is not None:
                await websocket.send_json(reply)
    except WebSocketDisconnect:
        log.info("device disconnected host=%s", host)


if __name__ == "__main__":
    # Binds 0.0.0.0 so a device on the ESP32 access point can reach it.
    # The address plan is OPEN (spec D-B2); no Windows network, DHCP or
    # firewall change is made by this code.
    uvicorn.run(app, host="0.0.0.0", port=8000)
