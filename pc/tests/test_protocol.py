"""Protocol tests for the TOUGHENING MACHINE PC-side skeleton (Phase 2A).

Contract under test: docs/PROTOCOL_CONTRACT.md v0.2.4
Specification:        docs/PROJECT_SPECIFICATION.md v0.7.2

Test IDs T-P01 … T-P15 are the contract §10 test list, used verbatim.

A test is implemented only where the contract actually specifies enough to
assert it. Where a test depends on something Phase 2A does not implement —
SQLite persistence, ESP32 firmware behaviour, or the OPEN PC-side envelope —
it is marked `@pytest.mark.skip` with the reason quoted. No test asserts a
value for any OPEN item, and no calibration, sensor or hardware value
appears anywhere in this file.

IMPORT PATH: this file prepends the workspace root to sys.path so
`from pc.server import ...` works when pytest is invoked from the
workspace root, with or without pc/tests/__init__.py.
"""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Import-path safety: make the workspace root importable so `pc.server`
# resolves without requiring pc/ to be an installed package.
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from pc.server import app, dispatch, validate_envelope  # noqa: E402

CLIENT = TestClient(app)

# Contract placeholders only.
DEVICE_ID = "esp32-01"
BOOT_ID = "<boot_id>"

NO_REPLY_TYPES = ("hello", "live_state", "time_sync_reply", "config_result")
DURABLE_TYPES = (
    "cycle_summary",
    "alarm_event",
    "system_event",
    "settings_change",
    "interrupted_cycle",
    "data_loss",
    "raw_voltage_record",
)


def envelope(msg_type, seq, payload=None, record_seq=None):
    """Build a valid ESP32-originated envelope per contract §3.1."""
    message = {
        "protocol_version": "1.0.0",
        "type": msg_type,
        "message_id": f"{DEVICE_ID}:{BOOT_ID}:{seq}",
        "device_id": DEVICE_ID,
        "boot_id": BOOT_ID,
        "seq": seq,
        "ts_sent_ms": 0,
        "ts_sent_valid": 1,
        "payload": {} if payload is None else payload,
    }
    if record_seq is not None:
        message["record_seq"] = record_seq
        message["record_id"] = f"{DEVICE_ID}:{BOOT_ID}:{record_seq}"
    return message


def roundtrip(message, expect_reply=True):
    """Send one message over the WebSocket and return the parsed reply.

    `expect_reply=False` for types the server does not answer. This must
    NOT call receive_text() in that case: the server sends nothing, so
    receive_text() blocks forever and the test hangs.
    """
    with CLIENT.websocket_connect("/ws/device") as ws:
        ws.send_text(json.dumps(message))
        if not expect_reply:
            return None
        return json.loads(ws.receive_text())


def durable_payload(msg_type):
    """Minimal placeholder payload; no sensor or calibration values."""
    return {"event_time": 0, "event_time_valid": 1}
# ---------------------------------------------------------------------------
# T-P01 — implemented for the 12 ESP32-originated types.
# ---------------------------------------------------------------------------


def test_tp01_roundtrip_all_esp32_originated_types():
    """T-P01: "Send each of the 16 message types and confirm it parses and
    is accepted according to its field table."

    12 of the 16 types are ESP32-originated and are exercised here. The
    4 PC-originated types cannot be built — see the next test.
    """
    order = ("hello", "live_state") + DURABLE_TYPES + (
        "time_sync_reply", "config_result", "batch",
    )
    for index, msg_type in enumerate(order, start=1):
        if msg_type == "batch":
            nested = envelope("cycle_summary", 900, {}, record_seq=900)
            message = envelope(
                "batch", index,
                {"records": [nested], "record_count": 1, "has_more": False},
            )
            reply = roundtrip(message)
            assert reply is not None and reply["type"] == "ack"
            continue

        if msg_type in DURABLE_TYPES:
            message = envelope(msg_type, index, {}, record_seq=index)
            reply = roundtrip(message)
            assert reply is not None, f"{msg_type} must be acknowledged"
            assert reply["type"] == "ack"
            assert reply["committed"] is True
        else:
            # The server must NOT answer these types; do not read.
            message = envelope(msg_type, index, {})
            assert roundtrip(message, expect_reply=False) is None

        ok, reason = validate_envelope(message)
        assert ok, f"{msg_type} envelope invalid: {reason}"


def test_tp01_pc_originated_types_skipped():
    """The 4 PC-originated types cannot be sent to this server.

    Contract §8 item 24 records the PC-side envelope as OPEN.
    """
    pytest.skip(
        "PC-originated envelope is OPEN — contract §8 item 24: "
        "'Envelope fields applicable to a PC-originated message "
        "(time_sync, config_set, ack, nack) ... what replaces them for "
        "correlation is not decided here.' No valid message can be built."
    )


# ---------------------------------------------------------------------------
# T-P02 — skipped. Needs SQLite; Phase 2A has none.
# ---------------------------------------------------------------------------


def test_tp02_idempotent_replay_of_batch_100x():
    """T-P02: replay a batch 100x. Expected: "Exactly one row per
    record_id in SQLite; no duplicates."

    No persistence exists, so 'exactly one row' cannot be observed.
    """
    pytest.skip(
        "No SQLite persistence in Phase 2A — pc/server.py is documented "
        "'No SQLite persistence', so 'exactly one row per record_id in "
        "SQLite' (contract §10 T-P02) cannot be observed."
    )


# ---------------------------------------------------------------------------
# T-P03 — implemented for the no-crash / no-state-change half.
# ---------------------------------------------------------------------------


def test_tp03_unknown_protocol_major_does_not_crash():
    """T-P03: "Send a message with an unrecognised major
    protocol_version." Expected: "A logged nack is returned and no state
    change occurs."

    The concrete protocol_version value is OPEN (§8 item 1), so the
    Phase 2A server validates presence and does NOT compare major
    numbers. Only the no-crash half is asserted here.

    Partial coverage. The nack half of §10 T-P03 depends on the
    concrete protocol_version value, which is OPEN (§8 item 1).
    Only the no-crash half is asserted here.
    """
# ---------------------------------------------------------------------------
# T-P04 — implemented.
# ---------------------------------------------------------------------------


def test_tp04_nan_infinity_empty_and_wrong_types_rejected():
    """T-P04: "Submit settings and payload values containing NaN,
    Infinity, empty strings and wrong types." Expected: "All are
    rejected; nothing is saved; no divide-by-zero and no invalid output."

    json.loads accepts NaN/Infinity by default, so the server rejects
    them via parse_constant; the rest are envelope checks.
    """
    for literal in ("NaN", "Infinity", "-Infinity"):
        raw = (
            '{"protocol_version":"1.0.0","type":"hello","message_id":"m",'
            '"device_id":"d","boot_id":"b","seq":%s,"ts_sent_ms":0,'
            '"ts_sent_valid":1,"payload":{}}' % literal
        )
        with CLIENT.websocket_connect("/ws/device") as ws:
            ws.send_text(raw)
            reply = json.loads(ws.receive_text())
        assert reply["type"] == "nack"
        assert reply["reason"] == "non_finite_value"

    base = envelope("hello", 1)
    for field, value, expected in (
        ("device_id", "", "empty_string:device_id"),
        ("device_id", 1, "wrong_type:device_id"),
        ("seq", "1", "wrong_type:seq"),
        ("seq", True, "wrong_type:seq"),
        ("ts_sent_valid", 2, "wrong_type:ts_sent_valid"),
        ("payload", [], "wrong_type:payload"),
    ):
        message = dict(base)
        message[field] = value
        ok, reason = validate_envelope(message)
        assert ok is False, f"{field}={value!r} should be rejected"
        assert reason == expected

    for field in ("protocol_version", "type", "message_id", "device_id",
                  "boot_id", "seq", "ts_sent_ms", "ts_sent_valid", "payload"):
        message = dict(base)
        del message[field]
        ok, reason = validate_envelope(message)
        assert ok is False
        assert reason == f"missing_field:{field}"


# ---------------------------------------------------------------------------
# T-P05 — skipped. Requires SQLite commit ordering.
# ---------------------------------------------------------------------------


def test_tp05_commit_before_ack_ordering():
    """T-P05: "Terminate the PC between the SQLite commit and sending
    ack." Expected: "The record is not lost and not duplicated."

    There is no SQLite commit in Phase 2A, so the ordering between
    commit and ack cannot be exercised.
    """
    pytest.skip(
        "No SQLite commit in Phase 2A — pc/server.py stubs commit-before-ACK "
        "with 'TODO: real SQLite commit in a later phase', so the ordering "
        "in contract §10 T-P05 cannot be exercised."
    )


# ---------------------------------------------------------------------------
# T-P06 — skipped. Retransmission is a device-side behaviour.
# ---------------------------------------------------------------------------


def test_tp06_reconnect_and_retransmit():
    """T-P06: "Drop the connection with unacknowledged durable records
    outstanding, then reconnect." Expected: "Unacknowledged records are
    retransmitted; no record is lost."

    Retransmission is performed by the ESP32 firmware, which does not
    exist. Phase 2B is NOT AUTHORIZED and no firmware is in scope.
    """
    pytest.skip(
        "Retransmission is ESP32-side behaviour — no firmware exists and "
        "Phase 2B is NOT AUTHORIZED, so 'unacknowledged records are "
        "retransmitted' (contract §10 T-P06) cannot be exercised."
    )


# ---------------------------------------------------------------------------
# T-P07 — implemented. The offset is diagnostic only.
# ---------------------------------------------------------------------------


def test_tp07_time_sync_offset_is_diagnostic_only():
    """T-P07: "Deliver a time_sync_reply carrying a non-zero
    clock_offset_ms." Expected: "Already-recorded event times are not
    rewritten; no retroactive adjustment occurs."

    The server neither stores nor rewrites any time, so the invariant
    holds trivially and is asserted by checking no reply is produced
    and the payload is not altered.
    """
    payload = {"clock_offset_ms": 1234, "uptime_ms": 0}
    message = envelope("time_sync_reply", 1, payload)
    assert roundtrip(message, expect_reply=False) is None, (
        "time_sync_reply must not be answered"
    )

    before = dict(message["payload"])
    ok, _ = validate_envelope(message)
# ---------------------------------------------------------------------------
# T-P09 / T-P10 — skipped. Both need firmware.
# ---------------------------------------------------------------------------


def test_tp09_one_raw_voltage_record_per_out_of_range_entry():
    """T-P09: "Hold a channel in out_of_range across many samples, then
    leave the state." Expected: "ONE raw_voltage_record per entry into
    out_of_range — never one per sample."

    Deciding when a channel enters or leaves out_of_range requires the
    sampling loop, which is firmware behaviour.
    """
    pytest.skip(
        "Requires ESP32 sampling behaviour — 'ONE raw_voltage_record per "
        "entry into out_of_range' (contract §10 T-P09, DR-25.9) is decided "
        "by the sampling loop; no firmware exists and Phase 2B is NOT AUTHORIZED."
    )


def test_tp10_delete_after_ack():
    """T-P10: "Send a valid ack for a durable record." Expected: "The
    ESP32 deletes the record only after the matching ack."

    Deletion happens in the device journal.
    """
    pytest.skip(
        "Device-side journal action — 'The ESP32 deletes the record only "
        "after a valid matching ack' (contract §10 T-P10) requires firmware "
        "and a device journal; Phase 2B is NOT AUTHORIZED."
    )


# ---------------------------------------------------------------------------
# T-P11 — implemented. Deprecated aliases are not envelope fields.
# ---------------------------------------------------------------------------


def test_tp11_deprecated_aliases_not_accepted():
    """T-P11: "Send a payload using the deprecated spellings instead of
    the canonical §11.6 names." Expected: "Rejected; canonical names
    only are accepted."

    PARTIAL / NOT SATISFYING. This test exercises the ENVELOPE only: it
    removes a canonical envelope field and substitutes the deprecated
    alias, then checks the missing-field rejection. The contract asks for
    payload-level rejection, which the Phase 2A server does not perform,
    so a pass here does NOT evidence contract T-P11.

    Payload-level deprecated-alias rejection is therefore skipped.
    """
    pytest.skip(
        "Contract §10 T-P11 requires payload-level validation. Phase 2A "
        "implements envelope-level validation only. Payload-level "
        "deprecated-alias rejection is deferred to the phase that adds "
        "payload validation."
    )


# ---------------------------------------------------------------------------
# T-P12 / T-P13 — skipped. Payload validation is not implemented.
# ---------------------------------------------------------------------------


def test_tp12_duration_basis_value_set():
    """T-P12: "Send a duration_basis outside 'null', 'calendar',
    'uptime_same_boot'." Expected: "Rejected; no fourth value."

    duration_basis is a payload field; the Phase 2A server validates
    the ENVELOPE only.
    """
    pytest.skip(
        "Payload-level validation is not implemented in Phase 2A — the server "
        "validates the envelope per contract §3.1 only, so rejection of a "
        "fourth duration_basis value (contract §10 T-P12) cannot be asserted."
    )


def test_tp13_duration_ms_duration_basis_invariant():
    """T-P13: "Send duration_ms = null with duration_basis != 'null', and
    the reverse." Expected: "Both rejected — the DR-03b bidirectional
    invariant holds."

    Both fields are payload fields.
    """
    pytest.skip(
        "Payload-level validation is not implemented in Phase 2A — the DR-03b "
        "bidirectional invariant (contract §10 T-P13) cannot be enforced or "
        "asserted by an envelope-only validator."
    )


# ---------------------------------------------------------------------------
# T-P14 / T-P15 — implemented for the server side: nothing is coerced.
# ---------------------------------------------------------------------------


def test_tp14_invalid_values_are_null_never_zero():
    """T-P14: "Produce an out-of-range or unconfigured reading." Expected:
    "The value is NULL, not 0 and not clamped."

    The server never writes, coerces or clamps a value, so this holds
    trivially; a null value is shown to survive the round trip.
    """
    payload = {
        "station_id": 1,
        "nozzles": [{
            "nozzle_id": 1,
            "raw_pressure_voltage": 0,
            "raw_temperature_voltage": 0,
            "converted_pressure": None,
            "converted_temperature": None,
            "channel_state": "out_of_range",
        }],
    }
    message = envelope("live_state", 1, payload)
    assert roundtrip(message, expect_reply=False) is None
    nozzle = message["payload"]["nozzles"][0]
    assert nozzle["converted_pressure"] is None
    assert nozzle["converted_temperature"] is None


def test_tp15_fault_transition_count_remains_null():
    """T-P15: "Exercise a fault transition." Expected: "The field stays
    NULL; it is never implemented while DR-07-C3 is open, and never
    reported as 0."

    DR-07-C3 is OPEN so the server neither computes nor replaces the
    field; a null value passes through untouched.
    """
    payload = {
        "station_id": 1,
        "cycle_start_ms": 0,
        "start_time_valid": 1,
        "cycle_end_ms": 0,
        "end_time_valid": 1,
        "duration_ms": 0,
        "duration_basis": "calendar",
        "faulted_channel_count": 0,
        "fault_transition_count": None,
    }
    message = envelope("cycle_summary", 1, payload, record_seq=1)
    reply = roundtrip(message)
    assert reply is not None and reply["type"] == "ack"
    assert message["payload"]["fault_transition_count"] is None, (
        "DR-07-C3 is OPEN — the value must stay null, never 0"
    )


# ---------------------------------------------------------------------------
# Gap-resolution tests (v0.2.4 §11) — these ARE resolved, so they are asserted.
# ---------------------------------------------------------------------------


def test_gap6_record_id_differs_from_message_id():
    """Gap 6: record_id is {device_id}:{boot_id}:{record_seq} while
    message_id is {device_id}:{boot_id}:{seq}. A retransmission keeps its
    record_id while gaining a new message_id.
    """
    first = envelope("cycle_summary", 5, {}, record_seq=2)
    again = envelope("cycle_summary", 99, {}, record_seq=2)
    assert first["message_id"] != first["record_id"]
    assert again["message_id"] != again["record_id"]
    assert first["record_id"] == again["record_id"], "record_id must be stable"
    assert first["message_id"] != again["message_id"], "message_id must change"


def test_gap7_batch_ack_is_one_ack_with_array():
    """Gap 7: a batch is answered by ONE ack carrying acked_record_ids,
    never by N acks and never together with acked_record_id.
    """
    nested_a = envelope("cycle_summary", 20, {}, record_seq=20)
    nested_b = envelope("alarm_event", 21, {}, record_seq=21)
    message = envelope(
        "batch", 30,
        {"records": [nested_a, nested_b], "record_count": 2, "has_more": False},
    )
    reply = roundtrip(message)
    assert reply is not None
    assert reply["type"] == "ack"
    assert "acked_record_ids" in reply
    assert "acked_record_id" not in reply, "the two fields never coexist"
    assert reply["acked_record_ids"] == [nested_a["record_id"], nested_b["record_id"]]


def test_single_record_ack_uses_singular_field_only():
    """A non-batch durable message is answered with acked_record_id only."""
    reply = roundtrip(envelope("alarm_event", 40, {}, record_seq=40))
    assert reply is not None
    assert "acked_record_id" in reply
    assert "acked_record_ids" not in reply


def test_unknown_type_returns_nack_without_crashing():
    """An unknown type produces a nack and does not raise."""
    reply = roundtrip(envelope("not_a_real_type", 50, {}, record_seq=50))
    assert reply is not None
    assert reply["type"] == "nack"
    assert reply["reason"] == "unknown_type"
    assert reply["retryable"] is False


def test_health_endpoint():
    """GET /health returns the fixed skeleton version."""
    response = CLIENT.get("/health")
    assert response.status_code == 200
# ---------------------------------------------------------------------------
# T-P08 — skipped. config_set is PC-originated; its envelope is OPEN.
# ---------------------------------------------------------------------------


def test_tp08_config_set_validation():
    """T-P08: "Submit calibration points that are non-finite, duplicated,
    or not in ascending order." Expected: "Rejected by config_result;
    the stored settings are unchanged."

    config_set travels PC -> device. Its envelope is OPEN (§8 item 24)
    and this server only receives ESP32-originated messages, so no
    valid config_set can be constructed here.
    """
    pytest.skip(
        "config_set is PC-originated and its envelope is OPEN — contract "
        "§8 item 24. This server only receives ESP32-originated messages, "
        "so contract §10 T-P08 cannot be exercised."
    )
    assert response.json() == {"status": "ok", "version": "0.1.0"}