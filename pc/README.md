# PC side — TOUGHENING MACHINE

Phase 2C Stage 1 PC-side server for the Toughening Machine monitoring
system. It hosts a WebSocket endpoint that receives device messages,
validates the envelope **and payload**, and answers durable records.
Nothing is persisted.

**Status: PROPOSED — NOT APPROVED. Phase 2C Stage 1. Phase 2C is
authorized as a software-only continuation of Phase 2A. Hardware phases
(3+) remain NOT AUTHORIZED. No SQLite persistence. No firmware.**

Contract: [`docs/PROTOCOL_CONTRACT.md`](../docs/PROTOCOL_CONTRACT.md) v1.1.0
Specification: [`docs/PROJECT_SPECIFICATION.md`](../docs/PROJECT_SPECIFICATION.md) v0.7.5

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

**Current: 15 passed, 8 skipped (23 tests).**

The skipped set remains: T-P01 PC-originated (envelope OPEN), T-P02
(no SQLite), T-P05 (no SQLite commit), T-P06 (firmware), T-P08 (PC-originated envelope OPEN),
T-P09 (firmware), T-P10 (firmware), T-P17 (physical reset / firmware).

## Files

| File | Purpose |
|---|---|
| `requirements.txt` | Pinned direct dependencies. |
| `server.py` | FastAPI app: `/health`, `/ws/device`, envelope + **payload** validation, dispatch with `reset_command` / `reset_result` handlers. |
| `simulator.py` | ESP32-role WebSocket client sending 12 message types. |
| `tests/test_protocol.py` | Contract §10 tests T-P01…T-P17 plus Gap-resolution tests. |
| `tests/__init__.py` | Empty; makes test discovery predictable on Windows. |
| `venv/` | Virtual environment. Git-ignored, never committed. |

## Phase 2A gaps resolved in contract v1.1.0

* **Gap 3** — `request_id` on `config_set`, echoed by `config_result` (optional).
* **Gap 4** — D-C4 wording: hysteresis/debounce configurable; no numeric values.
* **Gap 5** — `live_state` required field set fixed; packing still OPEN.
* **Gap 6** — `record_seq` separate from `seq`; `record_id` ≠ `message_id`.
* **Gap 7** — batch answered by one `ack` with `acked_record_ids`.
* **Gap 8** — **NOT resolved.** NULL-vs-0 for `valid_samples_pressure` stays OPEN (DR-27).

## Phase 2C Stage 1 additions

* **Payload validation** (`validate_payload`) — checks deprecated aliases
  (`time`, `time_valid`), field types, `duration_basis` enum, the DR-03b
  bidirectional invariant, and `reset_command.target` / `live_state`
  state enums. Reason vocabulary is PROPOSED (contract §8 item 3 — OPEN):
  `invalid_payload`, `deprecated_alias`, `invalid_value`,
  `invariant_violated`.
* **`reset_command` handler** — validates `target` enum, logs the command,
  returns a `reset_result` with `accepted=True` and both states at
  `"inactive"` (TODO: real state tracking).
* **`reset_result` handler** — logs and does not reply (robustness for
  unexpected ESP32-originated reset results).
* **`live_state` summary** — logs `alarm_state` and `warning_state`
  alongside station count.
* **Tests unskipped**: T-P11 (deprecated aliases), T-P12 (duration_basis
  value set), T-P13 (DR-03b invariant).
* **Tests added**: T-P16 (reset_command round-trip), T-P17 (skipped —
  physical reset requires firmware).

## Not decided here

Retry/timeout/backoff, `nack` reason vocabulary, transport encryption,
credential storage, config authentication and the journal-pressure
threshold remain OPEN. Final contract approval is a separate task after
Phase 2A completes.
