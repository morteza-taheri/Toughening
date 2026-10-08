"""TOUGHENING MACHINE — DEMO data feed for the operator console.

!!! DEMO ONLY — NOT DEVICE DATA, NOT CALIBRATION, NOT A DECISION !!!

`pc/simulator.py` stays the contract-pure ESP32 simulator (values 0/1/null).
This script exists only so the operator GUI can be seen with realistic-looking
motion: 16 stations x 2 nozzles, 12+ hours of cycle history and a few events.
All numbers here are synthetic and carry no meaning for the real machine.
Every record it writes has a record_id starting with "demo:" so it can be
removed with --purge.

Usage (server must be running for the live part):

    pc\\venv\\Scripts\\python.exe -m pc.demo_feed            # backfill 24 h + live loop
    pc\\venv\\Scripts\\python.exe -m pc.demo_feed --no-live  # backfill only
    pc\\venv\\Scripts\\python.exe -m pc.demo_feed --purge    # delete all demo records
"""

import argparse
import asyncio
import json
import math
import random
import sys
import time

from pc import db as pc_db

SERVER_URL = "ws://127.0.0.1:8000/ws/device"
STATIONS = list(range(1, 17))
UNCONFIGURED = {12}        # demo: station without conversion configured
SILENT = {15}              # demo: station that is not reporting live
OUT_OF_RANGE = {(7, 2)}    # demo: (station, nozzle) out of range

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
except AttributeError:
    pass


def _now_ms() -> int:
    return int(time.time() * 1000)


def _pressure(sid: int, nz: int, t_ms: int) -> float:
    base = 1.05 + (sid % 5) * 0.07 + (0.03 if nz == 2 else 0.0)
    drift = 0.09 * math.sin(t_ms / 3.6e6 * 0.9 + sid)
    wobble = 0.03 * math.sin(t_ms / 6e5 + sid * nz)
    return round(base + drift + wobble + random.uniform(-0.012, 0.012), 3)


def _temperature(sid: int, nz: int, t_ms: int) -> float:
    base = 52 + (sid % 4) * 3.5 + (1.5 if nz == 2 else 0.0)
    drift = 6 * math.sin(t_ms / 3.6e6 * 0.55 + sid / 2)
    return round(base + drift + random.uniform(-0.6, 0.6), 2)


def _cycle_payload(sid: int, end_ms: int, faulted: bool) -> dict:
    duration = random.randint(150, 260) * 1000
    nozzles = []
    for nz in (1, 2):
        p, c = _pressure(sid, nz, end_ms), _temperature(sid, nz, end_ms)
        spread_p, spread_c = random.uniform(0.03, 0.08), random.uniform(1.0, 2.8)
        nozzles.append({
            "nozzle_id": nz,
            "valid_samples_pressure": random.randint(140, 180),
            "valid_samples_temperature": random.randint(140, 180),
            "temp_conversion_configured": True,
            "pressure_avg": p,
            "pressure_min": round(p - spread_p, 3),
            "pressure_max": round(p + spread_p * (1.6 if faulted else 1.0), 3),
            "temperature_avg": c,
            "temperature_min": round(c - spread_c, 2),
            "temperature_max": round(c + spread_c, 2),
        })
    return {
        "station_id": sid,
        "nozzles": nozzles,
        "cycle_start_ms": end_ms - duration,
        "start_time_valid": 1,
        "cycle_end_ms": end_ms,
        "end_time_valid": 1,
        "duration_ms": duration,
        "duration_basis": "calendar",
        "faulted_channel_count": 1 if faulted else 0,
        "fault_transition_count": None,
        "valid_samples_pressure_both_nozzles": random.randint(130, 170),
        "valid_samples_temperature_both_nozzles": random.randint(130, 170),
    }


def _commit(conn, rid: str, rtype: str, payload: dict) -> str:
    return pc_db.commit_record(conn, {"record_id": rid, "type": rtype, "payload": payload})


def backfill(conn, hours: float = 24.0, interval_min: float = 6.0) -> int:
    """Write synthetic cycle history + events straight into SQLite."""
    now = _now_ms()
    start = now - int(hours * 3.6e6)
    step = int(interval_min * 60000)
    written = 0
    for sid in STATIONS:
        if sid in UNCONFIGURED:
            continue
        t = start + random.randint(0, step)
        while t < now:
            # demo gap: station 15 went silent for ~2 h in the middle
            if sid in SILENT and now - 9 * 3.6e6 < t < now - 7 * 3.6e6:
                t += step
                continue
            faulted = sid == 7 and t > now - 3 * 3.6e6 and random.random() < 0.45
            if _commit(conn, f"demo:cyc:{sid}:{t}", "cycle_summary", _cycle_payload(sid, t, faulted)) == "inserted":
                written += 1
            t += step + random.randint(-40000, 40000)

    def ev(offset_h, rtype, payload):
        nonlocal written
        t = now - int(offset_h * 3.6e6)
        payload = {"event_time": t, "event_time_valid": 1, **payload}
        if _commit(conn, f"demo:ev:{rtype}:{t}", rtype, payload) == "inserted":
            written += 1

    ev(23.5, "system_event", {"event_code": "boot", "detail": {"reason": "power_on"}})
    ev(23.4, "system_event", {"event_code": "time_sync_ok"})
    ev(16.2, "settings_change", {"change_source": "pc", "settings_affected": ["ch07.valid_window"]})
    ev(9.1, "interrupted_cycle", {"station_id": 15, "status": "interrupted", "cycle_start_ms": now - int(9.1 * 3.6e6),
                                  "start_time_valid": 1, "cycle_end_ms": None, "end_time_valid": 0,
                                  "duration_ms": None, "duration_basis": "null"})
    ev(6.4, "data_loss", {"overwrite_priority": "oldest", "records_overwritten": 3,
                          "overwrite_counters_durable": True, "evicted_record_ids": None})
    ev(2.6, "alarm_event", {"channel_id": 14, "station_id": 7, "nozzle_id": 2, "alarm_state": "active",
                            "physical_output_state": "on", "raw_voltage": 4.912})
    ev(2.2, "alarm_event", {"channel_id": 14, "station_id": 7, "nozzle_id": 2, "alarm_state": "inactive",
                            "physical_output_state": "off", "raw_voltage": 3.104})
    ev(0.8, "system_event", {"event_code": "wifi_reconnect"})
    return written


def purge(conn) -> int:
    cur = conn.execute("DELETE FROM records WHERE record_id LIKE 'demo:%'")
    conn.commit()
    return cur.rowcount


def live_payload(tick: int) -> dict:
    now = _now_ms()
    stations = []
    invalid = 0
    for sid in STATIONS:
        if sid in SILENT:
            continue
        nozzles = []
        for nz in (1, 2):
            if sid in UNCONFIGURED:
                nozzles.append({"nozzle_id": nz, "raw_pressure_voltage": round(random.uniform(0.4, 0.5), 3),
                                "raw_temperature_voltage": round(random.uniform(0.6, 0.7), 3),
                                "converted_pressure": None, "converted_temperature": None,
                                "channel_state": "unconfigured"})
                continue
            p, c = _pressure(sid, nz, now), _temperature(sid, nz, now)
            oor = (sid, nz) in OUT_OF_RANGE
            invalid += 1 if oor else 0
            nozzles.append({
                "nozzle_id": nz,
                "raw_pressure_voltage": round(4.93 if oor else p / 2.0 * 5 / 2.2, 3),
                "raw_temperature_voltage": round(c / 100 * 5 * 0.8, 3),
                "converted_pressure": None if oor else p,
                "converted_temperature": c,
                "channel_state": "out_of_range" if oor else "valid",
            })
        stations.append({"station_id": sid, "nozzles": nozzles})
    return {
        "event_time": now, "event_time_valid": 1, "stations": stations,
        "invalid_channel_count_now": invalid, "volatile_loss_counter": 0,
        "data_loss_pending": False, "journal_pressure_indicator": False,
        "alarm_state": "inactive", "warning_state": "inactive",
    }


def envelope(msg_type: str, seq: int, payload: dict, record_id=None, record_seq=None) -> dict:
    msg = {"protocol_version": "1.1.1", "type": msg_type, "message_id": f"esp32-01:demo:{seq}",
           "device_id": "esp32-01", "boot_id": "demo", "seq": seq, "ts_sent_ms": _now_ms(),
           "ts_sent_valid": 1, "payload": payload}
    if record_id:
        msg["record_id"], msg["record_seq"] = record_id, record_seq
    return msg


async def live_loop(url: str, cycle_every_s: int) -> None:
    import websockets  # installed with the PC requirements
    seq = int(time.time())
    last_cycle = time.time()
    async with websockets.connect(url) as ws:
        print(f"connected to {url} — streaming DEMO live_state (Ctrl+C to stop)")
        while True:
            seq += 1
            await ws.send(json.dumps(envelope("live_state", seq, live_payload(seq))))
            if time.time() - last_cycle >= cycle_every_s:
                last_cycle = time.time()
                for sid in STATIONS:
                    if sid in UNCONFIGURED or sid in SILENT:
                        continue
                    seq += 1
                    t = _now_ms()
                    rid = f"demo:cyc:{sid}:{t}"
                    await ws.send(json.dumps(envelope("cycle_summary", seq, _cycle_payload(sid, t, False), rid, seq)))
                    await asyncio.wait_for(ws.recv(), 5)
                print("  + 15 demo cycle_summary records acknowledged")
            await asyncio.sleep(1.0)


def main() -> int:
    ap = argparse.ArgumentParser(description="DEMO data feed for the operator console")
    ap.add_argument("--hours", type=float, default=24.0, help="hours of history to backfill")
    ap.add_argument("--interval", type=float, default=6.0, help="minutes between demo cycles")
    ap.add_argument("--no-live", action="store_true", help="backfill only, no live stream")
    ap.add_argument("--no-backfill", action="store_true", help="live stream only")
    ap.add_argument("--purge", action="store_true", help="delete all demo records and exit")
    ap.add_argument("--url", default=SERVER_URL)
    ap.add_argument("--cycle-every", type=int, default=60, help="seconds between live demo cycles")
    args = ap.parse_args()

    conn = pc_db.open_db()
    pc_db.init_db(conn)
    if args.purge:
        print(f"removed {purge(conn)} demo records")
        conn.close()
        return 0
    if not args.no_backfill:
        print(f"backfilled {backfill(conn, args.hours, args.interval)} demo records")
    conn.close()
    if args.no_live:
        return 0
    try:
        asyncio.run(live_loop(args.url, args.cycle_every))
    except KeyboardInterrupt:
        pass
    except OSError as exc:
        print(f"cannot reach the server at {args.url}: {exc}\nStart it first:  python -m pc.server")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
