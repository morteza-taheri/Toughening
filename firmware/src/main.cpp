/**
 * TOUGHENING MACHINE — Phase 2C-3c firmware: NVS settings persistence.
 *
 * PROPOSED — NOT APPROVED. Compile only. No upload, no flash,
 * no hardware interaction.
 *
 * WHAT THIS FILE DOES
 *   Extends the Phase 2C-3b Wi-Fi AP + WebSocket client with ESP32 NVS
 *   settings persistence. Settings load from NVS on boot; first boot
 *   writes defaults. No sensing, no ADC, no MUX.
 *
 * OPEN ITEMS THIS FILE DOES NOT DECIDE
 *   See the Phase 2B skeleton block above; this file adds no new
 *   decisions. Wi-Fi credentials and PC address are placeholders
 *   only and will be configurable over the network in a later phase.
 */

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <esp_task_wdt.h>

// ---------------------------------------------------------------------------
// Constants — all PROPOSED unless noted
// ---------------------------------------------------------------------------
static const unsigned long SERIAL_BAUD = 115200UL;  // UART parameter

// ---------------------------------------------------------------------------
// Settings defaults — these are the fallback values written to NVS
// on first boot.
// ---------------------------------------------------------------------------
static const char* DEFAULT_WIFI_SSID     = "TougheningMachine-AP";
static const char* DEFAULT_WIFI_PASSWORD = "CHANGE_ME_BEFORE_USE";
static const char* DEFAULT_WS_HOST       = "192.168.4.2";
static const uint16_t DEFAULT_WS_PORT    = 8000;
static const unsigned long DEFAULT_WDT_SEC    = 5UL;
static const int DEFAULT_LED_GPIO         = 13;
static const unsigned long DEFAULT_LED_MS  = 100UL;

// NVS keys — all <= 15 characters.
static const char* NVS_KEY_WIFI_SSID  = "wifi_ssid";
static const char* NVS_KEY_WIFI_PASS  = "wifi_pass";
static const char* NVS_KEY_WS_HOST    = "ws_host";
static const char* NVS_KEY_WS_PORT    = "ws_port";
static const char* NVS_KEY_WDT_SEC    = "wdt_sec";
static const char* NVS_KEY_LED_GPIO   = "led_gpio";
static const char* NVS_KEY_LED_MS     = "led_ms";

// WebSocket URL path — not persisted.
static const char* WS_URL = "/ws/device";

// Backoff — PROPOSED
static const unsigned long BACKOFF_INITIAL_MS = 1000UL;
static const unsigned long BACKOFF_MAX_MS = 30000UL;
static const unsigned long BACKOFF_JITTER_PCT = 20UL;

// ---------------------------------------------------------------------------
// Settings struct
// ---------------------------------------------------------------------------
struct AppSettings {
    char wifi_ssid[64];
    char wifi_password[64];
    char ws_host[64];
    uint16_t ws_port;
    unsigned long wdt_sec;
    int led_gpio;
    unsigned long led_ms;
};

static AppSettings settings;

// ---------------------------------------------------------------------------
// NVS namespace
// ---------------------------------------------------------------------------
static Preferences nvs;

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
// Settings helpers
// ---------------------------------------------------------------------------
static bool settings_load() {
    nvs.begin("toughening", false);
    if (!nvs.isKey(NVS_KEY_WIFI_SSID)) {
        return false;
    }
    nvs.getBytes(NVS_KEY_WIFI_SSID, settings.wifi_ssid, sizeof(settings.wifi_ssid));
    nvs.getBytes(NVS_KEY_WIFI_PASS, settings.wifi_password, sizeof(settings.wifi_password));
    nvs.getBytes(NVS_KEY_WS_HOST, settings.ws_host, sizeof(settings.ws_host));
    settings.ws_port = nvs.getUInt(NVS_KEY_WS_PORT, DEFAULT_WS_PORT);
    settings.wdt_sec = nvs.getUInt(NVS_KEY_WDT_SEC, DEFAULT_WDT_SEC);
    settings.led_gpio = nvs.getUInt(NVS_KEY_LED_GPIO, DEFAULT_LED_GPIO);
    settings.led_ms = nvs.getUInt(NVS_KEY_LED_MS, DEFAULT_LED_MS);
    return true;
}

static void settings_save() {
    nvs.putBytes(NVS_KEY_WIFI_SSID, settings.wifi_ssid, strlen(settings.wifi_ssid) + 1);
    nvs.putBytes(NVS_KEY_WIFI_PASS, settings.wifi_password, strlen(settings.wifi_password) + 1);
    nvs.putBytes(NVS_KEY_WS_HOST, settings.ws_host, strlen(settings.ws_host) + 1);
    nvs.putUInt(NVS_KEY_WS_PORT, settings.ws_port);
    nvs.putUInt(NVS_KEY_WDT_SEC, settings.wdt_sec);
    nvs.putUInt(NVS_KEY_LED_GPIO, settings.led_gpio);
    nvs.putUInt(NVS_KEY_LED_MS, settings.led_ms);
}

static void settings_reset_to_defaults() {
    nvs.clear();
    strncpy(settings.wifi_ssid, DEFAULT_WIFI_SSID, sizeof(settings.wifi_ssid) - 1);
    settings.wifi_ssid[sizeof(settings.wifi_ssid) - 1] = '\0';
    strncpy(settings.wifi_password, DEFAULT_WIFI_PASSWORD, sizeof(settings.wifi_password) - 1);
    settings.wifi_password[sizeof(settings.wifi_password) - 1] = '\0';
    strncpy(settings.ws_host, DEFAULT_WS_HOST, sizeof(settings.ws_host) - 1);
    settings.ws_host[sizeof(settings.ws_host) - 1] = '\0';
    settings.ws_port = DEFAULT_WS_PORT;
    settings.wdt_sec = DEFAULT_WDT_SEC;
    settings.led_gpio = DEFAULT_LED_GPIO;
    settings.led_ms = DEFAULT_LED_MS;
    settings_save();
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
        WiFi.softAP(settings.wifi_ssid, settings.wifi_password);
        log_info("wifi", "AP restarted");
    }
}

// ---------------------------------------------------------------------------
// Backoff with jitter
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

    log_info("boot", "TOUGHENING MACHINE firmware Phase 2C-3c");
    log_info("boot", "PROPOSED — NOT APPROVED. Compile only.");

    bool firstBoot = !settings_load();
    if (firstBoot) {
        settings_reset_to_defaults();
        log_info("nvs", "namespace created, defaults written");
    } else {
        log_info("nvs", "loaded, 7 keys present");
    }

    // LED
    pinMode(settings.led_gpio, OUTPUT);
    digitalWrite(settings.led_gpio, LOW);

    // Wi-Fi AP
    WiFi.mode(WIFI_AP);
    WiFi.softAP(settings.wifi_ssid, settings.wifi_password);
    log_info("wifi", "AP started");

    // WebSocket client — manual reconnect with backoff
    webSocket.setReconnectInterval(0);
    webSocket.onEvent(webSocketEvent);
    webSocket.begin(settings.ws_host, settings.ws_port, WS_URL);
    log_info("ws", "connecting");

    // Task watchdog — panic handler resets the chip.
    // Logging before reset is not available through this API.
    esp_task_wdt_init(settings.wdt_sec, true);
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

    // LED heartbeat — non-blocking
    if ((unsigned long)(nowMs - lastLedMs) >= settings.led_ms) {
        lastLedMs = nowMs;
        ledState = !ledState;
        digitalWrite(settings.led_gpio, ledState ? HIGH : LOW);
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
            webSocket.begin(settings.ws_host, settings.ws_port, WS_URL);
            reconnectDelayMs = next_backoff(reconnectDelayMs);
        }
    }
}
