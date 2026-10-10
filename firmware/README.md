# Firmware — TOUGHENING MACHINE

**Phase 2B firmware skeleton — PROPOSED — NOT APPROVED.**

The firmware starts the serial console, prints a banner, then logs a
heartbeat every 5 seconds. Nothing else. No sensing, no network, no
storage, no output driving.

## Compile

    pio run -e esp32dev

**Compile only.** There is no upload, no flash and no hardware
interaction in this project. Do not run `pio run -t upload` or
`-t monitor`; the address plan is OPEN (spec D-B2) and Phase 3 is
NOT AUTHORIZED.

## Files

| File | Purpose |
|---|---|
| `platformio.ini` | Build environment `esp32dev` only. |
| `src/main.cpp` | Phase 2C-3c: Wi-Fi AP, WebSocket client, WDT, LED heartbeat, structured logging, NVS settings. |

Build output lands in `.pio/`, which is git-ignored (workspace
`.gitignore` line 13).

## Status (Phase 2C-3b)

Wi-Fi AP + WebSocket client skeleton. No hardware I/O.
Real credentials and PC address belong in NVS (later phase).

## Status (Phase 2C-3c)

Settings live in ESP32 NVS under namespace `"toughening"`.
First boot writes defaults; subsequent boots load them.
A reset-to-defaults helper exists but is not yet reachable
over the network.

## Security note

NVS is stored as plaintext (no flash encryption enabled).
Physical flash access is required to read credentials.
Flash/NVS encryption is deferred to a later phase.

## Known environment notes

Two PlatformIO Cores are installed on this machine (`6.1.18` and
`6.1.19`); `pio` resolves to the older `6.1.18` and warns
"Obsolete PIO Core … is used". This is left as-is deliberately — it is
environment surgery outside Phase 2B scope. If two machines build this
project, verify they resolve the same platform.

Version pinning is deliberately absent from `platformio.ini`. PlatformIO
resolved the platform and framework at build time; that lock is reported
separately and pinning is a user decision.

## Windows environment note

PlatformIO and Python scripts on this project require UTF-8 output. On a
cp1252-default Windows console, run:

    set PYTHONIOENCODING=utf-8

before any `pio` or Python command. This affects the target Windows 10
PC as well as the development PC.

## Not decided here

`D-A2`, `D-A3`, `D-A4`, `D-D2`, `HW-02`…`HW-14` remain OPEN. See the
comment block at the top of `src/main.cpp` and
[`docs/PROJECT_SPECIFICATION.md`](../docs/PROJECT_SPECIFICATION.md) v0.7.2.

Companion: [`docs/PROTOCOL_CONTRACT.md`](../docs/PROTOCOL_CONTRACT.md) v0.2.4.
## Review fixes 2026-10-10 (firmware 0.2.1)

Build / flash (both images are required — the web UI lives in SPIFFS):

    pio run -e esp32dev -t upload       # firmware
    pio run -e esp32dev -t uploadfs     # web UI from firmware/data/
    pio device monitor                  # serial log (115200)

### Development flag `TM_DEV_SHOW_PASSWORD`

| Value | Behaviour |
|---|---|
| `0` (default, env `esp32dev`) | Production. Random one-time password printed on Serial at first boot; re-generated and re-printed at every boot until it has been changed. No plaintext password stored, no master password, no dev endpoint. Any dev plaintext left in NVS is erased. |
| `1` (env `esp32dev_devpw`) | **Development only.** A random password is generated (if none is known), stored together with its hash and **always shown**: Serial at every boot + every 60 s, and a yellow box on the web login page (`GET /api/dev/credentials`). After a password change the new password is shown. The developer master password is accepted. |

    pio run -e esp32dev_devpw -t upload

Switching an existing device to a dev build replaces its web password with a
new random one (the old one is unknown to the firmware). Never deploy a dev build.

### Other notable changes

* PBKDF2 rounds for new hashes: 20 000 (`TM_PBKDF2_ITERATIONS`). 600 000 rounds
  took ~15–25 s per login on the ESP32, blocked the web server and could reset
  the chip through the task watchdog. Old hashes still work and are upgraded on
  the next successful login.
* PC WebSocket client enabled (`TM_ENABLE_PC_WEBSOCKET_CLIENT`, default 1). It
  runs in its own task, only connects while a station is on the AP, and uses
  exponential backoff (1 s → 30 s).
* Watchdog range is now 5–60 s.
