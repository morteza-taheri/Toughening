/*
 * Toughening Machine ESP32 controller, Phase 2D-1 (+ review fixes 2026-10-10).
 *
 * Open decisions intentionally left unresolved:
 * DR-10, DR-12, DR-25.4, DR-26, D-D2, HW-02, HW-03, HW-14,
 * DR-48, and DR-49. This phase contains no ADC, MUX, ADS1115,
 * PCF8574T, Wire, SPI, or sensor-acquisition code.
 *
 * Review fixes applied in this revision (see CHANGES_REPORT.md):
 *  - PBKDF2 no longer blocks the async TCP task long enough to trip the
 *    task watchdog (context-reusing implementation, WDT-friendly, stored
 *    iteration count, transparent upgrade of legacy 600 000-round hashes).
 *  - settingsSave() no longer reports failure for empty strings.
 *  - /api/settings/calibration/copy is no longer swallowed by the
 *    /api/settings JSON handler (prefix-matching bug).
 *  - The developer master password is only compiled in development mode.
 *  - Browser WebSockets are bound to their session and closed on logout /
 *    expiry; pushes use the thread-safe textAll().
 *  - The PC WebSocket client runs in its own task with a real exponential
 *    backoff and never blocks loop() / the watchdog.
 *  - Shared state is protected by a recursive mutex.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <SPIFFS.h>
#include <Preferences.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <AsyncJson.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <esp_wifi.h>
#include <mbedtls/md.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <memory>
#include <new>

// ===========================================================================
// DEVELOPMENT FLAG
// ===========================================================================
// TM_DEV_SHOW_PASSWORD = 1  ->  DEVELOPMENT / BENCH TESTING ONLY.
//   * A RANDOM web login password is generated (when none is known yet),
//     kept in NVS together with its hash and ALWAYS displayed:
//       - on Serial at every boot and again every 60 s,
//       - on the web login page (GET /api/dev/credentials, dev builds only).
//     If you change the password while this flag is on, the NEW password is
//     displayed from then on.
//   * The developer master password below is accepted.
// TM_DEV_SHOW_PASSWORD = 0  ->  production behaviour (default):
//   * no plaintext password is kept anywhere, the dev endpoint and the master
//     password do not exist in the binary, and any dev plaintext left in NVS
//     is erased at boot.
// Enable it either here or, preferably, from platformio.ini:
//   pio run -e esp32dev_devpw        (see platformio.ini)
// NEVER ship a build with this flag set to 1.
#ifndef TM_DEV_SHOW_PASSWORD
#define TM_DEV_SHOW_PASSWORD 0
#endif

#if TM_DEV_SHOW_PASSWORD
#ifndef TM_DEV_MASTER_PASSWORD
#define TM_DEV_MASTER_PASSWORD "14129354"
#endif
static const char *DEVELOPER_MASTER_PASSWORD = TM_DEV_MASTER_PASSWORD;
static const uint32_t DEV_PASSWORD_PRINT_MS = 60000UL;
#endif

// PC WebSocket client (ARC-01). 1 = enabled. The client only tries to connect
// while at least one station is associated with the AP, uses exponential
// backoff and runs in its own task, so it is safe to leave enabled when the
// PC is not running. Override with -DTM_ENABLE_PC_WEBSOCKET_CLIENT=0.
#ifndef TM_ENABLE_PC_WEBSOCKET_CLIENT
#define TM_ENABLE_PC_WEBSOCKET_CLIENT 1
#endif

// PBKDF2 rounds for NEW hashes. 600 000 rounds take ~15-25 s on an ESP32 and
// blocked the async web server long enough to trigger the task watchdog and
// the browser's request timeout. The count is stored next to each hash, so
// it can be raised later without breaking existing passwords.
#ifndef TM_PBKDF2_ITERATIONS
#define TM_PBKDF2_ITERATIONS 20000UL
#endif

// Firmware and protocol identifiers from PROTOCOL_CONTRACT.md v1.1.1.
static const char *FIRMWARE_VERSION = "0.2.1";
static const char *WEB_UI_VERSION = "0.2.1";
static const char *PROTOCOL_VERSION = "1.1.1";
static const char *DEVICE_ID = "esp32-01";
static const char *BUILD_DATE = __DATE__ " " __TIME__;

// Wi-Fi and WebSocket defaults from DR-24 and ARC-01.
// The AP password is a known bench default; change it from the web panel.
static const char *DEFAULT_WIFI_SSID = "TougheningMachine-AP";
// DEFAULT AP PASSWORD — DEVELOPMENT ONLY.
// This is the default Access Point password on first boot.
// The operator MUST change it from the device web UI before
// the device is deployed anywhere third parties can reach the
// AP. See PROJECT_SPECIFICATION.md §15.5.
// A future revision may generate this randomly (like the web
// login password) and print it once on Serial at first boot.
static const char *DEFAULT_WIFI_PASSWORD = "test12345";
static const char *DEFAULT_WS_HOST = "192.168.4.2";
static const uint16_t DEFAULT_WS_PORT = 8000;
static const char *DEFAULT_WEB_USERNAME = "admin";

// LED and watchdog defaults from DR-35.
static const uint8_t DEFAULT_WDT_SEC = 5;
static const uint8_t MIN_WDT_SEC = 5;
static const uint8_t MAX_WDT_SEC = 60;
static const uint8_t DEFAULT_LED_GPIO = 2;
static const uint16_t DEFAULT_LED_MS = 100;

// NVS model from the Phase 2D-1 settings specification.
static const char *NVS_NAMESPACE = "toughening";
static const char *NVS_MUST_CHANGE = "web_mustchg";
static const char *NVS_PBKDF2_ITER = "web_iter";
static const char *NVS_CAL_VERSION = "cal_ver";
static const char *NVS_DEV_PASSWORD = "dev_pw";
static const uint8_t STATION_COUNT = 16;
static const uint8_t CHANNEL_COUNT = 64;
static const uint8_t MAX_SESSIONS = 4;
static const uint8_t MAX_BROWSER_CLIENTS = 4;

// Security and timing constants from API.md and DR-50.2.
static const uint8_t LOGIN_FAILURE_LIMIT = 5;
static const uint32_t LOGIN_LOCKOUT_MS = 30000UL;
static const uint32_t SESSION_IDLE_MS = 1800000UL;
static const uint32_t PBKDF2_ITERATIONS = TM_PBKDF2_ITERATIONS;
static const uint32_t PBKDF2_ITERATIONS_LEGACY = 600000UL;
static const uint32_t MAX_REQUEST_BODY = 16384UL;
static const uint32_t BROWSER_PUSH_MS = 1000UL;
static const uint32_t PC_PUSH_MS = 1000UL;
static const uint32_t PC_BACKOFF_INITIAL_MS = 1000UL;
static const uint32_t PC_BACKOFF_MAX_MS = 30000UL;
static const uint32_t PC_HANDSHAKE_WINDOW_MS = 6000UL;
static const uint32_t AP_CHECK_MS = 5000UL;
static const size_t MAX_PC_MESSAGE = 8192;

// LED GPIO allow-list from API.md section 7, plus GPIO2 (on-board LED of the
// ESP32 DevKit and the firmware default; driving it after boot is harmless).
static const int ALLOWED_LED_PINS[] = {
    2, 4, 13, 14, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33
};

struct CalibrationPoint {
    float voltage;
    float value;
};

struct CalibrationChannel {
    uint8_t mode;
    uint8_t pointCount;
    CalibrationPoint points[5];
    float windowMin;
    float windowMax;
};

struct AppSettings {
    String wifiSsid;
    String wifiPassword;
    String wsHost;
    uint16_t wsPort;
    uint8_t wdtSec;
    uint8_t ledGpio;
    uint16_t ledMs;
    String webUsername;
    String webPasswordHash;
    String webPasswordSalt;
    uint32_t webPasswordIter;
    String webSessionSecret;
    bool mustChangePassword;
    String stationNames[STATION_COUNT];
    String stationPolarity;
    String alarmPolarity;
    String resetPolarity;
    CalibrationChannel calibration[CHANNEL_COUNT];
};

struct SessionRecord {
    bool used;
    String sid;
    uint32_t lastActivityMs;
};

struct BrowserBinding {
    bool used;
    uint32_t clientId;
    String sid;
};

static AppSettings settings;
static Preferences preferences;
static AsyncWebServer server(80);
static AsyncWebSocket browserWs("/ws");
static WebSocketsClient pcWs;
static SessionRecord sessions[MAX_SESSIONS];
static BrowserBinding browserBindings[MAX_BROWSER_CLIENTS + 2];
static SemaphoreHandle_t stateMutex = nullptr;
static String bootId;
static uint32_t messageSequence = 1;
static uint32_t lastLedMs = 0;
static uint32_t lastBrowserPushMs = 0;
static uint32_t lastApCheckMs = 0;
static uint32_t pcBackoffMs = PC_BACKOFF_INITIAL_MS;
static uint32_t restartAtMs = 0;
static uint8_t activeLedGpio = DEFAULT_LED_GPIO;
static bool ledState = false;
static volatile bool ledReconfigPending = false;
static volatile bool restartPending = false;
static volatile bool factoryResetPending = false;
static volatile bool pcConnected = false;
static uint8_t failedLoginCount = 0;
static uint32_t loginLockedUntilMs = 0;
#if TM_DEV_SHOW_PASSWORD
static String devPassword;
static uint32_t lastDevPrintMs = 0;
#endif

// RAII guard for the recursive mutex that protects settings, sessions and
// browser bindings (they are touched by the async_tcp task, loop() and the
// PC task). Never hold it while hashing a password.
struct StateLock {
    StateLock() {
        if (stateMutex != nullptr) {
            xSemaphoreTakeRecursive(stateMutex, portMAX_DELAY);
        }
    }
    ~StateLock() {
        if (stateMutex != nullptr) {
            xSemaphoreGiveRecursive(stateMutex);
        }
    }
};

// Log without printing credentials, password hashes, or session values
// (the only exception is the one-time / dev password banner).
static void logInfo(const char *tag, const String &message) {
    Serial.printf("[%lu] %s: %s\n", (unsigned long) millis(), tag, message.c_str());
}

// Encode bytes as lowercase hexadecimal text.
static String bytesToHex(const uint8_t *bytes, size_t length) {
    const char *digits = "0123456789abcdef";
    String result;
    result.reserve(length * 2);
    for (size_t index = 0; index < length; ++index) {
        result += digits[bytes[index] >> 4];
        result += digits[bytes[index] & 0x0f];
    }
    return result;
}

// Return cryptographically random hexadecimal text from the ESP32 RNG.
// The RF subsystem is started before the first call, so esp_random() is a
// true RNG here.
static String randomHex(size_t byteCount) {
    uint8_t bytes[32] = {0};
    if (byteCount > sizeof(bytes)) {
        byteCount = sizeof(bytes);
    }
    esp_fill_random(bytes, byteCount);
    return bytesToHex(bytes, byteCount);
}

// Generate a non-ambiguous random 16-character password (no modulo bias).
static String randomWebPassword() {
    static const char alphabet[] =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const uint32_t alphabetLength = sizeof(alphabet) - 1;
    const uint32_t limit = (0xFFFFFFFFUL / alphabetLength) * alphabetLength;
    String password;
    password.reserve(16);
    while (password.length() < 16) {
        uint32_t value = esp_random();
        if (value >= limit) {
            continue;
        }
        password += alphabet[value % alphabetLength];
    }
    return password;
}

// Compare two strings in time independent of where they differ.
static bool constantTimeEquals(const String &left, const String &right) {
    size_t leftLength = left.length();
    size_t rightLength = right.length();
    size_t length = leftLength > rightLength ? leftLength : rightLength;
    uint8_t difference = leftLength == rightLength ? 0 : 1;
    for (size_t index = 0; index < length; ++index) {
        uint8_t a = index < leftLength ? static_cast<uint8_t>(left[index]) : 0;
        uint8_t b = index < rightLength ? static_cast<uint8_t>(right[index]) : 0;
        difference |= a ^ b;
    }
    return difference == 0;
}

// Return the DR-58 channel identifier for a station, nozzle, and quantity.
[[maybe_unused]] static uint8_t channelId(uint8_t stationId, uint8_t nozzleId, bool pressure) {
    return static_cast<uint8_t>((stationId - 1) * 4 + (nozzleId - 1) * 2
                                + (pressure ? 1 : 2));
}

// Create an unconfigured calibration record with the default 0..5 V window.
static CalibrationChannel emptyCalibration() {
    CalibrationChannel calibration = {};
    calibration.windowMin = 0.0f;
    calibration.windowMax = 5.0f;
    return calibration;
}

// Return true when a calibration record read from NVS is self-consistent.
static bool calibrationIsSane(const CalibrationChannel &calibration) {
    if (calibration.mode > 2) {
        return false;
    }
    uint8_t expected = calibration.mode == 0 ? 0 : (calibration.mode == 1 ? 2 : 5);
    if (calibration.pointCount != expected) {
        return false;
    }
    if (!isfinite(calibration.windowMin) || !isfinite(calibration.windowMax)
        || calibration.windowMin < 0.0f || calibration.windowMax > 5.0f
        || calibration.windowMin >= calibration.windowMax) {
        return false;
    }
    for (uint8_t index = 0; index < expected; ++index) {
        const CalibrationPoint &point = calibration.points[index];
        if (!isfinite(point.voltage) || !isfinite(point.value)
            || point.voltage < 0.0f || point.voltage > 5.0f) {
            return false;
        }
        if (index > 0 && point.voltage <= calibration.points[index - 1].voltage) {
            return false;
        }
    }
    return true;
}

// Check the API-approved LED GPIO set.
static bool isAllowedLedPin(int pin) {
    for (int allowedPin : ALLOWED_LED_PINS) {
        if (pin == allowedPin) {
            return true;
        }
    }
    return false;
}

// Map esp_reset_reason() to the vocabulary used by the web UI.
static const char *resetReasonText() {
    switch (esp_reset_reason()) {
        case ESP_RST_POWERON: return "power_on";
        case ESP_RST_SW: return "software";
        case ESP_RST_PANIC: return "panic";
        case ESP_RST_INT_WDT:
        case ESP_RST_TASK_WDT:
        case ESP_RST_WDT: return "watchdog";
        case ESP_RST_BROWNOUT: return "brownout";
        case ESP_RST_EXT: return "external";
        default: return "unknown";
    }
}

// Return the strongest RSSI among stations associated with the AP.
static bool apBestRssi(int &rssi) {
    wifi_sta_list_t list;
    memset(&list, 0, sizeof(list));
    if (esp_wifi_ap_get_sta_list(&list) != ESP_OK || list.num <= 0) {
        return false;
    }
    int best = -127;
    for (int index = 0; index < list.num; ++index) {
        if (list.sta[index].rssi > best) {
            best = list.sta[index].rssi;
        }
    }
    rssi = best;
    return true;
}

// PBKDF2-HMAC-SHA256 (RFC 8018), one 32-byte block, using a single reused
// HMAC context. Works with mbedTLS 2.x and 3.x. Every 1024 rounds it yields
// to the scheduler and feeds the task watchdog of the calling task (when that
// task is subscribed), so even legacy 600 000-round hashes cannot reboot the
// chip. The salt is the hex text of the random salt (same as before), so
// existing hashes stay valid.
static bool pbkdf2Sha256(const String &password,
                         const String &salt,
                         uint32_t iterations,
                         String &result) {
    const mbedtls_md_info_t *mdInfo =
        mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (mdInfo == nullptr || iterations == 0) {
        return false;
    }
    const bool feedWatchdog = esp_task_wdt_status(nullptr) == ESP_OK;
    const uint8_t blockIndex[4] = {0, 0, 0, 1};
    uint8_t u[32] = {0};
    uint8_t accumulator[32] = {0};
    mbedtls_md_context_t context;
    mbedtls_md_init(&context);
    bool ok = false;
    do {
        if (mbedtls_md_setup(&context, mdInfo, 1) != 0) {
            break;
        }
        if (mbedtls_md_hmac_starts(
                &context,
                reinterpret_cast<const unsigned char *>(password.c_str()),
                password.length()) != 0) {
            break;
        }
        if (mbedtls_md_hmac_update(
                &context,
                reinterpret_cast<const unsigned char *>(salt.c_str()),
                salt.length()) != 0
            || mbedtls_md_hmac_update(&context, blockIndex, sizeof(blockIndex)) != 0
            || mbedtls_md_hmac_finish(&context, u) != 0) {
            break;
        }
        memcpy(accumulator, u, sizeof(accumulator));
        bool failed = false;
        for (uint32_t iteration = 1; iteration < iterations; ++iteration) {
            if (mbedtls_md_hmac_reset(&context) != 0
                || mbedtls_md_hmac_update(&context, u, sizeof(u)) != 0
                || mbedtls_md_hmac_finish(&context, u) != 0) {
                failed = true;
                break;
            }
            for (size_t byte = 0; byte < sizeof(accumulator); ++byte) {
                accumulator[byte] ^= u[byte];
            }
            if ((iteration & 0x3FFUL) == 0) {
                if (feedWatchdog) {
                    esp_task_wdt_reset();
                }
                vTaskDelay(1);
            }
        }
        if (failed) {
            break;
        }
        result = bytesToHex(accumulator, sizeof(accumulator));
        ok = true;
    } while (false);
    mbedtls_md_free(&context);
    memset(u, 0, sizeof(u));
    memset(accumulator, 0, sizeof(accumulator));
    return ok;
}

// Check a candidate password against a hash snapshot (no lock held).
static bool passwordMatchesHash(const String &password,
                                const String &salt,
                                const String &hash,
                                uint32_t iterations) {
    if (hash.isEmpty() || salt.isEmpty()) {
        return false;
    }
    String derivedHash;
    return pbkdf2Sha256(password, salt, iterations, derivedHash)
        && constantTimeEquals(derivedHash, hash);
}

// Return true when the developer master password is compiled in and matches.
static bool isMasterPassword(const String &password) {
#if TM_DEV_SHOW_PASSWORD
    return constantTimeEquals(password, String(DEVELOPER_MASTER_PASSWORD));
#else
    (void) password;
    return false;
#endif
}

// Populate the in-memory settings object with Phase 2D-1 defaults.
static void settingsSetDefaults() {
    settings.wifiSsid = DEFAULT_WIFI_SSID;
    settings.wifiPassword = DEFAULT_WIFI_PASSWORD;
    settings.wsHost = DEFAULT_WS_HOST;
    settings.wsPort = DEFAULT_WS_PORT;
    settings.wdtSec = DEFAULT_WDT_SEC;
    settings.ledGpio = DEFAULT_LED_GPIO;
    settings.ledMs = DEFAULT_LED_MS;
    settings.webUsername = DEFAULT_WEB_USERNAME;
    settings.webPasswordHash = "";
    settings.webPasswordSalt = "";
    settings.webPasswordIter = PBKDF2_ITERATIONS;
    settings.webSessionSecret = "";
    settings.mustChangePassword = true;
    settings.stationPolarity = "active_low";
    settings.alarmPolarity = "active_low";
    settings.resetPolarity = "active_low";
    for (uint8_t station = 0; station < STATION_COUNT; ++station) {
        settings.stationNames[station] = "";
    }
    for (uint8_t channel = 0; channel < CHANNEL_COUNT; ++channel) {
        settings.calibration[channel] = emptyCalibration();
    }
}

// Preferences::putString() returns strlen(value), i.e. 0 for an empty string
// even when the write succeeded. The old code treated that as a failure, so
// every save with an empty station name returned storage_error.
static bool putStringChecked(const char *key, const String &value) {
    size_t written = preferences.putString(key, value);
    return value.isEmpty() ? true : written == value.length();
}

// Persist all settings, including the independent web_mustchg Boolean.
static bool settingsSave() {
    StateLock lock;
    bool success = true;
    success &= putStringChecked("wifi_ssid", settings.wifiSsid);
    success &= putStringChecked("wifi_pass", settings.wifiPassword);
    success &= putStringChecked("ws_host", settings.wsHost);
    success &= preferences.putUShort("ws_port", settings.wsPort) > 0;
    success &= preferences.putUChar("wdt_sec", settings.wdtSec) > 0;
    success &= preferences.putUChar("led_gpio", settings.ledGpio) > 0;
    success &= preferences.putUShort("led_ms", settings.ledMs) > 0;
    success &= putStringChecked("web_user", settings.webUsername);
    success &= putStringChecked("web_hash", settings.webPasswordHash);
    success &= putStringChecked("web_salt", settings.webPasswordSalt);
    success &= preferences.putUInt(NVS_PBKDF2_ITER, settings.webPasswordIter) > 0;
    success &= putStringChecked("sess_secret", settings.webSessionSecret);
    success &= preferences.putBool(NVS_MUST_CHANGE, settings.mustChangePassword) > 0;
    success &= putStringChecked("pol_st", settings.stationPolarity);
    success &= putStringChecked("pol_al", settings.alarmPolarity);
    success &= putStringChecked("pol_rs", settings.resetPolarity);
    for (uint8_t station = 0; station < STATION_COUNT; ++station) {
        String key = String("stname_") + String(station + 1);
        success &= putStringChecked(key.c_str(), settings.stationNames[station]);
    }
    size_t written = preferences.putBytes(
        "cal_blob", settings.calibration, sizeof(settings.calibration));
    success &= written == sizeof(settings.calibration);
    success &= preferences.putUShort(
        NVS_CAL_VERSION, static_cast<uint16_t>(sizeof(CalibrationChannel))) > 0;
#if TM_DEV_SHOW_PASSWORD
    if (!devPassword.isEmpty()) {
        success &= putStringChecked(NVS_DEV_PASSWORD, devPassword);
    }
#endif
    return success;
}

// Print the credentials banner. In production this is only used for the
// one-time password; in dev builds it is repeated (TM_DEV_SHOW_PASSWORD).
static void printPasswordBanner(const String &password, const char *reason) {
    StateLock lock;
    Serial.println();
    Serial.println("==================================================");
    Serial.printf("  WEB LOGIN (%s)\n", reason);
    Serial.printf("  URL      : http://%s/\n", WiFi.softAPIP().toString().c_str());
    Serial.printf("  username : %s\n", settings.webUsername.c_str());
    Serial.printf("  password : %s\n", password.c_str());
    Serial.printf("  must change on login : %s\n",
                  settings.mustChangePassword ? "yes" : "no");
#if TM_DEV_SHOW_PASSWORD
    Serial.printf("  AP SSID  : %s\n", settings.wifiSsid.c_str());
    Serial.printf("  AP pass  : %s\n", settings.wifiPassword.c_str());
    Serial.println("  *** DEVELOPMENT BUILD (TM_DEV_SHOW_PASSWORD=1) ***");
#endif
    Serial.println("==================================================");
    Serial.println();
}

// Create a fresh random first-login password (hash only is stored, except in
// dev builds where the plaintext is kept so it can always be shown).
static bool provisionRandomPassword(String &plainOut) {
    String password = randomWebPassword();
    String salt = randomHex(16);
    String hash;
    if (!pbkdf2Sha256(password, salt, PBKDF2_ITERATIONS, hash)) {
        logInfo("web", "password hashing failed");
        return false;
    }
    {
        StateLock lock;
        settings.webPasswordSalt = salt;
        settings.webPasswordHash = hash;
        settings.webPasswordIter = PBKDF2_ITERATIONS;
        settings.mustChangePassword = true;
#if TM_DEV_SHOW_PASSWORD
        devPassword = password;
#endif
    }
    settingsSave();
    plainOut = password;
    return true;
}

// Clamp or reset values read from NVS so a corrupted / older namespace can
// never put the firmware into a broken state.
static void settingsSanitize() {
    if (settings.wifiSsid.length() < 1 || settings.wifiSsid.length() > 32) {
        settings.wifiSsid = DEFAULT_WIFI_SSID;
    }
    if (settings.wifiPassword.length() < 8 || settings.wifiPassword.length() > 63) {
        settings.wifiPassword = DEFAULT_WIFI_PASSWORD;
    }
    if (settings.wsHost.length() < 1 || settings.wsHost.length() > 63) {
        settings.wsHost = DEFAULT_WS_HOST;
    }
    if (settings.wsPort == 0) {
        settings.wsPort = DEFAULT_WS_PORT;
    }
    if (settings.wdtSec < MIN_WDT_SEC || settings.wdtSec > MAX_WDT_SEC) {
        settings.wdtSec = DEFAULT_WDT_SEC;
    }
    if (!isAllowedLedPin(settings.ledGpio)) {
        settings.ledGpio = DEFAULT_LED_GPIO;
    }
    if (settings.ledMs < 20 || settings.ledMs > 5000) {
        settings.ledMs = DEFAULT_LED_MS;
    }
    if (settings.webUsername.isEmpty()) {
        settings.webUsername = DEFAULT_WEB_USERNAME;
    }
    if (settings.webPasswordIter == 0) {
        settings.webPasswordIter = PBKDF2_ITERATIONS_LEGACY;
    }
    settings.webPasswordHash.toLowerCase();
    String *polarities[] = {
        &settings.stationPolarity, &settings.alarmPolarity, &settings.resetPolarity
    };
    for (String *polarity : polarities) {
        if (*polarity != "active_low" && *polarity != "active_high") {
            *polarity = "active_low";
        }
    }
    for (uint8_t channel = 0; channel < CHANNEL_COUNT; ++channel) {
        if (!calibrationIsSane(settings.calibration[channel])) {
            settings.calibration[channel] = emptyCalibration();
        }
    }
}

// Load settings, creating defaults and the one-time password on first boot.
static bool settingsLoad() {
    preferences.begin(NVS_NAMESPACE, false);
    String announcedPassword;
    const char *announceReason = nullptr;
    bool existed = preferences.isKey("wifi_ssid");
    {
        StateLock lock;
        settingsSetDefaults();
        if (existed) {
            settings.wifiSsid = preferences.getString("wifi_ssid", settings.wifiSsid);
            settings.wifiPassword = preferences.getString("wifi_pass", settings.wifiPassword);
            settings.wsHost = preferences.getString("ws_host", settings.wsHost);
            settings.wsPort = preferences.getUShort("ws_port", DEFAULT_WS_PORT);
            settings.wdtSec = preferences.getUChar("wdt_sec", DEFAULT_WDT_SEC);
            settings.ledGpio = preferences.getUChar("led_gpio", DEFAULT_LED_GPIO);
            settings.ledMs = preferences.getUShort("led_ms", DEFAULT_LED_MS);
            settings.webUsername = preferences.getString("web_user", DEFAULT_WEB_USERNAME);
            settings.webPasswordHash = preferences.getString("web_hash", "");
            settings.webPasswordSalt = preferences.getString("web_salt", "");
            // Hashes written before this revision carry no iteration count.
            settings.webPasswordIter = preferences.getUInt(
                NVS_PBKDF2_ITER, PBKDF2_ITERATIONS_LEGACY);
            settings.webSessionSecret = preferences.getString("sess_secret", "");
            settings.mustChangePassword = preferences.getBool(NVS_MUST_CHANGE, true);
            settings.stationPolarity = preferences.getString("pol_st", "active_low");
            settings.alarmPolarity = preferences.getString("pol_al", "active_low");
            settings.resetPolarity = preferences.getString("pol_rs", "active_low");
            for (uint8_t station = 0; station < STATION_COUNT; ++station) {
                String key = String("stname_") + String(station + 1);
                settings.stationNames[station] = preferences.getString(key.c_str(), "");
            }
            // Only accept the calibration blob when its layout matches.
            size_t blobLength = preferences.getBytesLength("cal_blob");
            uint16_t blobVersion = preferences.getUShort(
                NVS_CAL_VERSION, static_cast<uint16_t>(sizeof(CalibrationChannel)));
            if (blobLength == sizeof(settings.calibration)
                && blobVersion == sizeof(CalibrationChannel)) {
                preferences.getBytes("cal_blob", settings.calibration,
                                     sizeof(settings.calibration));
            } else if (blobLength > 0) {
                logInfo("nvs", "calibration blob layout mismatch, reset to unconfigured");
            }
            settingsSanitize();
        }
#if TM_DEV_SHOW_PASSWORD
        devPassword = preferences.getString(NVS_DEV_PASSWORD, "");
#else
        // A previous development build may have left a plaintext password.
        if (preferences.isKey(NVS_DEV_PASSWORD)) {
            preferences.remove(NVS_DEV_PASSWORD);
        }
#endif
        if (settings.webSessionSecret.isEmpty()) {
            settings.webSessionSecret = randomHex(32);
        }
    }

    if (!existed) {
        // First boot: write defaults and a random first-login password.
        if (provisionRandomPassword(announcedPassword)) {
            announceReason = "first boot, one-time password";
        }
        logInfo("nvs", "namespace created, defaults written");
    } else {
#if TM_DEV_SHOW_PASSWORD
        if (devPassword.isEmpty() || settings.webPasswordHash.isEmpty()) {
            // Dev build on a device whose password is unknown: make a new one.
            if (provisionRandomPassword(announcedPassword)) {
                announceReason = "DEV: new random password";
            }
        } else {
            announcedPassword = devPassword;
            announceReason = "DEV: current password";
        }
#else
        if (settings.webPasswordHash.isEmpty() || settings.mustChangePassword) {
            // The one-time password has never been used to set a real
            // password. It was printed only once before, so a missed serial
            // log meant a locked-out device. Rotate it and print it again.
            if (provisionRandomPassword(announcedPassword)) {
                announceReason = "unused one-time password rotated at boot";
            }
        }
#endif
        settingsSave();
    }
    if (announceReason != nullptr) {
        printPasswordBanner(announcedPassword, announceReason);
    }
    return existed;
}

// Extract the sid cookie from an HTTP request (exact cookie-name match).
static String sidFromRequest(AsyncWebServerRequest *request) {
    if (!request->hasHeader("Cookie")) {
        return "";
    }
    String cookie = request->getHeader("Cookie")->value();
    int start = 0;
    while (start < static_cast<int>(cookie.length())) {
        int end = cookie.indexOf(';', start);
        if (end < 0) {
            end = cookie.length();
        }
        String part = cookie.substring(start, end);
        part.trim();
        if (part.startsWith("sid=")) {
            return part.substring(4);
        }
        start = end + 1;
    }
    return "";
}

// Validate (and optionally refresh) a RAM session by sid.
static int findSessionBySid(const String &sid, bool refresh) {
    if (sid.length() != 64) {
        return -1;
    }
    StateLock lock;
    for (uint8_t index = 0; index < MAX_SESSIONS; ++index) {
        if (!sessions[index].used || !constantTimeEquals(sessions[index].sid, sid)) {
            continue;
        }
        if (static_cast<uint32_t>(millis() - sessions[index].lastActivityMs)
            > SESSION_IDLE_MS) {
            sessions[index].used = false;
            sessions[index].sid = "";
            return -1;
        }
        if (refresh) {
            sessions[index].lastActivityMs = millis();
        }
        return index;
    }
    return -1;
}

// Validate and refresh a RAM session, enforcing the 30-minute idle timeout.
static int findSession(AsyncWebServerRequest *request) {
    return findSessionBySid(sidFromRequest(request), true);
}

// Send a fixed JSON body with the API no-store header.
static void sendRawJson(AsyncWebServerRequest *request,
                        int statusCode,
                        const String &body) {
    AsyncWebServerResponse *response = request->beginResponse(
        statusCode, "application/json; charset=utf-8", body);
    response->addHeader("Cache-Control", "no-store");
    request->send(response);
}

// Require a session and enforce the first-login password-change gate.
static bool requireSession(AsyncWebServerRequest *request,
                           bool allowPasswordChange) {
    if (findSession(request) < 0) {
        sendRawJson(request, 401, "{\"ok\":false,\"error\":\"session_expired\"}");
        return false;
    }
    bool mustChange;
    {
        StateLock lock;
        mustChange = settings.mustChangePassword;
    }
    if (mustChange && !allowPasswordChange) {
        sendRawJson(request, 403,
                    "{\"ok\":false,\"error\":\"password_change_required\"}");
        return false;
    }
    return true;
}

// Serialize a JSON document with the API no-store response header.
static void sendJson(AsyncWebServerRequest *request,
                     int statusCode,
                     JsonDocument &document) {
    String body;
    serializeJson(document, body);
    sendRawJson(request, statusCode, body);
}

// Send a compact API error object.
static void sendError(AsyncWebServerRequest *request,
                      int statusCode,
                      const char *errorCode) {
    JsonDocument document;
    document["ok"] = false;
    document["error"] = errorCode;
    sendJson(request, statusCode, document);
}

// Add one field/code pair to a validation details array.
static void addValidationError(JsonArray details,
                               const String &field,
                               const char *code) {
    JsonObject detail = details.add<JsonObject>();
    detail["field"] = field;
    detail["code"] = code;
}

// Validate one calibration channel according to DR-27 and DR-30.
static bool validateCalibration(JsonObjectConst source,
                               CalibrationChannel &destination,
                               const String &field,
                               JsonArray details) {
    uint8_t mode = 0;
    if (!source["mode"].isNull()) {
        String modeText = source["mode"] | "";
        if (modeText == "linear") {
            mode = 1;
        } else if (modeText == "nonlinear") {
            mode = 2;
        } else {
            addValidationError(details, field + ".mode", "invalid_enum");
            return false;
        }
    }
    JsonArrayConst points = source["points"].as<JsonArrayConst>();
    uint8_t expected = mode == 0 ? 0 : (mode == 1 ? 2 : 5);
    if (points.size() != expected) {
        addValidationError(details, field + ".points", "point_count");
        return false;
    }
    CalibrationChannel candidate = emptyCalibration();
    candidate.mode = mode;
    candidate.pointCount = expected;
    float previousVoltage = -1.0f;
    for (uint8_t index = 0; index < expected; ++index) {
        float voltage = points[index]["voltage"] | NAN;
        float value = points[index]["value"] | NAN;
        if (!isfinite(voltage) || !isfinite(value)) {
            addValidationError(details, field + ".points", "not_finite");
            return false;
        }
        if (voltage < 0.0f || voltage > 5.0f) {
            addValidationError(details, field + ".points.voltage", "voltage_range");
            return false;
        }
        if (index > 0 && voltage <= previousVoltage) {
            addValidationError(details, field + ".points.voltage", "not_ascending");
            return false;
        }
        candidate.points[index].voltage = voltage;
        candidate.points[index].value = value;
        previousVoltage = voltage;
    }
    JsonArrayConst window = source["valid_window"].as<JsonArrayConst>();
    float minimum = window.size() > 0 ? (window[0] | NAN) : NAN;
    float maximum = window.size() > 1 ? (window[1] | NAN) : NAN;
    if (!isfinite(minimum) || !isfinite(maximum) || minimum < 0.0f
        || maximum > 5.0f || minimum >= maximum) {
        addValidationError(details, field + ".valid_window", "window_invalid");
        return false;
    }
    candidate.windowMin = minimum;
    candidate.windowMax = maximum;
    destination = candidate;
    return true;
}

// Validate a partial settings document without mutating live settings.
static bool validateSettingsPatch(JsonObjectConst patch,
                                  AppSettings &candidate,
                                  bool &rebootRequired,
                                  JsonArray details) {
    rebootRequired = false;
    if (patch["wifi"].is<JsonObjectConst>()) {
        JsonObjectConst wifi = patch["wifi"];
        if (wifi["ssid"].is<String>()) {
            String ssid = wifi["ssid"].as<String>();
            if (ssid.length() < 1) {
                addValidationError(details, "wifi.ssid", "required");
            } else if (ssid.length() > 32) {
                addValidationError(details, "wifi.ssid", "too_long");
            } else {
                candidate.wifiSsid = ssid;
            }
        }
        if (wifi["password"].is<String>()) {
            String password = wifi["password"].as<String>();
            bool printable = true;
            for (size_t index = 0; index < password.length(); ++index) {
                if (password[index] < 32 || password[index] > 126) {
                    printable = false;
                }
            }
            if (password.length() < 8) {
                addValidationError(details, "wifi.password", "too_short");
            } else if (password.length() > 63) {
                addValidationError(details, "wifi.password", "too_long");
            } else if (!printable) {
                addValidationError(details, "wifi.password", "invalid_enum");
            } else {
                candidate.wifiPassword = password;
            }
        }
        rebootRequired = true;
    }
    if (patch["ws"].is<JsonObjectConst>()) {
        JsonObjectConst ws = patch["ws"];
        if (ws["host"].is<String>()) {
            String host = ws["host"].as<String>();
            host.trim();
            bool valid = host.length() >= 1 && host.length() <= 63;
            for (size_t index = 0; valid && index < host.length(); ++index) {
                char c = host[index];
                valid = isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '-';
            }
            if (!valid) {
                addValidationError(details, "ws.host", "invalid_host");
            } else {
                candidate.wsHost = host;
            }
        }
        if (ws["port"].is<int>()) {
            int port = ws["port"].as<int>();
            if (port < 1 || port > 65535) {
                addValidationError(details, "ws.port", "out_of_bounds");
            } else {
                candidate.wsPort = static_cast<uint16_t>(port);
            }
        } else if (!ws["port"].isNull()) {
            addValidationError(details, "ws.port", "not_integer");
        }
        rebootRequired = true;
    }
    if (!patch["wdt_sec"].isNull()) {
        if (!patch["wdt_sec"].is<int>()) {
            addValidationError(details, "wdt_sec", "not_integer");
        } else {
            int seconds = patch["wdt_sec"].as<int>();
            if (seconds < MIN_WDT_SEC || seconds > MAX_WDT_SEC) {
                addValidationError(details, "wdt_sec", "out_of_bounds");
            } else {
                if (seconds != candidate.wdtSec) {
                    rebootRequired = true;
                }
                candidate.wdtSec = static_cast<uint8_t>(seconds);
            }
        }
    }
    if (patch["led"].is<JsonObjectConst>()) {
        // LED changes are applied live by loop(); no reboot needed.
        JsonObjectConst led = patch["led"];
        if (led["gpio"].is<int>()) {
            int gpio = led["gpio"].as<int>();
            if (!isAllowedLedPin(gpio)) {
                addValidationError(details, "led.gpio", "reserved_pin");
            } else {
                candidate.ledGpio = static_cast<uint8_t>(gpio);
            }
        }
        if (led["period_ms"].is<int>()) {
            int period = led["period_ms"].as<int>();
            if (period < 20 || period > 5000) {
                addValidationError(details, "led.period_ms", "out_of_bounds");
            } else {
                candidate.ledMs = static_cast<uint16_t>(period);
            }
        }
    }
    if (patch["polarity"].is<JsonObjectConst>()) {
        JsonObjectConst polarity = patch["polarity"];
        String *targets[] = {
            &candidate.stationPolarity,
            &candidate.alarmPolarity,
            &candidate.resetPolarity
        };
        const char *fields[] = {
            "stations_global", "alarm_output", "reset_input"
        };
        for (uint8_t index = 0; index < 3; ++index) {
            if (!polarity[fields[index]].is<String>()) {
                continue;
            }
            String value = polarity[fields[index]].as<String>();
            if (value != "active_low" && value != "active_high") {
                addValidationError(details, String("polarity.") + fields[index],
                                   "invalid_enum");
            } else {
                *targets[index] = value;
            }
        }
    }
    if (patch["calibration"].is<JsonObjectConst>()) {
        JsonArrayConst channels = patch["calibration"]["channels"]
                                      .as<JsonArrayConst>();
        for (JsonObjectConst channel : channels) {
            int number = channel["channel_id"] | 0;
            if (number < 1 || number > CHANNEL_COUNT) {
                addValidationError(details, "calibration.channels",
                                   "unknown_channel");
                continue;
            }
            CalibrationChannel calibration;
            String field = String("calibration.channels[") + number + "]";
            if (validateCalibration(channel, calibration, field, details)) {
                candidate.calibration[number - 1] = calibration;
            }
        }
    }
    return details.size() == 0;
}

// Serialize the public settings shape without secrets or hashes.
static void addPublicSettings(JsonObject document) {
    StateLock lock;
    JsonObject wifi = document["wifi"].to<JsonObject>();
    wifi["ssid"] = settings.wifiSsid;
    wifi["password_set"] = settings.wifiPassword.length() > 0;
    JsonObject ws = document["ws"].to<JsonObject>();
    ws["host"] = settings.wsHost;
    ws["port"] = settings.wsPort;
    document["wdt_sec"] = settings.wdtSec;
    JsonObject led = document["led"].to<JsonObject>();
    led["gpio"] = settings.ledGpio;
    led["period_ms"] = settings.ledMs;
    JsonObject polarity = document["polarity"].to<JsonObject>();
    polarity["stations_global"] = settings.stationPolarity;
    polarity["alarm_output"] = settings.alarmPolarity;
    polarity["reset_input"] = settings.resetPolarity;
    JsonArray channels = document["calibration"]["channels"].to<JsonArray>();
    for (uint8_t number = 1; number <= CHANNEL_COUNT; ++number) {
        uint8_t zero = number - 1;
        uint8_t station = zero / 4 + 1;
        uint8_t nozzle = (zero % 4) / 2 + 1;
        bool pressure = zero % 2 == 0;
        CalibrationChannel &calibration = settings.calibration[zero];
        JsonObject output = channels.add<JsonObject>();
        output["channel_id"] = number;
        output["quantity"] = pressure ? "pressure" : "temperature";
        output["station_id"] = station;
        output["nozzle_id"] = nozzle;
        if (calibration.mode == 0) {
            output["mode"] = nullptr;
        } else if (calibration.mode == 1) {
            output["mode"] = "linear";
        } else {
            output["mode"] = "nonlinear";
        }
        JsonArray points = output["points"].to<JsonArray>();
        for (uint8_t point = 0; point < calibration.pointCount; ++point) {
            JsonObject item = points.add<JsonObject>();
            item["voltage"] = calibration.points[point].voltage;
            item["value"] = calibration.points[point].value;
        }
        JsonArray window = output["valid_window"].to<JsonArray>();
        window.add(calibration.windowMin);
        window.add(calibration.windowMax);
    }
}

// Serialize the Phase 2D-1 placeholder state.
static void addPlaceholderState(JsonDocument &document) {
    document["uptime_ms"] = millis();
    document["cycle_counter"] = 0;
    int rssi = 0;
    if (apBestRssi(rssi)) {
        document["wifi_rssi"] = rssi;
    } else {
        document["wifi_rssi"] = nullptr;
    }
    document["ap_clients"] = WiFi.softAPgetStationNum();
    document["free_heap"] = ESP.getFreeHeap();
    if (TM_ENABLE_PC_WEBSOCKET_CLIENT) {
        document["ws_connected"] = static_cast<bool>(pcConnected);
    } else {
        document["ws_connected"] = nullptr;
    }
    StateLock lock;
    JsonArray stations = document["stations"].to<JsonArray>();
    for (uint8_t station = 1; station <= STATION_COUNT; ++station) {
        JsonObject output = stations.add<JsonObject>();
        output["station_id"] = station;
        output["name"] = settings.stationNames[station - 1];
        output["activation"] = false;
        output["state"] = "idle";
        output["cycle_number"] = nullptr;
        JsonArray nozzles = output["nozzles"].to<JsonArray>();
        for (uint8_t nozzle = 1; nozzle <= 2; ++nozzle) {
            JsonObject item = nozzles.add<JsonObject>();
            item["nozzle_id"] = nozzle;
            item["raw_pressure_voltage"] = 0.0f;
            item["raw_temperature_voltage"] = 0.0f;
            item["converted_pressure"] = nullptr;
            item["converted_temperature"] = nullptr;
            item["pressure_state"] = "unconfigured";
            item["temperature_state"] = "unconfigured";
        }
    }
}

// Build the JSON state used by GET /api/state and browser WebSocket pushes.
static String stateJson(bool includeType) {
    JsonDocument document;
    if (includeType) {
        document["type"] = "state";
    }
    addPlaceholderState(document);
    String result;
    serializeJson(document, result);
    return result;
}

// Set the delayed restart flags and close browser sockets with code 1001.
static void scheduleRestart(bool factoryReset) {
    factoryResetPending = factoryReset;
    restartAtMs = millis() + 1000UL;
    restartPending = true;
    browserWs.closeAll(1001);
}

// Calculate exponential PC reconnect backoff with plus or minus 20 percent jitter.
static uint32_t nextBackoff(uint32_t current) {
    uint32_t next = current * 3UL / 2UL;
    if (next > PC_BACKOFF_MAX_MS) {
        next = PC_BACKOFF_MAX_MS;
    }
    long jitter = static_cast<long>(next / 5UL);
    long value = static_cast<long>(next) + random(-jitter, jitter + 1);
    if (value < 500L) {
        value = 500L;
    }
    return static_cast<uint32_t>(value);
}

// Fill the frozen v1.1.1 ESP32 envelope. Must run in the PC task only.
static JsonObject beginPcEnvelope(JsonDocument &document, const char *type) {
    document["protocol_version"] = PROTOCOL_VERSION;
    document["type"] = type;
    document["message_id"] = String(DEVICE_ID) + ":" + bootId + ":"
                              + messageSequence;
    document["device_id"] = DEVICE_ID;
    document["boot_id"] = bootId;
    document["seq"] = messageSequence++;
    document["ts_sent_ms"] = millis();
    document["ts_sent_valid"] = 0;
    return document["payload"].to<JsonObject>();
}

// Serialize and send one message to the PC.
static void sendPcDocument(JsonDocument &document) {
    String message;
    serializeJson(document, message);
    pcWs.sendTXT(message);
}

// Send the frozen v1.1.1 hello message to the PC.
static void sendPcHello() {
    JsonDocument document;
    JsonObject payload = beginPcEnvelope(document, "hello");
    payload["firmware_version"] = FIRMWARE_VERSION;
    payload["protocol_versions_supported"].to<JsonArray>().add(PROTOCOL_VERSION);
    payload["boot_id"] = bootId;
    payload["station_count"] = STATION_COUNT;
    payload["channel_count"] = CHANNEL_COUNT;
    sendPcDocument(document);
    logInfo("ws", "hello sent");
}

// Send the frozen v1.1.1 placeholder live_state message to the PC.
static void sendPcLiveState() {
    JsonDocument document;
    JsonObject payload = beginPcEnvelope(document, "live_state");
    payload["event_time"] = 0;
    payload["event_time_valid"] = 0;
    JsonArray stations = payload["stations"].to<JsonArray>();
    for (uint8_t station = 1; station <= STATION_COUNT; ++station) {
        JsonObject output = stations.add<JsonObject>();
        output["station_id"] = station;
        JsonArray nozzles = output["nozzles"].to<JsonArray>();
        for (uint8_t nozzle = 1; nozzle <= 2; ++nozzle) {
            JsonObject item = nozzles.add<JsonObject>();
            item["nozzle_id"] = nozzle;
            item["raw_pressure_voltage"] = 0.0f;
            item["raw_temperature_voltage"] = 0.0f;
            item["converted_pressure"] = nullptr;
            item["converted_temperature"] = nullptr;
            item["channel_state"] = "unconfigured";
        }
    }
    payload["invalid_channel_count_now"] = 0;
    payload["volatile_loss_counter"] = 0;
    payload["data_loss_pending"] = false;
    payload["journal_pressure_indicator"] = false;
    payload["alarm_state"] = "inactive";
    payload["warning_state"] = "inactive";
    sendPcDocument(document);
}

// Handle one PC -> ESP32 message (contract §3.17-§3.19 and v1.1.0 reset).
static void handlePcMessage(const uint8_t *data, size_t length) {
    if (length == 0 || length > MAX_PC_MESSAGE) {
        logInfo("ws", String("incoming message ignored, length=") + length);
        return;
    }
    JsonDocument incoming;
    DeserializationError error = deserializeJson(incoming, data, length);
    if (error) {
        logInfo("ws", String("incoming message not JSON: ") + error.c_str());
        return;
    }
    String type = incoming["type"] | "";
    JsonObjectConst payload = incoming["payload"].as<JsonObjectConst>();
    if (type == "ack") {
        logInfo("ws", String("ack committed=")
                          + ((payload["committed"] | false) ? "true" : "false"));
    } else if (type == "nack") {
        logInfo("ws", String("nack reason=") + (payload["reason"] | "?"));
    } else if (type == "time_sync") {
        // Diagnostic only; the offset is never applied retroactively (§5).
        int64_t pcTime = payload["pc_time_ms"] | static_cast<int64_t>(0);
        JsonDocument reply;
        JsonObject out = beginPcEnvelope(reply, "time_sync_reply");
        out["clock_offset_ms"] = pcTime - static_cast<int64_t>(millis());
        out["uptime_ms"] = millis();
        sendPcDocument(reply);
        logInfo("ws", "time_sync answered");
    } else if (type == "reset_command") {
        // No alarm / warning state machine exists yet: both stay inactive.
        JsonDocument reply;
        JsonObject out = beginPcEnvelope(reply, "reset_result");
        out["accepted"] = true;
        out["alarm_state"] = "inactive";
        out["warning_state"] = "inactive";
        if (payload["request_id"].is<const char *>()) {
            out["request_id"] = payload["request_id"].as<const char *>();
        }
        sendPcDocument(reply);
        logInfo("ws", "reset_command answered");
    } else if (type == "config_set") {
        // Remote configuration authentication is OPEN (§8 item 5): reject.
        JsonDocument reply;
        JsonObject out = beginPcEnvelope(reply, "config_result");
        out["config_id"] = String(DEVICE_ID) + ":" + bootId + ":cfg";
        out["accepted"] = false;
        out["rejected_fields"].to<JsonArray>().add("config_kind");
        out["rejection_reason"] = "remote_config_not_supported";
        if (payload["request_id"].is<const char *>()) {
            out["request_id"] = payload["request_id"].as<const char *>();
        }
        sendPcDocument(reply);
        logInfo("ws", "config_set rejected (not supported in this phase)");
    } else {
        logInfo("ws", String("incoming type ignored: ") + type);
    }
}

// PC WebSocket events (runs inside pcWs.loop(), i.e. in the PC task).
static void pcWebSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
    if (type == WStype_CONNECTED) {
        pcConnected = true;
        pcBackoffMs = PC_BACKOFF_INITIAL_MS;
        logInfo("ws", "connected to PC");
        sendPcHello();
    } else if (type == WStype_TEXT) {
        handlePcMessage(payload, length);
    } else if (type == WStype_DISCONNECTED) {
        if (pcConnected) {
            logInfo("ws", "disconnected from PC");
        }
        pcConnected = false;
    } else if (type == WStype_ERROR) {
        logInfo("ws", "websocket error");
    }
}

// Dedicated PC client task: connection attempts are blocking inside the
// WebSockets library, so they must never run in loop() under the watchdog.
static void pcClientTask(void *argument) {
    (void) argument;
    String host;
    uint16_t port;
    {
        StateLock lock;
        host = settings.wsHost;
        port = settings.wsPort;
    }
    pcWs.onEvent(pcWebSocketEvent);
    // Reconnect pacing is done here (exponential backoff), not by the library.
    pcWs.setReconnectInterval(0);
    pcWs.enableHeartbeat(15000, 5000, 2);
    pcWs.begin(host.c_str(), port, "/ws/device");
    logInfo("ws", String("PC client target ws://") + host + ":" + port + "/ws/device");
    uint32_t nextAttemptMs = millis();
    uint32_t lastAttemptMs = 0;
    uint32_t lastPushMs = 0;
    for (;;) {
        uint32_t now = millis();
        bool inHandshake = lastAttemptMs != 0
            && static_cast<uint32_t>(now - lastAttemptMs) < PC_HANDSHAKE_WINDOW_MS;
        if (pcConnected || inHandshake) {
            pcWs.loop();
        } else if (static_cast<int32_t>(now - nextAttemptMs) >= 0) {
            if (WiFi.softAPgetStationNum() > 0) {
                lastAttemptMs = now;
                pcWs.loop();  // performs one (blocking) connection attempt
                pcBackoffMs = nextBackoff(pcBackoffMs);
                nextAttemptMs = millis() + pcBackoffMs;
            } else {
                nextAttemptMs = now + 1000UL;  // nobody on the AP yet
            }
        }
        if (pcConnected) {
            lastAttemptMs = 0;
            if (static_cast<uint32_t>(now - lastPushMs) >= PC_PUSH_MS) {
                lastPushMs = now;
                sendPcLiveState();
            }
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// Remember which session opened a browser socket.
static bool bindBrowserClient(uint32_t clientId, const String &sid) {
    StateLock lock;
    for (BrowserBinding &binding : browserBindings) {
        if (!binding.used) {
            binding.used = true;
            binding.clientId = clientId;
            binding.sid = sid;
            return true;
        }
    }
    return false;
}

// Forget a browser socket binding.
static void unbindBrowserClient(uint32_t clientId) {
    StateLock lock;
    for (BrowserBinding &binding : browserBindings) {
        if (binding.used && binding.clientId == clientId) {
            binding.used = false;
            binding.sid = "";
        }
    }
}

// Authenticate browser WebSocket connections inside WS_EVT_CONNECT and keep
// the binding table in sync on disconnect.
static void browserWebSocketEvent(AsyncWebSocket *socket,
                                  AsyncWebSocketClient *client,
                                  AwsEventType eventType,
                                  void *argument,
                                  uint8_t *data,
                                  size_t length) {
    (void) socket;
    (void) data;
    (void) length;
    if (eventType == WS_EVT_DISCONNECT) {
        unbindBrowserClient(client->id());
        return;
    }
    if (eventType != WS_EVT_CONNECT) {
        return;  // the browser never sends application data
    }
    AsyncWebServerRequest *request =
        reinterpret_cast<AsyncWebServerRequest *>(argument);
    String sid = request != nullptr ? sidFromRequest(request) : String();
    bool mustChange;
    {
        StateLock lock;
        mustChange = settings.mustChangePassword;
    }
    if (request == nullptr || findSessionBySid(sid, true) < 0 || mustChange
        || browserWs.count() > MAX_BROWSER_CLIENTS
        || !bindBrowserClient(client->id(), sid)) {
        client->close(1008);
        return;
    }
    String hello = String("{\"type\":\"hello\",\"protocol_version\":\"")
                   + PROTOCOL_VERSION + "\",\"firmware_version\":\""
                   + FIRMWARE_VERSION + "\",\"device_id\":\"" + DEVICE_ID + "\"}";
    client->text(hello);
    client->text(stateJson(true));
}

// Close browser sockets whose session expired or was logged out. An open
// dashboard socket counts as activity and keeps its session alive.
static void enforceBrowserSessions() {
    uint32_t toClose[MAX_BROWSER_CLIENTS + 2];
    uint8_t closeCount = 0;
    {
        StateLock lock;
        bool mustChange = settings.mustChangePassword;
        for (BrowserBinding &binding : browserBindings) {
            if (!binding.used) {
                continue;
            }
            if (mustChange || findSessionBySid(binding.sid, true) < 0) {
                toClose[closeCount++] = binding.clientId;
                binding.used = false;
                binding.sid = "";
            }
        }
    }
    for (uint8_t index = 0; index < closeCount; ++index) {
        AsyncWebSocketClient *client = browserWs.client(toClose[index]);
        if (client != nullptr) {
            client->close(1008);
        }
    }
}

// Restart the AP if it has disappeared (checked every few seconds only).
static void ensureAccessPoint(uint32_t now) {
    if (static_cast<uint32_t>(now - lastApCheckMs) < AP_CHECK_MS) {
        return;
    }
    lastApCheckMs = now;
    if (WiFi.softAPSSID().length() == 0) {
        String ssid;
        String password;
        {
            StateLock lock;
            ssid = settings.wifiSsid;
            password = settings.wifiPassword;
        }
        bool started = WiFi.softAP(ssid.c_str(), password.c_str());
        logInfo("wifi", started ? "AP restarted" : "AP restart failed");
    }
}

// Register the flat SPIFFS files and favicon response.
static void registerStaticRoutes() {
    struct StaticRoute {
        const char *url;
        const char *file;
        const char *mime;
        const char *cache;
    };
    static const StaticRoute routes[] = {
        {"/", "/index.html", "text/html; charset=utf-8", "no-cache"},
        {"/index.html", "/index.html", "text/html; charset=utf-8", "no-cache"},
        {"/style.css", "/style.css", "text/css; charset=utf-8", "no-cache"},
        {"/app.js", "/app.js", "application/javascript; charset=utf-8", "no-cache"},
        {"/dashboard.js", "/dashboard.js", "application/javascript; charset=utf-8", "no-cache"},
        {"/settings.js", "/settings.js", "application/javascript; charset=utf-8", "no-cache"},
        {"/calibration.js", "/calibration.js", "application/javascript; charset=utf-8", "no-cache"},
        {"/Vazirmatn-subset.woff2", "/Vazirmatn-subset.woff2", "font/woff2", "public, max-age=31536000"},
        // Older index.html / style.css referenced the font under assets/.
        {"/assets/Vazirmatn-subset.woff2", "/Vazirmatn-subset.woff2", "font/woff2", "public, max-age=31536000"}
    };
    for (const StaticRoute &route : routes) {
        StaticRoute copy = route;
        server.on(copy.url, HTTP_GET, [copy](AsyncWebServerRequest *request) {
            if (!SPIFFS.exists(copy.file)) {
                request->send(404, "text/plain; charset=utf-8",
                              "not found (upload the file system image: pio run -t uploadfs)");
                return;
            }
            AsyncWebServerResponse *response = request->beginResponse(
                SPIFFS, copy.file, copy.mime);
            response->addHeader("Cache-Control", copy.cache);
            request->send(response);
        });
    }
    server.on("/favicon.ico", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(204);
    });
}

// Handle POST /api/login: username/password, 200 with sid, 401, or 429.
static void handleLogin(AsyncWebServerRequest *request,
                        JsonVariant &body) {
    // loginLockedUntilMs == 0 means "not locked". The old check compared
    // against 0 as well, which reported a lockout once millis() passed 2^31
    // (about 24.8 days of uptime).
    if (loginLockedUntilMs != 0
        && static_cast<int32_t>(millis() - loginLockedUntilMs) >= 0) {
        loginLockedUntilMs = 0;
    }
    if (loginLockedUntilMs != 0) {
        JsonDocument output;
        output["ok"] = false;
        output["error"] = "too_many_attempts";
        output["retry_after_s"] =
            (loginLockedUntilMs - millis() + 999UL) / 1000UL;
        sendJson(request, 429, output);
        return;
    }
    String username = body["username"] | "";
    String password = body["password"] | "";
    String expectedUser;
    String salt;
    String hash;
    uint32_t iterations;
    {
        StateLock lock;
        expectedUser = settings.webUsername;
        salt = settings.webPasswordSalt;
        hash = settings.webPasswordHash;
        iterations = settings.webPasswordIter;
    }
    bool userOk = constantTimeEquals(username, expectedUser);
    bool master = userOk && isMasterPassword(password);
    bool passwordOk = master
        || (userOk && password.length() <= 64
            && passwordMatchesHash(password, salt, hash, iterations));
    if (!passwordOk) {
        ++failedLoginCount;
        if (failedLoginCount >= LOGIN_FAILURE_LIMIT) {
            failedLoginCount = 0;
            loginLockedUntilMs = millis() + LOGIN_LOCKOUT_MS;
            if (loginLockedUntilMs == 0) {
                loginLockedUntilMs = 1;
            }
        }
        sendError(request, 401, "invalid_credentials");
        return;
    }
    failedLoginCount = 0;
    // Transparently upgrade a legacy (600 000-round) hash after a real login.
    if (!master && iterations != PBKDF2_ITERATIONS) {
        String newSalt = randomHex(16);
        String newHash;
        if (pbkdf2Sha256(password, newSalt, PBKDF2_ITERATIONS, newHash)) {
            {
                StateLock lock;
                settings.webPasswordSalt = newSalt;
                settings.webPasswordHash = newHash;
                settings.webPasswordIter = PBKDF2_ITERATIONS;
            }
            settingsSave();
            logInfo("web", "password hash upgraded to the current iteration count");
        }
    }
    String sid = randomHex(32);
    bool mustChange;
    {
        StateLock lock;
        // Use a free slot, otherwise evict the least recently used session.
        int slot = -1;
        uint32_t oldestAge = 0;
        for (uint8_t index = 0; index < MAX_SESSIONS; ++index) {
            if (!sessions[index].used) {
                slot = index;
                break;
            }
            uint32_t age = millis() - sessions[index].lastActivityMs;
            if (slot < 0 || age > oldestAge) {
                oldestAge = age;
                slot = index;
            }
        }
        sessions[slot].used = true;
        sessions[slot].sid = sid;
        sessions[slot].lastActivityMs = millis();
        mustChange = settings.mustChangePassword;
    }
    JsonDocument output;
    output["ok"] = true;
    output["must_change_password"] = mustChange;
    output["dev_mode"] = TM_DEV_SHOW_PASSWORD ? true : false;
    String responseBody;
    serializeJson(output, responseBody);
    AsyncWebServerResponse *response = request->beginResponse(
        200, "application/json; charset=utf-8", responseBody);
    response->addHeader("Cache-Control", "no-store");
    // Session cookie (no Max-Age): the server-side 30-minute idle timeout is
    // authoritative; a fixed Max-Age logged active users out after 30 min.
    response->addHeader("Set-Cookie", String("sid=") + sid
                        + "; Path=/; HttpOnly; SameSite=Strict");
    request->send(response);
}

// Handle POST /api/logout: invalidate the sid, close its sockets, clear cookie.
static void handleLogout(AsyncWebServerRequest *request) {
    String sid = sidFromRequest(request);
    {
        StateLock lock;
        for (SessionRecord &record : sessions) {
            if (record.used && !sid.isEmpty() && constantTimeEquals(record.sid, sid)) {
                record.used = false;
                record.sid = "";
            }
        }
    }
    AsyncWebServerResponse *response = request->beginResponse(
        200, "application/json; charset=utf-8", "{\"ok\":true}");
    response->addHeader("Cache-Control", "no-store");
    response->addHeader("Set-Cookie",
                        "sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    request->send(response);
}

// Handle POST /api/password: verify current password and clear web_mustchg.
static void handlePassword(AsyncWebServerRequest *request,
                           JsonVariant &body) {
    if (!requireSession(request, true)) {
        return;
    }
    String current = body["current_password"] | "";
    String replacement = body["new_password"] | "";
    String username;
    String salt;
    String hash;
    uint32_t iterations;
    {
        StateLock lock;
        username = settings.webUsername;
        salt = settings.webPasswordSalt;
        hash = settings.webPasswordHash;
        iterations = settings.webPasswordIter;
    }
    if (!isMasterPassword(current)
        && !passwordMatchesHash(current, salt, hash, iterations)) {
        sendError(request, 400, "wrong_current_password");
        return;
    }
    if (replacement.length() < 8 || replacement.length() > 64
        || replacement == username) {
        sendError(request, 400, "weak_password");
        return;
    }
    // The current password was just verified, so a plain comparison is
    // enough (the old code ran a second full PBKDF2 here).
    if (replacement == current) {
        sendError(request, 400, "same_as_current");
        return;
    }
    String newSalt = randomHex(16);
    String newHash;
    if (!pbkdf2Sha256(replacement, newSalt, PBKDF2_ITERATIONS, newHash)) {
        sendError(request, 500, "storage_error");
        return;
    }
    {
        StateLock lock;
        settings.webPasswordSalt = newSalt;
        settings.webPasswordHash = newHash;
        settings.webPasswordIter = PBKDF2_ITERATIONS;
        settings.mustChangePassword = false;
#if TM_DEV_SHOW_PASSWORD
        devPassword = replacement;
#endif
    }
    if (!settingsSave()) {
        sendError(request, 500, "storage_error");
        return;
    }
#if TM_DEV_SHOW_PASSWORD
    printPasswordBanner(replacement, "DEV: password changed");
#endif
    sendRawJson(request, 200, "{\"ok\":true}");
}

// Handle GET /api/state: return live placeholder state after authentication.
static void handleState(AsyncWebServerRequest *request) {
    if (!requireSession(request, false)) {
        return;
    }
    sendRawJson(request, 200, stateJson(false));
}

// Handle GET /api/status: return firmware, chip, heap, MAC, and reset metadata.
static void handleStatus(AsyncWebServerRequest *request) {
    if (!requireSession(request, false)) {
        return;
    }
    JsonDocument output;
    output["firmware_version"] = FIRMWARE_VERSION;
    output["build_date"] = BUILD_DATE;
    output["protocol_version"] = PROTOCOL_VERSION;
    output["web_ui_version"] = WEB_UI_VERSION;
    output["device_id"] = DEVICE_ID;
    output["boot_id"] = bootId;
    output["uptime_ms"] = millis();
    int rssi = 0;
    if (apBestRssi(rssi)) {
        output["wifi_rssi"] = rssi;
    } else {
        output["wifi_rssi"] = nullptr;
    }
    output["ap_clients"] = WiFi.softAPgetStationNum();
    output["ap_ip"] = WiFi.softAPIP().toString();
    output["free_heap"] = ESP.getFreeHeap();
    output["min_free_heap"] = ESP.getMinFreeHeap();
    output["mac"] = WiFi.softAPmacAddress();
    output["chip_model"] = ESP.getChipModel();
    output["chip_revision"] = ESP.getChipRevision();
    output["total_cycles"] = 0;
    output["reset_reason"] = resetReasonText();
    output["dev_mode"] = TM_DEV_SHOW_PASSWORD ? true : false;
    JsonObject pc = output["pc_link"].to<JsonObject>();
    pc["enabled"] = TM_ENABLE_PC_WEBSOCKET_CLIENT ? true : false;
    pc["connected"] = static_cast<bool>(pcConnected);
    {
        StateLock lock;
        pc["host"] = settings.wsHost;
        pc["port"] = settings.wsPort;
    }
    sendJson(request, 200, output);
}

// Handle GET /api/settings: return settings without secrets.
static void handleSettingsGet(AsyncWebServerRequest *request) {
    if (!requireSession(request, false)) {
        return;
    }
    JsonDocument output;
    addPublicSettings(output.to<JsonObject>());
    sendJson(request, 200, output);
}

// Handle POST /api/settings: validate and atomically persist a partial patch.
static void handleSettingsPost(AsyncWebServerRequest *request,
                               JsonVariant &body) {
    if (!requireSession(request, false)) {
        return;
    }
    if (!body.is<JsonObject>()) {
        sendError(request, 400, "validation");
        return;
    }
    JsonDocument errors;
    JsonArray details = errors["details"].to<JsonArray>();
    // AppSettings is ~4 KB: keep it off the async_tcp task stack.
    std::unique_ptr<AppSettings> candidate;
    {
        StateLock lock;
        candidate.reset(new (std::nothrow) AppSettings(settings));
    }
    if (!candidate) {
        sendError(request, 503, "busy");
        return;
    }
    bool rebootRequired = false;
    validateSettingsPatch(body.as<JsonObjectConst>(), *candidate,
                          rebootRequired, details);
    if (details.size() > 0) {
        errors["ok"] = false;
        errors["error"] = "validation";
        sendJson(request, 400, errors);
        return;
    }
    bool saved;
    {
        StateLock lock;
        if (candidate->ledGpio != settings.ledGpio) {
            ledReconfigPending = true;
        }
        settings = *candidate;
        saved = settingsSave();
    }
    if (!saved) {
        sendError(request, 500, "storage_error");
        return;
    }
    JsonDocument output;
    output["ok"] = true;
    output["reboot_required"] = rebootRequired;
    addPublicSettings(output["settings"].to<JsonObject>());
    sendJson(request, 200, output);
}

// Handle POST /api/settings/calibration/copy with same-quantity results.
static void handleCalibrationCopy(AsyncWebServerRequest *request,
                                  JsonVariant &body) {
    if (!requireSession(request, false)) {
        return;
    }
    int source = body["source_channel"] | 0;
    JsonArrayConst targets = body["targets"].as<JsonArrayConst>();
    if (source < 1 || source > CHANNEL_COUNT || targets.size() == 0
        || targets.size() > CHANNEL_COUNT) {
        sendError(request, 400, "validation");
        return;
    }
    JsonDocument validation;
    JsonArray details = validation["details"].to<JsonArray>();
    CalibrationChannel copied;
    if (!validateCalibration(body.as<JsonObjectConst>(), copied,
                             "copy", details)) {
        validation["ok"] = false;
        validation["error"] = "validation";
        sendJson(request, 400, validation);
        return;
    }
    bool sourcePressure = source % 2 == 1;
    JsonDocument output;
    output["ok"] = true;
    JsonArray results = output["results"].to<JsonArray>();
    bool changed = false;
    bool saved = true;
    {
        StateLock lock;
        for (JsonVariantConst targetValue : targets) {
            int target = targetValue | 0;
            JsonObject result = results.add<JsonObject>();
            result["channel_id"] = target;
            if (target < 1 || target > CHANNEL_COUNT) {
                result["ok"] = false;
                result["error"] = "unknown_channel";
            } else if ((target % 2 == 1) != sourcePressure) {
                result["ok"] = false;
                result["error"] = "quantity_mismatch";
            } else {
                settings.calibration[target - 1] = copied;
                result["ok"] = true;
                changed = true;
            }
        }
        if (changed) {
            saved = settingsSave();
        }
    }
    if (!saved) {
        sendError(request, 500, "storage_error");
        return;
    }
    addPublicSettings(output["settings"].to<JsonObject>());
    sendJson(request, 200, output);
}

// Handle POST /api/reboot: acknowledge and restart one second later.
static void handleReboot(AsyncWebServerRequest *request,
                         JsonVariant &body) {
    if (!requireSession(request, false)) {
        return;
    }
    if (!(body["confirm"] | false)) {
        sendError(request, 400, "confirm_required");
        return;
    }
    sendRawJson(request, 200, "{\"ok\":true,\"reboot_in_ms\":1000}");
    scheduleRestart(false);
}

// Handle POST /api/factory-reset: acknowledge, clear NVS, and restart later.
static void handleFactoryReset(AsyncWebServerRequest *request,
                               JsonVariant &body) {
    if (!requireSession(request, false)) {
        return;
    }
    String confirmation = body["confirm"] | "";
    if (confirmation != "RESET") {
        sendError(request, 400, "confirm_required");
        return;
    }
    sendRawJson(request, 200, "{\"ok\":true,\"reboot_in_ms\":1000}");
    scheduleRestart(true);
}

#if TM_DEV_SHOW_PASSWORD
// DEV ONLY: GET /api/dev/credentials so the login page can always show the
// current password. This route does not exist in production builds.
static void handleDevCredentials(AsyncWebServerRequest *request) {
    JsonDocument output;
    output["ok"] = true;
    output["dev_mode"] = true;
    {
        StateLock lock;
        output["username"] = settings.webUsername;
        output["password"] = devPassword;
        output["must_change_password"] = settings.mustChangePassword;
        output["ap_ssid"] = settings.wifiSsid;
        output["ap_password"] = settings.wifiPassword;
    }
    output["master_password_enabled"] = true;
    sendJson(request, 200, output);
}
#endif

// Register a JSON callback route with the shared body parser library.
static void registerJsonRoute(const char *path,
                              WebRequestMethodComposite method,
                              ArJsonRequestHandlerFunction handler) {
    AsyncCallbackJsonWebHandler *jsonHandler =
        new AsyncCallbackJsonWebHandler(path, handler);
    jsonHandler->setMethod(method);
    jsonHandler->setMaxContentLength(MAX_REQUEST_BODY);
    server.addHandler(jsonHandler);
}

// Register all REST endpoints and the API 404 response.
// ORDER MATTERS: AsyncCallbackJsonWebHandler("/api/settings") also matches
// "/api/settings/<anything>", so the longer path must be registered first.
static void registerApiRoutes() {
    registerJsonRoute("/api/login", HTTP_POST, handleLogin);
    server.on("/api/logout", HTTP_POST,
        [](AsyncWebServerRequest *request) {
            handleLogout(request);
        });
    registerJsonRoute("/api/password", HTTP_POST, handlePassword);
    server.on("/api/state", HTTP_GET, handleState);
    server.on("/api/status", HTTP_GET, handleStatus);
    registerJsonRoute("/api/settings/calibration/copy", HTTP_POST,
                      handleCalibrationCopy);
    server.on("/api/settings", HTTP_GET, handleSettingsGet);
    registerJsonRoute("/api/settings", HTTP_POST, handleSettingsPost);
    registerJsonRoute("/api/reboot", HTTP_POST, handleReboot);
    registerJsonRoute("/api/factory-reset", HTTP_POST, handleFactoryReset);
#if TM_DEV_SHOW_PASSWORD
    server.on("/api/dev/credentials", HTTP_GET, handleDevCredentials);
#endif
    server.onNotFound([](AsyncWebServerRequest *request) {
        if (request->url().startsWith("/api/")) {
            sendError(request, 404, "http_404");
        } else {
            request->send(404, "text/plain; charset=utf-8", "not found");
        }
    });
}

// Initialize the task watchdog using the installed ESP-IDF API.
static void enableWatchdog() {
#if defined(ESP_IDF_VERSION_MAJOR) && ESP_IDF_VERSION_MAJOR >= 5
    esp_task_wdt_config_t configuration = {};
    configuration.timeout_ms = settings.wdtSec * 1000UL;
    configuration.idle_core_mask = 0;
    configuration.trigger_panic = true;
    // Arduino-ESP32 3.x already initialises the TWDT: reconfigure it.
    if (esp_task_wdt_init(&configuration) == ESP_ERR_INVALID_STATE) {
        esp_task_wdt_reconfigure(&configuration);
    }
#else
    esp_task_wdt_init(settings.wdtSec, true);
#endif
    esp_task_wdt_add(nullptr);
}

// Apply a new LED GPIO without a reboot.
static void applyLedPin() {
    uint8_t pin;
    {
        StateLock lock;
        pin = settings.ledGpio;
    }
    if (pin != activeLedGpio) {
        digitalWrite(activeLedGpio, LOW);
        pinMode(activeLedGpio, INPUT);
    }
    activeLedGpio = pin;
    pinMode(activeLedGpio, OUTPUT);
    digitalWrite(activeLedGpio, LOW);
}

// Initialize serial output, NVS, AP, SPIFFS, HTTP, WebSockets, LED, and WDT.
void setup() {
    Serial.begin(115200);
    delay(200);
    stateMutex = xSemaphoreCreateRecursiveMutex();
    logInfo("boot", String("TOUGHENING MACHINE firmware ") + FIRMWARE_VERSION
                    + " (" + BUILD_DATE + ")");
#if TM_DEV_SHOW_PASSWORD
    logInfo("boot", "*** DEVELOPMENT BUILD: TM_DEV_SHOW_PASSWORD=1, do not deploy ***");
#endif
    // Start the radio first: esp_random() is only a true RNG while RF is on,
    // and the first-boot password / salts / session secret are drawn below.
    WiFi.persistent(false);
    WiFi.mode(WIFI_AP);
    if (settingsLoad()) {
        logInfo("nvs", "loaded");
    }
    bootId = randomHex(8);
    randomSeed(esp_random());
    activeLedGpio = settings.ledGpio;
    applyLedPin();
    WiFi.softAPConfig(IPAddress(192, 168, 4, 1),
                      IPAddress(192, 168, 4, 1),
                      IPAddress(255, 255, 255, 0));
    bool apStarted = WiFi.softAP(settings.wifiSsid.c_str(),
                                 settings.wifiPassword.c_str());
    logInfo("wifi", String(apStarted ? "AP started SSID=" : "AP FAILED SSID=")
                    + settings.wifiSsid + " IP=" + WiFi.softAPIP().toString());
    if (!SPIFFS.begin(true)) {
        logInfo("fs", "SPIFFS mount failed; static files return 404");
    } else if (!SPIFFS.exists("/index.html")) {
        logInfo("fs", "index.html missing: run 'pio run -t uploadfs'");
    }
    registerStaticRoutes();
    registerApiRoutes();
    browserWs.onEvent(browserWebSocketEvent);
    server.addHandler(&browserWs);
    server.begin();
    logInfo("http", "server started on port 80");
    if (TM_ENABLE_PC_WEBSOCKET_CLIENT) {
        xTaskCreatePinnedToCore(pcClientTask, "pc_ws", 8192, nullptr, 1,
                                nullptr, 1);
    } else {
        logInfo("ws", "PC WebSocket client DISABLED (TM_ENABLE_PC_WEBSOCKET_CLIENT=0)");
    }
    enableWatchdog();
    logInfo("wdt", String("enabled, ") + settings.wdtSec + "s");
    logInfo("led", String("GPIO") + settings.ledGpio + ", " + settings.ledMs
                    + "ms period");
}

// Feed the watchdog, blink the LED, push state, and restart safely.
void loop() {
    uint32_t now = millis();
    esp_task_wdt_reset();
    if (ledReconfigPending) {
        ledReconfigPending = false;
        applyLedPin();
    }
    uint16_t ledPeriod = settings.ledMs;
    if (static_cast<uint32_t>(now - lastLedMs) >= ledPeriod) {
        lastLedMs = now;
        ledState = !ledState;
        digitalWrite(activeLedGpio, ledState ? HIGH : LOW);
    }
    ensureAccessPoint(now);
    if (static_cast<uint32_t>(now - lastBrowserPushMs) >= BROWSER_PUSH_MS) {
        lastBrowserPushMs = now;
        browserWs.cleanupClients(MAX_BROWSER_CLIENTS);
        enforceBrowserSessions();
        if (browserWs.count() > 0) {
            // textAll() takes the library lock; iterating getClients() from
            // loop() raced with the async_tcp task.
            browserWs.textAll(stateJson(true));
        }
    }
#if TM_DEV_SHOW_PASSWORD
    if (static_cast<uint32_t>(now - lastDevPrintMs) >= DEV_PASSWORD_PRINT_MS) {
        lastDevPrintMs = now;
        String password;
        {
            StateLock lock;
            password = devPassword;
        }
        printPasswordBanner(password, "DEV: periodic reminder");
    }
#endif
    if (restartPending
        && static_cast<int32_t>(now - restartAtMs) >= 0) {
        if (factoryResetPending) {
            preferences.clear();
        }
        preferences.end();
        esp_restart();
    }
    delay(2);
}
