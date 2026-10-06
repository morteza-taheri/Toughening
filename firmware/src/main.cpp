/**
 * TOUGHENING MACHINE — Phase 2C-3b firmware: Wi-Fi AP + WebSocket client.
 *
 * PROPOSED — NOT APPROVED. Compile only. No upload, no flash,
 * no hardware interaction.
 *
 * WHAT THIS FILE DOES
 *   Starts an ESP32 Wi-Fi access point, connects a WebSocket client
 *   to the PC-side server, feeds a task watchdog, and blinks an LED.
 *   No sensing, no ADC, no MUX.
 *
 * OPEN ITEMS THIS FILE DOES NOT DECIDE
 *   See the Phase 2B skeleton block above; this file adds no new
 *   decisions. Wi-Fi credentials and PC address are placeholders
 *   only and will move to NVS in a later phase.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <esp_task_wdt.h>

// ---------------------------------------------------------------------------
// Constants — all PROPOSED unless noted
// ---------------------------------------------------------------------------
static const unsigned long SERIAL_BAUD = 115200UL;  // UART parameter

// Wi-Fi access point
// PROPOSED — user must change before deployment.
// Real credentials belong in NVS (later phase), never in
// source, never in a public repository.
static const char* WIFI_SSID     = "TougheningMachine-AP";
static const char* WIFI_PASSWORD = "CHANGE_ME_BEFORE_USE";

// WebSocket
// PROPOSED: PC address 192.168.4.2 is OPEN (D-B2).
// The final address will be configurable in NVS.
static const char* WS_HOST = "192.168.4.2";
static const uint16_t WS_PORT = 8000;
static const char* WS_URL = "/ws/device";

// Watchdog
static const unsigned long WDT_TIMEOUT_SEC = 5UL;  // PROPOSED (DR-35)

// LED heartbeat — GPIO 13 is PROPOSED (DR-35); verify in Phase 3.
static const int LED_GPIO = 13;
static const unsigned long LED_BLINK_PERIOD_MS = 100UL;  // 10 Hz

// Backoff — PROPOSED
static const unsigned long BACKOFF_INITIAL_MS = 1000UL;
static const unsigned long BACKOFF_MAX_MS = 30000UL;
static const unsigned long BACKOFF_JITTER_PCT = 20UL;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
static WebSocketsClient webSocket;

static unsigned long lastLedMs = 0;
static bool ledState = false;

static unsigned long lastReconnectMs = 0;
static unsigned long reconnectDelayMs = BACKOFF_INITIAL_MS;

// ---------------------------------------------------------------------------
// Structured logging helper
// Format: [<uptime_ms>] <tag>: <msg>
// Never logs credentials.
// ---------------------------------------------------------------------------
static void log_info(const char* tag, const char* msg) {
    Serial.print("[");
    Serial.print((unsigned long)millis());
    Serial.print("] ");
    Serial.print(tag);
    Serial.print(": ");
    Serial.println(msg);
}

// ---------------------------------------------------------------------------
// WebSocket event handler
// ---------------------------------------------------------------------------
static void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    (void)length;
    switch (type) {
        case WStype_DISCONNECTED:
            log_info("ws", "disconnected");
            break;
        case WStype_CONNECTED: {
            log_info("ws", "connected");
            // Send one hello message per Contract §3.3 using placeholders.
            char hello[256];
            snprintf(hello, sizeof(hello),
                "{\"protocol_version\":\"1.1.0\",\"type\":\"hello\","
                "\"message_id\":\"skeleton-1\",\"device_id\":\"skeleton\","
                "\"boot_id\":\"skeleton\",\"seq\":1,"
                "\"ts_sent_ms\":%lu,\"ts_sent_valid\":1,"
                "\"payload\":{"
                "\"firmware_version\":\"0.1.0\","
                "\"protocol_versions_supported\":[\"1.1.0\"],"
                "\"boot_id\":\"skeleton\","
                "\"station_count\":1,"
                "\"channel_count\":1}}",
                (unsigned long)millis());
            webSocket.sendTXT(hello);
            log_info("ws", "hello sent");
            break;
        }
        case WStype_TEXT:
            // Incoming messages will be handled in a later phase.
            break;
        default:
            break;
    }
}

// ---------------------------------------------------------------------------
// Wi-Fi AP keep-alive
// ---------------------------------------------------------------------------
static void ensure_ap() {
    if (WiFi.softAPSSID().length() == 0) {
        log_info("wifi", "AP down — restarting");
        WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
        log_info("wifi", "AP restarted");
    }
}

// ---------------------------------------------------------------------------
// Backoff with jitter
// Returns a delay in milliseconds.
// ---------------------------------------------------------------------------
static unsigned long next_backoff(unsigned long current) {
    unsigned long next = current * 3 / 2;  // 1.5x growth
    if (next > BACKOFF_MAX_MS) {
        next = BACKOFF_MAX_MS;
    }
    long jitterRange = (long)(next * BACKOFF_JITTER_PCT / 100);
    long jitter = random(-jitterRange, jitterRange);
    long result = (long)next + jitter;
    if (result < (long)BACKOFF_INITIAL_MS / 2) {
        result = BACKOFF_INITIAL_MS / 2;
    }
    if (result > (long)BACKOFF_MAX_MS * 2) {
        result = BACKOFF_MAX_MS * 2;
    }
    return (unsigned long)result;
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(SERIAL_BAUD);
    delay(200);

    log_info("boot", "TOUGHENING MACHINE firmware Phase 2C-3b");
    log_info("boot", "PROPOSED — NOT APPROVED. Compile only.");

    // LED
    pinMode(LED_GPIO, OUTPUT);
    digitalWrite(LED_GPIO, LOW);

    // Wi-Fi AP
    WiFi.mode(WIFI_AP);
    WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
    log_info("wifi", "AP started");

    // WebSocket client — manual reconnect with backoff
    webSocket.setReconnectInterval(0);
    webSocket.onEvent(webSocketEvent);
    webSocket.begin(WS_HOST, WS_PORT, WS_URL);
    log_info("ws", "connecting");

    // Task watchdog — panic handler resets the chip.
    // Logging before reset is not available through this API.
    esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
    esp_task_wdt_add(NULL);
    log_info("wdt", "enabled");
}

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
void loop() {
    const unsigned long nowMs = millis();

    // Feed the watchdog every iteration
    esp_task_wdt_reset();

    // LED heartbeat — non-blocking 10 Hz
    if ((unsigned long)(nowMs - lastLedMs) >= LED_BLINK_PERIOD_MS) {
        lastLedMs = nowMs;
        ledState = !ledState;
        digitalWrite(LED_GPIO, ledState ? HIGH : LOW);
    }

    // Ensure AP stays up
    ensure_ap();

    // WebSocket — reconnect with backoff if disconnected
    webSocket.loop();
    if (webSocket.isConnected()) {
        if (reconnectDelayMs != BACKOFF_INITIAL_MS) {
            reconnectDelayMs = BACKOFF_INITIAL_MS;
        }
    } else {
        if ((unsigned long)(nowMs - lastReconnectMs) >= reconnectDelayMs) {
            lastReconnectMs = nowMs;
            log_info("ws", "reconnect attempt");
            webSocket.begin(WS_HOST, WS_PORT, WS_URL);
            reconnectDelayMs = next_backoff(reconnectDelayMs);
        }
    }
}
