# PC side — TOUGHENING MACHINE

Phase 2C Stage 2C-3f PC-side server for the Toughening Machine monitoring
system. It hosts a WebSocket endpoint that receives device messages,
validates the envelope and payload, persists durable records to SQLite
(commit-before-ACK), and answers with PC-envelope acknowledgments.

**Status: APPROVED. Phase 2C Stage 2C-3i. Phase 2C is
authorized as a software-only continuation of Phase 2A. Hardware phases
(3+) remain NOT AUTHORIZED.**

The per-type database schema (§14) is still PROPOSED — NOT APPROVED.
Only the minimal `records` table exists for the commit-before-ACK and
idempotent-replay invariants.

Contract: [`docs/PROTOCOL_CONTRACT.md`](../docs/PROTOCOL_CONTRACT.md) v1.1.1
Specification: [`docs/PROJECT_SPECIFICATION.md`](../docs/PROJECT_SPECIFICATION.md) v0.7.6

## Run the server

    pc\venv\Scripts\python.exe -m pc.server

Serves `ws://0.0.0.0:8000/ws/device`, `ws://0.0.0.0:8000/ws/gui`,
`GET /health`, `GET /api/export/csv`, `GET /api/export/json`,
and `GET /` (operator GUI).

## Run the simulator

In another terminal, with the server running:

    pc\venv\Scripts\python.exe pc\simulator.py

Sends the 12 ESP32-originated message types with ~1 s between each.
It plays the ESP32 role and skips the 4 PC-originated types.

## Run the tests

    pc\venv\Scripts\python.exe -m pytest pc/tests/ -v

**Current: 56 passed, 14 skipped (70 tests).**

## Files

| File | Purpose |
|---|---|
| `requirements.txt` | Pinned direct dependencies. |
| `server.py` | FastAPI app: `/health`, `/ws/device`, `/api/export/csv`, `/api/export/json`, ESP32 envelope + payload validation, PC envelope for replies, dispatch with `reset_command` / `reset_result` handlers, SQLite commit before ACK. |
| `db.py` | SQLite persistence: `records` table, idempotent commit, WAL mode. |
| `config.py` | Configuration loader (DR-18). Priority: environment > `pc/config.json` > defaults. Keys: `db_path`, `backup_dir`, `backup_hour`, `backup_retention`. |
| `backup.py` | Daily backup service (DR-18, spec §16.1). WAL-safe snapshot via `sqlite3.Connection.backup()`, filename-sorted retention, interruptible daemon scheduler. |
| `reports.py` | Export helpers: CSV and JSON from the `records` table. PDF and Excel are deferred. |
| `simulator.py` | ESP32-role WebSocket client sending 12 message types. Supports `--loop` for continuous `live_state`. |
| `tests/test_protocol.py` | Contract §10 tests T-P01…T-P17 plus Gap-resolution tests and PC envelope tests. |
| `tests/test_db.py` | Focused unit tests for `db.py`. |
| `tests/test_reports.py` | Focused tests for `reports.py` export functions. |
| `tests/test_gui_ws.py` | Focused tests for `/ws/gui` broadcast behavior. |
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

## Reports and exports (Phase 2C-3e)

* **`/api/export/csv`** — returns `text/csv` with columns
  `record_id, record_type, pc_received_ms, payload_json`.
  Supports optional `since` and `until` query parameters (inclusive
  bounds in milliseconds).
* **`/api/export/json`** — returns `application/json` as an array of
  objects with the same fields plus a parsed `payload` object.
* Empty database → header-only CSV / empty JSON array `[]`.
* **PDF and Excel export are DEFERRED** — not implemented in this stage.
 * **Report templates and layout are OPEN** (DR-20) — not decided here.

## Operator console v2 (Phase 2C)

* `GET /` serves `pc/static/index.html` (Cache-Control: no-store).
* Pages: Dashboard (16 stations + selected-station history, default 12 h),
  Station, Events, Reports, Settings (themes, accent, font, size, digits,
  language, calendar, units, station names, system). Local assets only.
* Read API (pc/history.py): `/api/stations/overview`, `/api/stations/{id}/history`,
  `/api/events`, `/api/summary`. Window = `since` / `until` UTC ms, default last 12 h.
* `python -m pc.demo_feed` — DEMO data (prefix `demo:`, `--purge` removes it).

The simulator (`pc/simulator.py`) plays the ESP32 role in the
protocol: it sends contract-pure ESP32-originated messages
with placeholder values (0/1/null) and skips PC-originated
types. This is for testing protocol validation. The demo
feed (`pc/demo_feed.py`) generates realistic-looking
synthetic data for operator console training; it writes
demo cycles to the database and streams live_state via the
same WebSocket. Because the console expects either device
data or demo data (not both), do NOT run both
simultaneously. Use simulator.py to test protocol behavior,
and demo_feed.py to see realistic console operation.

## Operator GUI (Phase 2C-3g-1, legacy)

* Served at `GET /` and `/static/...`
* Language toggle: English / فارسی
* Calendar toggle: Gregorian / Jalali (presentation only)
* Three panels: Live, History, Reports
* Reports buttons are disabled until later stage
* No CDN, no web fonts, no JS frameworks

## WebSocket GUI (Phase 2C-3g-2)

* **`/ws/gui`** — browser WebSocket endpoint for live data
  - Server broadcasts ESP32 `live_state` messages to all connected GUI clients
  - GUI clients are read-only; they never send data
  - Reconnect with exponential backoff (client-side)
* **Simulator `--loop` flag** — sends `live_state` once per second continuously after the initial burst
  ```bash
  pc\venv\Scripts\python.exe pc\simulator.py --loop
  ```

## Admin panel (DR-50, Phase 2C-3i, PC-side only)

* Served at `GET /admin` and `GET /api/admin/*` (loopback only, HTTP Basic Auth).
* First run creates `pc/admin.config.json` (PBKDF2-HMAC-SHA256, 600 000 iterations,
  16-byte salt, 32-byte dklen) and an audit log `pc/admin_actions.log`; both are
  git-ignored and must not be committed. The default password is set once via the
  environment variable `TOUGHENING_ADMIN_DEFAULT_PASS` at first startup, then
  stored hashed in `pc/admin.config.json` — the plain password never appears in
  code or tracked files. If the env var is unset, a random 16-character password
  is generated and written ONCE to `pc/admin_actions.log`.

### Endpoints

| Route | Method | Behavior |
|---|---|---|
| `/admin` | GET | require_admin → is_loopback or 403 → FileResponse(pc/static/admin.html) + Cache-Control: no-store |
| `/api/admin/status` | GET | require_admin → is_loopback → admin_log("status", username) → get_status() |
| `/api/admin/backups` | GET | require_admin → is_loopback → admin_log("backups_list", username) → get_backups() |
| `/api/admin/backup` | POST | require_admin → is_loopback → admin_log("backup_trigger") → trigger_backup() → admin_log("backup_done", path) → result |
| `/api/admin/logout` | POST | 401 + WWW-Authenticate (forces browser to clear cached credentials) |

### Status endpoint

Returns `{db_path, db_size_bytes, record_count, record_types, backup_dir,
backup_dir_available, last_backup, log_path, config_path}`.

### enable

Set `TOUGHENING_ADMIN_DEFAULT_PASS` in the environment before the first server
start. If unset, a random 16-character password is generated and written ONCE to
`pc/admin_actions.log` — visible only to local admin.

### Change password

Edit `pc/admin.config.json` directly. The format is:
```json
{
  "username_hash": "<base64>salt:hash",
  "created": "2026-01-01T00:00:00Z"
}
```
The hash uses PBKDF2-HMAC-SHA256 with 600 000 iterations, 16-byte salt, and
32-byte dklen. Generate a new hash with:
```bash
python -c "from pc.admin import make_password_hash, password_hash_to_base64; s,h = make_password_hash('newpass'); print(password_hash_to_base64(s,h))"
```

### Security warnings

* HTTP Basic Auth — no TLS in the MVP.
* Loopback-only: only 127.0.0.1, ::1, and localhost may access the admin panel.
* Non-loopback requests receive 403 Forbidden.
* No password change from UI — edit `pc/admin.config.json` directly.
* Audit log: `pc/admin_actions.log` records every action (login, status, backups,
  backup trigger, logout) with a UTC timestamp and username.

### NOT implemented

* Purge demo data
* Delete record
* Restore backup
* Change retention
* Multiple users

## Backup automation (Phase 2C-3h, DR-18)

* **Daily SQLite backup to a configurable destination.** The destination
  directory is set via `TOUGHENING_BACKUP_DIR` (env) or `pc/config.json`
  `backup_dir`. If it is missing or unwritable at startup, a clear warning
  is logged and the server still starts — the scheduler is simply not
  started.
* **WAL-safe method** (spec §16.1): `sqlite3.Connection.backup()` (the
  online backup API, Python stdlib). Falls back to `VACUUM INTO` if the
  API is unavailable. The source connection is opened by the backup
  thread only; the server's `_db_conn` is never touched.
* **Atomic write**: a temp file in `backup_dir` is renamed to
  `backup_YYYYMMDD_HHMMSS.sqlite` via `os.replace()`.
* **Retention**: default 30 (DR-18), configurable via
  `TOUGHENING_BACKUP_RETENTION` / `backup_retention`. Oldest backups
  beyond the limit are deleted; ordering is by **filename**, not mtime
  (`backup_YYYYMMDD_HHMMSS.sqlite` is lexicographically chronological).
* **Catch-up on startup**: if no backup exists or the newest is older
  than 24 hours, one backup runs immediately before the daily loop.
* **Schedule**: `backup_hour` (0-23, local time). **DR-18 leaves the
  run-time default hour OPEN.** The placeholder value `2` in
  `pc/config.py` is NOT authoritative — it exists only until the
  operator sets it. Marked OPEN in code comments.
* **Interruptible**: the scheduler is a daemon thread that waits on a
  `threading.Event` at every sleep point; shutdown sets the event and
  joins with a 2-second timeout.
* **Restore is DEFERRED** (spec §16.2) — not implemented in this stage.

## Not decided here

Retry/timeout/backoff, `nack` reason vocabulary, transport encryption,
credential storage, config authentication and the journal-pressure
threshold remain OPEN. Final contract approval is a separate task after
Phase 2A completes.
