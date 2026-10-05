# PC side — TOUGHENING MACHINE

Phase 2A PC-side skeleton for the Toughening Machine monitoring system.
It hosts a WebSocket endpoint that receives device messages, validates
the envelope, and answers durable records. Nothing is persisted.

**Status: PROPOSED — NOT APPROVED. Phase 2A only. No SQLite
persistence. No firmware.**

Contract: [`docs/PROTOCOL_CONTRACT.md`](../docs/PROTOCOL_CONTRACT.md) v0.2.4
Specification: [`docs/PROJECT_SPECIFICATION.md`](../docs/PROJECT_SPECIFICATION.md) v0.7.2

## Run the server

    pc\venv\Scripts\python.exe -m pc.server

Serves `ws://0.0.0.0:8000/ws/device` and `GET /health`.

## Run the simulator

In another terminal, with the server running:

    pc\venv\Scripts\python.exe pc\simulator.py

Sends the 12 ESP32-originated message types with ~1 s between each.
It plays the ESP32 role and skips the 4 PC-originated types.

## Run the tests

    pc\venv\Scripts\python.exe -m pytest pc/tests/ -v

## Files

| File | Purpose |
|---|---|
| `requirements.txt` | Pinned direct dependencies. |
| `server.py` | FastAPI app: `/health`, `/ws/device`, envelope validation, dispatch. |
| `simulator.py` | ESP32-role WebSocket client sending 12 message types. |
| `tests/test_protocol.py` | Contract §10 tests T-P01…T-P15 plus Gap-resolution tests. |
| `tests/__init__.py` | Empty; makes test discovery predictable on Windows. |
| `venv/` | Virtual environment. Git-ignored, never committed. |

## Gaps 3–8 resolved in contract v0.2.4

* **Gap 3** — `request_id` on `config_set`, echoed by `config_result` (optional).
* **Gap 4** — D-C4 wording: hysteresis/debounce configurable; no numeric values.
* **Gap 5** — `live_state` required field set fixed; packing still OPEN.
* **Gap 6** — `record_seq` separate from `seq`; `record_id` ≠ `message_id`.
* **Gap 7** — batch answered by one `ack` with `acked_record_ids`.
* **Gap 8** — **NOT resolved.** NULL-vs-0 for `valid_samples_pressure` stays OPEN (DR-27).

## Not decided here

Retry/timeout/backoff, `nack` reason vocabulary, transport encryption,
credential storage, config authentication and the journal-pressure
threshold remain OPEN. Final contract approval is a separate task after
Phase 2A completes.