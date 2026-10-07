"""TOUGHENING MACHINE — PC side protocol simulator (Phase 2A).

PROPOSED — NOT APPROVED. Plays the ESP32 role only: it connects as a
WebSocket client and sends the 12 ESP32-originated message types from
PROTOCOL_CONTRACT.md v0.2.4 §3.2.

NO INVENTED VALUES. Every numeric field is 0, 1 or null; every string is
a contract placeholder. No calibration, sensor or hardware value appears
in this file.

OPEN ITEMS THIS SCRIPT DELIBERATELY DOES NOT DECIDE
 ----------------------------------------------------
 * Gap 8 / DR-27 — whether `valid_samples_pressure` becomes `null` when
   pressure conversion is unconfigured. OPEN. This script never branches
   on that value; it sends `null` as the placeholder the contract shows
   and asserts nothing about its meaning.
 * `nack` reason vocabulary (§8 item 3 — OPEN). The script does not send
   messages designed to trigger any particular reason code.
 * Retry limit, timeout and backoff values (§8 item 4 — OPEN). The only
   timing here is the local 1-second pacing between messages, which is a
   simulator convenience, not a protocol value.
 * PC-side envelope (§8 item 24 — OPEN). The 4 PC-originated messages are
   NOT simulated, precisely because that envelope is unresolved.
 * `live_state` packing structure (§3.4 — OPEN). One station and one
   nozzle are sent to exercise the path; no packing scheme is implied.
 * PC -> ESP32 configuration authentication (§8 item 5 — OPEN).
 * Journal-pressure threshold behind `journal_pressure_indicator`
   (D-D6 — OPEN). The flag is sent; no threshold is asserted.
"""

import argparse
import asyncio
import json
import sys

import websockets

SERVER_URL = "ws://127.0.0.1:8000/ws/device"
MESSAGE_DELAY_S = 1.0
REPLY_TIMEOUT_S = 2.0
CONNECT_ATTEMPTS = 3
CONNECT_RETRY_DELAY_S = 1.0
LOOP_DELAY_S = 1.0

DEVICE_ID = "esp32-01"
BOOT_ID = "<boot_id>"

# The console on Windows may use cp1252, which cannot encode the arrow
# characters used below. Reconfigure stdout so the script never crashes
# on a legacy console: UTF-8 where supported, backslash escapes where not.
# This is a local display concern only and has no protocol meaning.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
except AttributeError:
    pass

# Types the server does NOT answer (§12.1: live_state is unacknowledged).
NO_REPLY_TYPES = ("hello", "live_state", "time_sync_reply", "config_result")

# PC-originated types this simulator deliberately does not send.
PC_ORIGINATED = ("time_sync", "config_set", "ack", "nack")


def envelope(msg_type: str, seq: int, payload: dict, record_seq=None) -> dict:
    """Build the ESP32-originated envelope required by contract §3.1.

    Gap 6: message_id uses `seq`; record_id uses `record_seq`. They are
    therefore DIFFERENT strings for every durable record.
    """
    message = {
        "protocol_version": "1.0.0",
        "type": msg_type,
        "message_id": f"{DEVICE_ID}:{BOOT_ID}:{seq}",
        "device_id": DEVICE_ID,
        "boot_id": BOOT_ID,
        "seq": seq,
        "ts_sent_ms": 0,
        "ts_sent_valid": 1,
        "payload": payload,
    }
    if record_seq is not None:
        message["record_seq"] = record_seq
        message["record_id"] = f"{DEVICE_ID}:{BOOT_ID}:{record_seq}"
    return message


def build_messages() -> list:
    """Return the 12 ESP32-originated messages in §3.2 order.

    seq increments per message; record_seq increments per durable record.
    The nested cycle_summary inside the batch carries its own seq (13) and
    its own record_seq (8), so its message_id and record_id also differ.
    """
    return [
        envelope("hello", 1, {
            "firmware_version": "<string>",
            "protocol_versions_supported": ["..."],
            "boot_id": BOOT_ID,
            "station_count": 16,
            "channel_count": 64,
        }),
        envelope("live_state", 2, {
            "event_time": 0,
            "event_time_valid": 1,
            "stations": [{
                "station_id": 1,
                "nozzles": [{
                    "nozzle_id": 1,
                    "raw_pressure_voltage": 0,
                    "raw_temperature_voltage": 0,
                    "converted_pressure": None,
                    "converted_temperature": None,
                    "channel_state": "unconfigured",
                }],
            }],
            "invalid_channel_count_now": 0,
            "volatile_loss_counter": 0,
            "data_loss_pending": False,
            "journal_pressure_indicator": False,
        }),
        envelope("cycle_summary", 3, {
            "station_id": 1,
            "nozzles": [{
                "nozzle_id": 1,
                "valid_samples_pressure": 0,
                "valid_samples_temperature": None,
                "temp_conversion_configured": False,
                "pressure_avg": None,
                "pressure_min": None,
                "pressure_max": None,
                "temperature_avg": None,
                "temperature_min": None,
                "temperature_max": None,
            }],
            "cycle_start_ms": 0,
            "start_time_valid": 1,
            "cycle_end_ms": 0,
            "end_time_valid": 1,
            "duration_ms": 0,
            "duration_basis": "calendar",
            "faulted_channel_count": 0,
            "fault_transition_count": None,
            "valid_samples_pressure_both_nozzles": None,
            "valid_samples_temperature_both_nozzles": None,
        }, record_seq=1),
        envelope("alarm_event", 4, {
            "event_time": 0,
            "event_time_valid": 1,
            "channel_id": 1,
            "station_id": 1,
            "nozzle_id": 1,
            "alarm_state": "<string>",
            "physical_output_state": "<string>",
            "raw_voltage": 0,
        }, record_seq=2),
        envelope("system_event", 5, {
            "event_time": 0,
            "event_time_valid": 1,
            "event_code": "<string>",
            "detail": "...",
        }, record_seq=3),
        envelope("settings_change", 6, {
            "event_time": 0,
            "event_time_valid": 1,
            "change_source": "pc",
            "settings_affected": ["..."],
            "old_value": "...",
            "new_value": "...",
        }, record_seq=4),
        envelope("interrupted_cycle", 7, {
            "station_id": 1,
            "status": "interrupted",
            "cycle_start_ms": 0,
            "start_time_valid": 1,
            "cycle_end_ms": None,
            "end_time_valid": 0,
            "duration_ms": None,
            "duration_basis": "null",
            "detection_basis": "<string>",
        }, record_seq=5),
        envelope("data_loss", 8, {
            "event_time": 0,
            "event_time_valid": 1,
            "overwrite_priority": "<string>",
            "records_overwritten": 0,
            "overwrite_counters_durable": False,
            "evicted_record_ids": None,
        }, record_seq=6),
        envelope("raw_voltage_record", 9, {
            "event_time": 0,
            "event_time_valid": 1,
            "channel_id": 1,
            "raw_voltage": 0,
            "sample_count": 0,
            "conversion_result": None,
        }, record_seq=7),
        envelope("time_sync_reply", 10, {
            "clock_offset_ms": 0,
            "uptime_ms": 0,
        }),
        envelope("config_result", 11, {
            "request_id": "esp32-01:<boot_id>:0",
            "config_id": "esp32-01:<boot_id>:0",
            "accepted": False,
            "rejected_fields": ["..."],
            "rejection_reason": "<string>",
        }),
        envelope("batch", 12, {
            "records": [envelope("cycle_summary", 13, {
                "station_id": 1,
                "nozzles": ["..."],
                "cycle_start_ms": 0,
                "start_time_valid": 1,
                "cycle_end_ms": 0,
                "end_time_valid": 1,
                "duration_ms": 0,
                "duration_basis": "calendar",
                "faulted_channel_count": 0,
                "fault_transition_count": None,
                "valid_samples_pressure_both_nozzles": None,
                "valid_samples_temperature_both_nozzles": None,
            }, record_seq=8)],
            "record_count": 1,
            "has_more": False,
        }),
    ]


async def connect() -> "websockets.WebSocketClientProtocol":
    """Connect with bounded retry. Returns the socket or exits(1)."""
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        try:
            return await websockets.connect(SERVER_URL)
        except OSError as exc:
            print(f"connect attempt {attempt}/{CONNECT_ATTEMPTS} failed: {exc}")
            if attempt < CONNECT_ATTEMPTS:
                await asyncio.sleep(CONNECT_RETRY_DELAY_S)
    print(f"ERROR: could not connect to {SERVER_URL} after "
          f"{CONNECT_ATTEMPTS} attempts. Is pc/server.py running?")
    sys.exit(1)


async def send_messages(socket, messages, loop=False):
    """Send messages, optionally looping live_state forever."""
    seq = 0
    try:
        for message in messages:
            msg_type = message["type"]
            print(f"→ {msg_type}")
            await socket.send(json.dumps(message))

            if msg_type in NO_REPLY_TYPES:
                print("  ← (no reply expected)")
            else:
                try:
                    reply = json.loads(
                        await asyncio.wait_for(socket.recv(), REPLY_TIMEOUT_S)
                    )
                    print(f"  ← {json.dumps(reply)}")
                except asyncio.TimeoutError:
                    print(f"  ← (no reply within {REPLY_TIMEOUT_S}s)")

            await asyncio.sleep(MESSAGE_DELAY_S)

        if loop:
            print("Entering live_state loop mode (Ctrl+C to stop)...")
            while True:
                seq += 1
                message = envelope("live_state", seq, {
                    "event_time": 0,
                    "event_time_valid": 1,
                    "stations": [{
                        "station_id": 1,
                        "nozzles": [{
                            "nozzle_id": 1,
                            "raw_pressure_voltage": 0,
                            "raw_temperature_voltage": 0,
                            "converted_pressure": None,
                            "converted_temperature": None,
                            "channel_state": "unconfigured",
                        }],
                    }],
                    "invalid_channel_count_now": 0,
                    "volatile_loss_counter": 0,
                    "data_loss_pending": False,
                    "journal_pressure_indicator": False,
                })
                print(f"→ live_state (loop {seq})")
                await socket.send(json.dumps(message))
                await asyncio.sleep(LOOP_DELAY_S)
    except websockets.ConnectionClosed:
        if loop:
            print("Connection closed — exiting loop mode.")
        else:
            raise


async def main() -> int:
    parser = argparse.ArgumentParser(description="Toughening Machine simulator")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Continuously send live_state once per second after the initial burst.",
    )
    args = parser.parse_args()

    print("TOUGHENING MACHINE protocol simulator (Phase 2A) — PROPOSED, NOT APPROVED")
    print(f"target: {SERVER_URL}")
    if args.loop:
        print("Mode: --loop enabled (live_state every 1s after initial burst)")
    else:
        print("Mode: single burst")
    print("Skipping 4 PC-originated messages (time_sync, config_set, "
          "ack, nack) — this simulator plays the ESP32 role.")
    print("-" * 60)

    messages = build_messages()
    socket = await connect()
    try:
        await send_messages(socket, messages, loop=args.loop)
    finally:
        await socket.close()

    if not args.loop:
        print("-" * 60)
        print(f"Done. Sent {len(messages)}, skipped {len(PC_ORIGINATED)}.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        # Ctrl+C exits cleanly with code 0.
        print("\nInterrupted — exiting cleanly.")
        sys.exit(0)