# PC side — TOUGHENING MACHINE

Phase 2C Stage 2C-3f PC-side server for the Toughening Machine monitoring
system. It hosts a WebSocket endpoint that receives device messages,
validates the envelope and payload, persists durable records to SQLite
(commit-before-ACK), and answers with PC-envelope acknowledgments.

**Status: PROPOSED — NOT APPROVED. Phase 2C Stage 2C-3f. Phase 2C is
authorized as a software-only continuation of Phase 2A. Hardware phases
(3+) remain NOT AUTHORIZED. No firmware.**

The per-type database schema (§14) is still PROPOSED — NOT APPROVED.
Only the minimal `records` table exists for the commit-before-ACK and
idempotent-replay invariants.

Contract: [`docs/PROTOCOL_CONTRACT.md`](../docs/PROTOCOL_CONTRACT.md) v1.1.1
Specification: [`docs/PROJECT_SPECIFICATION.md`](../docs/PROJECT_SPECIFICATION.md) v0.7.6

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

**Current: 27 passed, 6 skipped (33 tests).**

The skipped set remains: T-P05 (full process-level scenario),
T-P06 (firmware), T-P08 (config_set payload schema incomplete),
T-P09 (firmware), T-P10 (firmware), T-P17 (physical reset / firmware).

## Files

| File | Purpose |
|---|---|
| `requirements.txt` | Pinned direct dependencies. |
| `server.py` | FastAPI app: `/health`, `/ws/device`, ESP32 envelope + payload validation, PC envelope for replies, dispatch with `reset_command` / `reset_result` handlers, SQLite commit before ACK. |
| `db.py` | SQLite persistence: `records` table, idempotent commit, WAL mode. |
| `simulator.py` | ESP32-role WebSocket client sending 12 message types. |
| `tests/test_protocol.py` | Contract §10 tests T-P01…T-P17 plus Gap-resolution tests and PC envelope tests. |
| `tests/test_db.py` | Focused unit tests for `db.py`. |
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

## Phase 2C Stage 2 additions

* **SQLite persistence** (`db.py`) — minimal schema with only `records`
  and `schema_version` tables. Per-type tables are PROPOSED (§14) and
  are NOT created here.
  - `records`: `record_id TEXT PRIMARY KEY`, `record_type TEXT NOT NULL`,
    `pc_received_ms INTEGER NOT NULL`, `payload_json TEXT NOT NULL`,
    `schema_version INTEGER NOT NULL`.
  - `schema_version`: `version INTEGER PRIMARY KEY`.
* **`commit_record()`** — atomic INSERT with PRIMARY KEY idempotency.
  Duplicate `record_id` returns `"duplicate"` without raising.
* **`check_same_thread=False`** — required because FastAPI/uvicorn runs
  the ASGI app in a worker thread; the connection is used by a single
  logical caller at a time (sequential message processing).
* **Commit-before-ACK** — durable records are committed to SQLite
  **before** their ack is sent. T-P05's full scenario (process kill
  mid-commit) remains out of reach; the ordering invariant is asserted
  by `test_commit_before_ack_ordering`.
* **Idempotent replay** — T-P02 replays a batch 100× and verifies exactly
  one row per `record_id`.
* **New dependency**: `sqlite3` (Python stdlib — no install needed).

## Known limitations

* **Single writer only.** `sqlite3.connect(..., check_same_thread=False)`
  is used because FastAPI's test runner and uvicorn may call into the
  ASGI app from a worker thread. The server currently accepts one device
  connection at a time and processes messages sequentially, so concurrent
  writers do not occur. If concurrent writers are added, replace this
  with a per-request connection or a connection pool plus `threading.Lock`.

## PC envelope (Phase 2C-3f)

* **PC envelope** — every server-emitted `ack`, `nack`, and `reset_result`
  now carries the PC envelope defined in `docs/PROTOCOL_CONTRACT.md`
  v1.1.1 §3.1:
  - `protocol_version`: `"1.1.1"`
  - `type`: message type
  - `pc_id`: `"pc-01"` (PROPOSED)
  - `pc_seq`: monotonic per PC process
  - `ts_sent_ms`: PC clock UTC epoch ms
  - `ts_sent_valid`: `1` (default per DR-17)
  - `payload`: message-specific fields
* **`build_pc_envelope()`** — constructs the envelope; `pc_seq` increments
  per call.
* **`validate_pc_envelope()`** — self-consistency check for PC envelopes.
* **ack/nack fields inside payload** — `acked_record_id`, `committed`,
  `reason`, `retryable`, etc. live inside `payload`, matching Contract
  §3.17 / §3.18.
* **T-P01 PC half unskipped** — asserts PC envelope on server replies.
* **T-P08 remains skipped** — `config_set` payload schema is incomplete;
  the server does not emit `config_set` / `config_result` yet.

## Not decided here

Retry/timeout/backoff, `nack` reason vocabulary, transport encryption,
credential storage, config authentication and the journal-pressure
threshold remain OPEN. Final contract approval is a separate task after
Phase 2A completes.
