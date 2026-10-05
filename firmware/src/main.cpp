/**
 * TOUGHENING MACHINE — Phase 2B firmware skeleton.
 *
 * PROPOSED — NOT APPROVED. Compile only. No upload, no flash,
 * no hardware interaction.
 *
 * WHAT THIS FILE DOES
 *   Initialises the serial console, prints one banner, then logs a
 *   heartbeat every 5 seconds. Nothing else.
 *
 * OPEN ITEMS THIS SKELETON DOES NOT DECIDE (per .clinerules §8)
 *   Each item below is recorded in docs/PROJECT_SPECIFICATION.md and is
 *   OPEN. This file asserts nothing about any of them.
 *
 *   D-A2   ADC / acquisition architecture ........... OPEN
 *   D-A3   Multiplexer topology .................... OPEN
 *   D-A4   Signal conditioning / divider design .... OPEN
 *   D-D2   Active-cycle marker, completion ordering,
 *          interrupted-cycle detection ............ direction only
 *                                                    (DR-25.7);
 *                                                    detection OPEN
 *   HW-02  Simultaneous station acquisition ........ OPEN
 *   HW-03  Direct same-pass counting ............... OPEN
 *   HW-04  Station input conditioning .............. OPEN
 *   HW-05  Station input protection ................ OPEN
 *   HW-06  Reset input interface ................... OPEN
 *   HW-07  Alarm output interface .................. OPEN
 *   HW-08  Alarm output drive/protection ........... OPEN
 *   HW-09  Power supply / rail definition .......... OPEN
 *   HW-10  Board identification details ............ OPEN
 *   HW-11  Flash size / chip identity .............. OPEN (verify in 2B)
 *   HW-12  USB-UART bridge identity ................ OPEN
 *   HW-13  Flash partition layout .................. OPEN
 *   HW-14  ADC2 / Wi-Fi coexistence ................ OPEN
 *
 *   D-D1, D-D6, D-D7, D-D8, D-D11, D-D12, DR-04C..F, DR-07-C3,
 *   DR-27 (pressure NULL-vs-0), AC-07, AC-13 and AC-19 remain OPEN or
 *   blocked and are equally not decided here.
 *
 * DEFERRED — deliberately absent from this skeleton
 *   Wi-Fi / access point association .............. later phase
 *   WebSocket client to pc/server.py ............. later phase
 *   Sensor or ADC reads ........................... Phase 3 (HW-02,
 *                                                HW-03, HW-14)
 *   Multiplexer / channel scanning ............... Phase 3
 *   NVS settings storage .......................... settings phase
 *   Durable journal, batching, ACK handling ...... journal phase
 *   Cycle, alarm and system event generation ..... later phases
 *   Alarm output driving / polarity ............... Phase 3+
 *
 * NO HARDWARE CONSTANTS APPEAR BELOW. The only literal number in this
 * file is the console baud rate, which is a UART parameter, not a pin.
 */

#include <Arduino.h>

static const unsigned long HEARTBEAT_INTERVAL_MS = 5000UL;
static const unsigned long SERIAL_BAUD = 115200UL;

static unsigned long lastHeartbeatMs = 0;
static unsigned long heartbeatCount = 0;

void setup() {
    Serial.begin(SERIAL_BAUD);
    // Brief pause so the banner is not lost before the port settles.
    delay(200);

    Serial.println();
    Serial.println("TOUGHENING MACHINE firmware skeleton");
    Serial.println("phase: 2B (firmware skeleton)");
    Serial.println("status: PROPOSED - NOT APPROVED");
    Serial.println("build: compile only; no upload, no flash, no hardware interaction");
    Serial.println("skeleton does not decide: D-A2, D-A3, D-A4, D-D2, HW-02..HW-14");
    Serial.println();
}

void loop() {
    const unsigned long nowMs = millis();

    // Unsigned subtraction keeps this correct across the millis() rollover.
    if ((unsigned long)(nowMs - lastHeartbeatMs) >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatMs = nowMs;
        heartbeatCount++;
        Serial.print("heartbeat ");
        Serial.print(heartbeatCount);
        Serial.print(" uptime_ms=");
        Serial.println(nowMs);
    }

    // No sensing, no network, no storage, no output driving.
}