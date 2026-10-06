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