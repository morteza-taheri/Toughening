"""TOUGHENING MACHINE — PC side WebSocket server skeleton (Phase 2A).

PROPOSED — NOT APPROVED. No SQLite persistence.
See docs/PROJECT_SPECIFICATION.md §12, §15 and
docs/PROTOCOL_CONTRACT.md v0.2.4.

This module validates the message envelope and dispatches by type
ONLY. It deliberately decides nothing that the specification or the
contract leaves OPEN. Where a decision would eventually be needed,
a comment names the OPEN item instead of choosing a value.
"""

import json
import logging
from typing import Optional, Tuple

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI(title="Toughening Machine PC side (Phase 2A skeleton)")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("pc.server")

SERVER_VERSION = "0.1.0"

# PROTOCOL_CONTRACT.md v0.2.4 §3.1 — envelope fields required on every
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
)


@app.get("/health")
async def health() -> dict:
    """Liveness probe. Returns a fixed skeleton version."""
    return {"status": "ok", "version": SERVER_VERSION}


def _reject_constant(token: str) -> None:
    """Reject NaN / Infinity / -Infinity, which json.loads accepts by default.

    Contract §6 requires NaN and Infinity to be rejected outright (T-P04).
    """
    raise ValueError(f"non-finite number is not allowed: {token}")


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


def _record_id(message: dict) -> Optional[str]:
    """Return record_id when present and a non-empty string, else None."""
    value = message.get("record_id")
    if isinstance(value, str) and value.strip() != "":
        return value
    return None
    "hello",
    "live_state",
    "batch",
    "time_sync_reply",
    "config_result",
def dispatch(message: dict) -> Optional[dict]:
    """Route a validated message to its handler and build the reply.

    OPEN ITEMS THIS FUNCTION DELIBERATELY DOES NOT DECIDE
    ---------------------------------------------------------
    * Gap 8 / DR-27 — `valid_samples_pressure` NULL-vs-0 when pressure
      conversion is unconfigured. OPEN. The server must not branch on
      that value; it does not even read it here.
    * `nack` reason vocabulary (contract §8 item 3 — OPEN). Only the
      literal "unknown_type" is emitted, which is a skeleton value.
    * Whether `journal_pressure_indicator` has a threshold (D-D6 — OPEN).
      Not read here.
    * Retry limit, timeout and backoff values (§8 item 4 — OPEN).
      Not implemented here.
    * Whether an outgoing ack envelope carries PC-side fields
      (§8 item 24 — OPEN). Replies below are payload-level only.
    * Any wire-format decision not written in contract v0.2.4.
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
            "live_state received (station_count=%d) — not stored, not acknowledged",
            station_count,
        )
        # No persistence in Phase 2A and no reply per contract §12.1.
        # Station simultaneity (HW-02/HW-03 — OPEN) is not decided here.
        return None

    if message_type in DURABLE_TYPES:
        log.info("%s received record_id=%r", message_type, record_id)
        # TODO: real SQLite commit in a later phase; the commit-before-ACK
        # invariant is currently stubbed. The reply below is NOT evidence
        # that anything was durably written.
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
                record_ids.append(nested_id)
        # TODO: real commit per §12.2.
        # v0.2.4 §11.5 (Gap 7): a batch is answered by ONE ack carrying
        # acked_record_ids, never by N separate acks, and never together
        # with acked_record_id.
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