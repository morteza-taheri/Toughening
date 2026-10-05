# TOUGHENING MACHINE — Standing Rules for the AI Assistant

## 1. Authority and scope
- The authoritative requirements document is docs/PROJECT_SPECIFICATION.md. Read it fully at the start of every task. Its status labels (DECIDED, APPROVED, PROPOSED — NOT APPROVED, OPEN — NOT APPROVED, BLOCKED, DEFERRED) are binding. docs/PROTOCOL_CONTRACT.md is a draft until I approve it.
- No phase is authorized by default. A phase is authorized only when the current task prompt names it and states that it is authorized. Satisfied gate conditions never authorize a phase by themselves; only my explicit statement does.
- Silence in the spec is not approval. Never resolve, assume, or pick a "sensible default" for any OPEN decision. List it as a question instead.
- File scope: only the files and folders named in the current task prompt may be created or changed. Documents go in docs/. Never work outside the project workspace.

## 2. Hard prohibitions
- Never invent hardware facts, pin assignments, ADC / multiplexer / divider / protection designs, alarm-driver circuits, sensor datasheet values, calibration values, capacities, timings, or test results.
- Candidate parts mentioned by the user (CD74HC4067, ADS1115, PCF8574) are candidates only until the hardware decisions are approved.
- Never connect or suggest connecting 24 V directly to an ESP32 GPIO.
- Never claim a build, test, or verification passed unless you actually executed it and can quote the real output.
- Never store secrets (Wi-Fi credentials, passwords, tokens) in code, docs, or logs.
- Never change Windows network settings, IP addresses, DHCP, firewall rules, services, scheduled tasks, or the registry. The user applies them manually; you only document them.
- Never install packages or change the development environment unless the task prompt explicitly authorizes it.
- Never delete or overwrite existing files without stating the reason and getting approval. Before editing a baseline document, keep a copy of the previous version in docs/archive/.

## 3. Engineering invariants from the spec (apply once code exists)
- 16 stations numbered 1-16, 2 nozzles each, 32 sensors, 64 analog channels, one ESP32, one firmware. Do not assume the ESP32 can read 64 channels directly. Sampling is 1 sample per second per channel.
- Timestamps are UTC milliseconds. The PC is the sole time reference. Never fabricate a timestamp; the PC receive time never replaces event time. Use the canonical names of spec section 11.6 (event_time, event_time_valid, cycle_start_ms, start_time_valid, cycle_end_ms, end_time_valid, duration_ms, duration_basis, boot_id); never the deprecated time / time_valid.
- Calibration is configured separately for each of the 64 channels. Modes: linear (two points, like Arduino map()) and non-linear (five points, piecewise-linear). Output units are fixed to bar and degrees Celsius. Calibration voltages are ADC-input volts (0-3.3 V). Inside 0-3.3 V the value is extrapolated and valid; outside it is out_of_range. Pressure and temperature both start unconfigured. Never invent calibration values.
- Invalid or out-of-range values are NULL, never 0 and never clamped. Raw voltage is never modified. An out-of-range reading is a data-validity condition plus a system event, not an alarm.
- The PC commits a record to SQLite before sending ACK; the ESP32 deletes a record only after a matching ACK; retransmission must never create duplicate rows (idempotent by record_id).
- The ESP32 journal overwrites the oldest records when full, but every loss must be counted and visibly surfaced; no silent discard. No per-second measurement is stored as a historical record.
- Measurement and alarm logic must keep working without the PC. Alarm policies come only from approved decisions in the spec; do not implement alarm logic for undecided items.
- All settings are validated on the ESP32 before saving (reject empty, NaN, Infinity, wrong type, out-of-range, invalid ordering). Polarity of station inputs, alarm output and reset input is configurable on the ESP32 settings page. The ESP32 settings page uses username + password with a mandatory change of the default password.

## 4. Workflow
- Start every task in Plan Mode: inspect read-only, then present a plan listing every file you intend to create or modify. Wait for my approval before switching to Act Mode.
- Prefer small, reviewable changes. Re-read each file after writing it.
- At the end of every task STOP and report: files created or changed, checks actually performed (with real output), spec items touched, and open questions. Do not continue to the next phase.

## 5. Environment (user-confirmed)
- Development PC: Windows 10 64-bit, VS Code with PlatformIO, Python 3.13.0, internet available during development only.
- Final target: a different Windows 10 64-bit PC without internet; delivery is an offline installer that bundles all prerequisites (tooling decided in a later phase).
- The PC reaches the ESP32 access point through a dedicated USB Wi-Fi adapter.
- Board: ESP32-D0WDQ6, 30-pin, 4 MB flash (retailer data, to be verified read-only in Phase 2B), PlatformIO target esp32dev.

## 6. Language
- Documents, identifiers, file names and commit messages: English.
- Code comments (when code exists): Persian.
- GUI text: Persian and English through i18n resource files, RTL/LTR, Jalali and Gregorian calendars as presentation only.

## 7. Git rules
- Never run `git add`, `git commit`, or `git push` without my
  explicit authorization in the current task prompt.
- Never store credentials, tokens, passwords or secrets in any
  file, commit message, or log.
- The repository is public. Never commit secrets, third-party
  images, private keys, or anything not intentionally public.
- `docs/hardware/esp32-pinout.jpg` is intentionally excluded via
  .gitignore. Do not add it.
- Before every commit, re-read the staged diff and confirm it
  contains only the files authorized by the current task prompt.

## 8. OPEN questions — stop and ask
- Where the specification or the protocol contract says OPEN,
  NOT APPROVED, BLOCKED, DEFERRED, PROPOSED, or "DECISION
  REQUIRED", you MUST stop and ask. Do not pick a default, do
  not extend by symmetry, do not infer from a parallel.
- If you cannot quote a DECIDED, APPROVED, or spec-derived line
  that authorizes a choice, mark the item BLOCKED and stop.
- "Sensible defaults", "probably fine", "for symmetry", and
  "by analogy" are prohibited as justifications for resolving
  an OPEN item.
