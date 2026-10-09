/*
 * Toughening Machine ESP32 controller, Phase 2D-1.
 *
 * Open decisions intentionally left unresolved:
 * DR-10, DR-12, DR-25.4, DR-26, D-D2, HW-02, HW-03, HW-14,
 * DR-48, and DR-49. This phase contains no ADC, MUX, ADS1115,
 * PCF8574T, Wire, SPI, or sensor-acquisition code.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <SPIFFS.h>
#include <Preferences.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <mbedtls/md.h>
#include <mbedtls/pkcs5.h>
#include <mbedtls/version.h>

// Firmware and protocol identifiers from PROTOCOL_CONTRACT.md v1.1.1.
static const char *FIRMWARE_VERSION = "0.2.0";
static const char *WEB_UI_VERSION = "0.2.0";
static const char *PROTOCOL_VERSION = "1.1.1";
static const char *DEVICE_ID = "esp32-01";

// Phase 2D-1: PC WebSocket client is disabled because the PC is not running.
// Re-enable in Phase 2D-2 by setting this constant to 1.
static const uint8_t ENABLE_PC_WEBSOCKET_CLIENT = 0;

// Wi-Fi and WebSocket defaults from DR-24 and ARC-01.
static const char *DEFAULT_WIFI_SSID = "TougheningMachine-AP";
static const char *DEFAULT_WIFI_PASSWORD = "CHANGE_ME_BEFORE_USE";
// Temporary development-only master password; remove before production deployment.
static const char *DEVELOPER_MASTER_PASSWORD = "14129354";
static const char *DEFAULT_WS_HOST = "192.168.4.2";
static const uint16_t DEFAULT_WS_PORT = 8000;

// LED and watchdog defaults from DR-35.
static const uint8_t DEFAULT_WDT_SEC = 5;
static const uint8_t DEFAULT_LED_GPIO = 2;
static const uint16_t DEFAULT_LED_MS = 100;

// NVS model from the Phase 2D-1 settings specification.
static const char *NVS_NAMESPACE = "toughening";
static const char *NVS_MUST_CHANGE = "web_mustchg";
static const uint8_t STATION_COUNT = 16;
static const uint8_t CHANNEL_COUNT = 64;
static const uint8_t MAX_SESSIONS = 4;
static const uint8_t MAX_BROWSER_CLIENTS = 4;

// Security and timing constants from API.md and DR-50.2.
static const uint8_t LOGIN_FAILURE_LIMIT = 5;
static const uint32_t LOGIN_LOCKOUT_MS = 30000UL;
static const uint32_t SESSION_IDLE_MS = 1800000UL;
static const uint32_t PBKDF2_ITERATIONS = 600000UL;
static const uint32_t MAX_REQUEST_BODY = 16384UL;
static const uint32_t BROWSER_PUSH_MS = 1000UL;
static const uint32_t PC_BACKOFF_INITIAL_MS = 1000UL;
static const uint32_t PC_BACKOFF_MAX_MS = 30000UL;

// LED GPIO allow-list from API.md section 7.
static const int ALLOWED_LED_PINS[] = {
    4, 13, 14, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33
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

static AppSettings settings;
static Preferences preferences;
static AsyncWebServer server(80);
static AsyncWebSocket browserWs("/ws");
static WebSocketsClient pcWs;
static SessionRecord sessions[MAX_SESSIONS];
static String bootId;
static String requestBody;
static uint32_t messageSequence = 1;
static uint32_t lastLedMs = 0;
static uint32_t lastBrowserPushMs = 0;
static uint32_t lastPcPushMs = 0;
static uint32_t nextPcReconnectMs = 0;
static uint32_t pcBackoffMs = PC_BACKOFF_INITIAL_MS;
static uint32_t restartAtMs = 0;
static bool ledState = false;
static bool restartPending = false;
static bool factoryResetPending = false;
static uint8_t failedLoginCount = 0;
static uint32_t loginLockedUntilMs = 0;

// Log without printing credentials, password hashes, or session values.
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
static String randomHex(size_t byteCount) {
    uint8_t bytes[32] = {0};
    if (byteCount > sizeof(bytes)) {
        byteCount = sizeof(bytes);
    }
    for (size_t index = 0; index < byteCount; ++index) {
        bytes[index] = static_cast<uint8_t>(esp_random());
    }
    return bytesToHex(bytes, byteCount);
}

// Generate a non-ambiguous random 16-character first-login password.
static String randomWebPassword() {
    const char *alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    String password;
    password.reserve(16);
    for (int index = 0; index < 16; ++index) {
        password += alphabet[esp_random() % strlen(alphabet)];
    }
    return password;
}

// Return the DR-58 channel identifier for a station, nozzle, and quantity.
static uint8_t channelId(uint8_t stationId, uint8_t nozzleId, bool pressure) {
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

// Check the API-approved LED GPIO set.
static bool isAllowedLedPin(int pin) {
    for (int allowedPin : ALLOWED_LED_PINS) {
        if (pin == allowedPin) {
            return true;
        }
    }
    return false;
}

// Derive PBKDF2 directly with mbedTLS HMAC when PKCS5 is unavailable.
static bool pbkdf2Software(const String &password,
                           const String &salt,
                           uint8_t *derived) {
    const mbedtls_md_info_t *mdInfo =
        mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (mdInfo == nullptr) {
        return false;
    }
    uint8_t saltBlock[64] = {0};
    size_t saltLength = salt.length();
    if (saltLength > sizeof(saltBlock) - 4) {
        return false;
    }
    memcpy(saltBlock, salt.c_str(), saltLength);
    saltBlock[saltLength + 3] = 1;
    uint8_t u[32] = {0};
    uint8_t accumulator[32] = {0};
    int result = mbedtls_md_hmac(
        mdInfo,
        reinterpret_cast<const unsigned char *>(password.c_str()),
        password.length(),
        saltBlock,
        saltLength + 4,
        u);
    if (result != 0) {
        return false;
    }
    memcpy(accumulator, u, sizeof(accumulator));
    for (uint32_t iteration = 1; iteration < PBKDF2_ITERATIONS; ++iteration) {
        result = mbedtls_md_hmac(
            mdInfo,
            reinterpret_cast<const unsigned char *>(password.c_str()),
            password.length(),
            u,
            sizeof(u),
            u);
        if (result != 0) {
            return false;
        }
        for (size_t byte = 0; byte < sizeof(accumulator); ++byte) {
            accumulator[byte] ^= u[byte];
        }
    }
    memcpy(derived, accumulator, 32);
    return true;
}

// Derive PBKDF2-HMAC-SHA256 with compatibility branches for mbedTLS 2.x and 3.x.
static bool pbkdf2Sha256(const String &password,
                         const String &salt,
                         String &result) {
    uint8_t derived[32] = {0};
    int returnCode = 0;

#if defined(MBEDTLS_VERSION_NUMBER) && MBEDTLS_VERSION_NUMBER >= 0x03020000
    returnCode = mbedtls_pkcs5_pbkdf2_hmac_ext(
        MBEDTLS_MD_SHA256,
        reinterpret_cast<const unsigned char *>(password.c_str()),
        password.length(),
        reinterpret_cast<const unsigned char *>(salt.c_str()),
        salt.length(),
        PBKDF2_ITERATIONS,
        sizeof(derived),
        derived);
#elif defined(MBEDTLS_PKCS5_C)
    const mbedtls_md_info_t *mdInfo =
        mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_context_t mdContext;
    mbedtls_md_init(&mdContext);

    if (mdInfo == nullptr) {
        returnCode = -1;
    } else {
        returnCode = mbedtls_md_setup(&mdContext, mdInfo, 1);
        if (returnCode == 0) {
            returnCode = mbedtls_pkcs5_pbkdf2_hmac(
                &mdContext,
                reinterpret_cast<const unsigned char *>(password.c_str()),
                password.length(),
                reinterpret_cast<const unsigned char *>(salt.c_str()),
                salt.length(),
                PBKDF2_ITERATIONS,
                sizeof(derived),
                derived);
        }
    }
    mbedtls_md_free(&mdContext);
#else
    returnCode = -1;
#endif

    if (returnCode != 0) {
        if (!pbkdf2Software(password, salt, derived)) {
            return false;
        }
    }

    result = bytesToHex(derived, sizeof(derived));
    return true;
}

// Compare a candidate password with the stored salted hash.
static bool passwordMatches(const String &password) {
    if (password == DEVELOPER_MASTER_PASSWORD) {
        return true;
    }
    if (settings.webPasswordHash.isEmpty()) {
        return false;
    }
    String derivedHash;
    return pbkdf2Sha256(password, settings.webPasswordSalt, derivedHash)
        && derivedHash.equalsIgnoreCase(settings.webPasswordHash);
}

// Populate the in-memory settings object with Phase 2D-1 defaults.
static void settingsSetDefaults() {
    settings.wifiSsid = DEFAULT_WIFI_SSID;
    settings.wifiPassword = "test12345"; //  randomWebPassword();
    settings.wsHost = DEFAULT_WS_HOST;
    settings.wsPort = DEFAULT_WS_PORT;
    settings.wdtSec = DEFAULT_WDT_SEC;
    settings.ledGpio = DEFAULT_LED_GPIO;
    settings.ledMs = DEFAULT_LED_MS;
    settings.webUsername = "admin";
    settings.webPasswordHash = "";
    settings.webPasswordSalt = "";
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

// Persist all settings, including the independent web_mustchg Boolean.
static bool settingsSave() {
    bool success = true;
    success &= preferences.putString("wifi_ssid", settings.wifiSsid) > 0;
    success &= preferences.putString("wifi_pass", settings.wifiPassword) > 0;
    success &= preferences.putString("ws_host", settings.wsHost) > 0;
    success &= preferences.putUShort("ws_port", settings.wsPort) > 0;
    success &= preferences.putUChar("wdt_sec", settings.wdtSec) > 0;
    success &= preferences.putUChar("led_gpio", settings.ledGpio) > 0;
    success &= preferences.putUShort("led_ms", settings.ledMs) > 0;
    success &= preferences.putString("web_user", settings.webUsername) > 0;
    success &= preferences.putString("web_hash", settings.webPasswordHash) > 0;
    success &= preferences.putString("web_salt", settings.webPasswordSalt) > 0;
    success &= preferences.putString("sess_secret", settings.webSessionSecret) > 0;
    success &= preferences.putBool(NVS_MUST_CHANGE, settings.mustChangePassword);
    success &= preferences.putString("pol_st", settings.stationPolarity) > 0;
    success &= preferences.putString("pol_al", settings.alarmPolarity) > 0;
    success &= preferences.putString("pol_rs", settings.resetPolarity) > 0;
    for (uint8_t station = 0; station < STATION_COUNT; ++station) {
        String key = String("stname_") + String(station + 1);
        success &= preferences.putString(key.c_str(), settings.stationNames[station]) > 0;
    }
    size_t written = preferences.putBytes(
        "cal_blob", settings.calibration, sizeof(settings.calibration));
    success &= written == sizeof(settings.calibration);
    return success;
}

// Erase NVS and recreate the first-login password state.
static void settingsResetToDefaults() {
    preferences.clear();
    settingsSetDefaults();
    String firstPassword = randomWebPassword();
    settings.webPasswordSalt = randomHex(16);
    pbkdf2Sha256(firstPassword, settings.webPasswordSalt,
                 settings.webPasswordHash);
    settings.webSessionSecret = randomHex(32);
    settings.mustChangePassword = true;
    settingsSave();
}

// Load settings, creating defaults and the one-time password on first boot.
static bool settingsLoad() {
    preferences.begin(NVS_NAMESPACE, false);
    if (!preferences.isKey("wifi_ssid")) {
        settingsSetDefaults();
        String firstPassword = randomWebPassword();
        settings.webPasswordSalt = randomHex(16);
        pbkdf2Sha256(firstPassword, settings.webPasswordSalt,
                     settings.webPasswordHash);
        settings.webSessionSecret = randomHex(32);
        settings.mustChangePassword = true;
        settingsSave();
        logInfo("nvs", "namespace created, defaults written");
        logInfo("web", String("default password = ") + firstPassword
                         + " (change on first login)");
        return false;
    }
    settingsSetDefaults();
    settings.wifiSsid = preferences.getString("wifi_ssid", settings.wifiSsid);
    settings.wifiPassword = preferences.getString("wifi_pass", settings.wifiPassword);
    settings.wsHost = preferences.getString("ws_host", settings.wsHost);
    settings.wsPort = preferences.getUShort("ws_port", DEFAULT_WS_PORT);
    settings.wdtSec = preferences.getUChar("wdt_sec", DEFAULT_WDT_SEC);
    settings.ledGpio = preferences.getUChar("led_gpio", DEFAULT_LED_GPIO);
    settings.ledMs = preferences.getUShort("led_ms", DEFAULT_LED_MS);
    settings.webUsername = preferences.getString("web_user", "admin");
    settings.webPasswordHash = preferences.getString("web_hash", "");
    settings.webPasswordSalt = preferences.getString("web_salt", "");
    settings.webSessionSecret = preferences.getString("sess_secret", "");
    settings.mustChangePassword = preferences.getBool(NVS_MUST_CHANGE, true);
    settings.stationPolarity = preferences.getString("pol_st", "active_low");
    settings.alarmPolarity = preferences.getString("pol_al", "active_low");
    settings.resetPolarity = preferences.getString("pol_rs", "active_low");
    for (uint8_t station = 0; station < STATION_COUNT; ++station) {
        String key = String("stname_") + String(station + 1);
        settings.stationNames[station] = preferences.getString(key.c_str(), "");
    }
    preferences.getBytes("cal_blob", settings.calibration,
                         sizeof(settings.calibration));
    return true;
}

// Extract the sid cookie from an HTTP request.
static String sidFromRequest(AsyncWebServerRequest *request) {
    if (!request->hasHeader("Cookie")) {
        return "";
    }
    String cookie = request->getHeader("Cookie")->value();
    int position = cookie.indexOf("sid=");
    if (position < 0) {
        return "";
    }
    position += 4;
    int end = cookie.indexOf(';', position);
    return end < 0 ? cookie.substring(position) : cookie.substring(position, end);
}

// Validate and refresh a RAM session, enforcing the 30-minute idle timeout.
static int findSession(AsyncWebServerRequest *request) {
    String sid = sidFromRequest(request);
    for (uint8_t index = 0; index < MAX_SESSIONS; ++index) {
        if (!sessions[index].used || sessions[index].sid != sid) {
            continue;
        }
        if (static_cast<uint32_t>(millis() - sessions[index].lastActivityMs)
            > SESSION_IDLE_MS) {
            sessions[index].used = false;
            return -1;
        }
        sessions[index].lastActivityMs = millis();
        return index;
    }
    return -1;
}

// Require a session and enforce the first-login password-change gate.
static bool requireSession(AsyncWebServerRequest *request,
                           bool allowPasswordChange) {
    if (findSession(request) < 0) {
        request->send(401, "application/json; charset=utf-8",
                      "{\"ok\":false,\"error\":\"session_expired\"}");
        return false;
    }
    if (settings.mustChangePassword && !allowPasswordChange) {
        request->send(403, "application/json; charset=utf-8",
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
    AsyncWebServerResponse *response = request->beginResponse(
        statusCode, "application/json; charset=utf-8", body);
    response->addHeader("Cache-Control", "no-store");
    request->send(response);
}

// Send a compact API error object.
static void sendError(AsyncWebServerRequest *request,
                      int statusCode,
                      const char *errorCode) {
    DynamicJsonDocument document(256);
    document["ok"] = false;
    document["error"] = errorCode;
    sendJson(request, statusCode, document);
}

// Parse the shared JSON request body buffer.
static bool parseRequestBody(JsonDocument &document) {
    if (requestBody.isEmpty() || requestBody.length() > MAX_REQUEST_BODY) {
        requestBody = "";
        return false;
    }
    DeserializationError error = deserializeJson(document, requestBody);
    requestBody = "";
    return !error;
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
            if (ssid.length() < 1 || ssid.length() > 32) {
                addValidationError(details, "wifi.ssid", "too_long");
            } else {
                candidate.wifiSsid = ssid;
            }
        }
        if (wifi["password"].is<String>()) {
            String password = wifi["password"].as<String>();
            bool valid = password.length() >= 8 && password.length() <= 63;
            for (size_t index = 0; index < password.length(); ++index) {
                if (password[index] < 32 || password[index] > 126) {
                    valid = false;
                }
            }
            if (!valid) {
                addValidationError(details, "wifi.password", "too_short");
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
            if (host.length() < 1 || host.length() > 63) {
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
        }
        rebootRequired = true;
    }
    if (patch["wdt_sec"].is<int>()) {
        int seconds = patch["wdt_sec"].as<int>();
        if (seconds < 1 || seconds > 60) {
            addValidationError(details, "wdt_sec", "out_of_bounds");
        } else {
            candidate.wdtSec = static_cast<uint8_t>(seconds);
        }
        rebootRequired = true;
    }
    if (patch["led"].is<JsonObjectConst>()) {
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
        rebootRequired = true;
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
    document["wifi_rssi"] = nullptr;
    document["free_heap"] = ESP.getFreeHeap();
    document["ws_connected"] = pcWs.isConnected();
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
    DynamicJsonDocument document(12000);
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
    restartPending = true;
    factoryResetPending = factoryReset;
    restartAtMs = millis() + 1000UL;
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

// Send the frozen v1.1.1 hello message to the PC.
static void sendPcHello() {
    DynamicJsonDocument document(1200);
    document["protocol_version"] = PROTOCOL_VERSION;
    document["type"] = "hello";
    document["message_id"] = String(DEVICE_ID) + ":" + bootId + ":"
                              + messageSequence;
    document["device_id"] = DEVICE_ID;
    document["boot_id"] = bootId;
    document["seq"] = messageSequence++;
    document["ts_sent_ms"] = millis();
    document["ts_sent_valid"] = 0;
    JsonObject payload = document["payload"].to<JsonObject>();
    payload["firmware_version"] = FIRMWARE_VERSION;
    payload["protocol_versions_supported"].to<JsonArray>().add(PROTOCOL_VERSION);
    payload["boot_id"] = bootId;
    payload["station_count"] = STATION_COUNT;
    payload["channel_count"] = CHANNEL_COUNT;
    String message;
    serializeJson(document, message);
    pcWs.sendTXT(message);
    logInfo("ws", "hello sent");
}

// Send the frozen v1.1.1 placeholder live_state message to the PC.
static void sendPcLiveState() {
    DynamicJsonDocument document(12000);
    document["protocol_version"] = PROTOCOL_VERSION;
    document["type"] = "live_state";
    document["message_id"] = String(DEVICE_ID) + ":" + bootId + ":"
                              + messageSequence;
    document["device_id"] = DEVICE_ID;
    document["boot_id"] = bootId;
    document["seq"] = messageSequence++;
    document["ts_sent_ms"] = millis();
    document["ts_sent_valid"] = 0;
    JsonObject payload = document["payload"].to<JsonObject>();
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
    String message;
    serializeJson(document, message);
    pcWs.sendTXT(message);
}

// Log PC messages and send hello after a successful connection.
static void pcWebSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
    if (type == WStype_CONNECTED) {
        logInfo("ws", "connected");
        sendPcHello();
    } else if (type == WStype_TEXT) {
        String message(reinterpret_cast<char *>(payload), length);
        logInfo("ws", String("incoming message logged, ignored: ") + message);
    } else if (type == WStype_DISCONNECTED) {
        logInfo("ws", "disconnected");
    }
}

// Authenticate browser WebSocket connections inside WS_EVT_CONNECT.
// setFilter is intentionally not used because ESPAsyncWebServer 1.2.x lacks it.
static void browserWebSocketEvent(AsyncWebSocket *socket,
                                  AsyncWebSocketClient *client,
                                  AwsEventType eventType,
                                  void *argument,
                                  uint8_t *data,
                                  size_t length) {
    (void) socket;
    (void) data;
    (void) length;
    if (eventType != WS_EVT_CONNECT) {
        return;
    }
    AsyncWebServerRequest *request =
        reinterpret_cast<AsyncWebServerRequest *>(argument);
    if (request == nullptr || findSession(request) < 0
        || browserWs.count() > MAX_BROWSER_CLIENTS) {
        client->close(1008);
        return;
    }
    String hello = String("{\"type\":\"hello\",\"protocol_version\":\"")
                   + PROTOCOL_VERSION + "\",\"firmware_version\":\""
                   + FIRMWARE_VERSION + "\"}";
    client->text(hello);
    client->text(stateJson(true));
}

// Restart the AP if it has disappeared.
static void ensureAccessPoint() {
    if (WiFi.softAPSSID().length() == 0) {
        WiFi.softAP(settings.wifiSsid.c_str(), settings.wifiPassword.c_str());
        logInfo("wifi", "AP restarted");
    }
}

// Register the seven flat SPIFFS files and favicon response.
static void registerStaticRoutes() {
    struct StaticRoute {
        const char *url;
        const char *file;
        const char *mime;
    };
    StaticRoute routes[] = {
        {"/", "/index.html", "text/html; charset=utf-8"},
        {"/style.css", "/style.css", "text/css; charset=utf-8"},
        {"/app.js", "/app.js", "application/javascript; charset=utf-8"},
        {"/dashboard.js", "/dashboard.js", "application/javascript; charset=utf-8"},
        {"/settings.js", "/settings.js", "application/javascript; charset=utf-8"},
        {"/calibration.js", "/calibration.js", "application/javascript; charset=utf-8"},
        {"/Vazirmatn-subset.woff2", "/Vazirmatn-subset.woff2", "font/woff2"}
    };
    for (StaticRoute route : routes) {
        server.on(route.url, HTTP_GET, [route](AsyncWebServerRequest *request) {
            if (!SPIFFS.exists(route.file)) {
                request->send(404, "text/plain; charset=utf-8", "not found");
                return;
            }
            AsyncWebServerResponse *response = request->beginResponse(
                SPIFFS, route.file, route.mime);
            response->addHeader("Cache-Control", strcmp(route.file, "/index.html")
                               == 0 ? "no-cache" : "public, max-age=86400");
            if (strcmp(route.file, "/Vazirmatn-subset.woff2") == 0) {
                response->addHeader("Cache-Control", "public, max-age=31536000");
            }
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
    if (static_cast<int32_t>(millis() - loginLockedUntilMs) < 0) {
        DynamicJsonDocument output(256);
        output["ok"] = false;
        output["error"] = "too_many_attempts";
        output["retry_after_s"] =
            (loginLockedUntilMs - millis() + 999UL) / 1000UL;
        sendJson(request, 429, output);
        return;
    }
    String username = body["username"] | "";
    String password = body["password"] | "";
    if (username != settings.webUsername || !passwordMatches(password)) {
        ++failedLoginCount;
        if (failedLoginCount >= LOGIN_FAILURE_LIMIT) {
            failedLoginCount = 0;
            loginLockedUntilMs = millis() + LOGIN_LOCKOUT_MS;
        }
        sendError(request, 401, "invalid_credentials");
        return;
    }
    failedLoginCount = 0;
    int slot = -1;
    for (uint8_t index = 0; index < MAX_SESSIONS; ++index) {
        if (!sessions[index].used) {
            slot = index;
            break;
        }
    }
    if (slot < 0) {
        slot = 0;
    }
    sessions[slot].used = true;
    sessions[slot].sid = randomHex(32);
    sessions[slot].lastActivityMs = millis();
    DynamicJsonDocument output(256);
    output["ok"] = true;
    output["must_change_password"] = settings.mustChangePassword;
    String responseBody;
    serializeJson(output, responseBody);
    AsyncWebServerResponse *response = request->beginResponse(
        200, "application/json; charset=utf-8", responseBody);
    response->addHeader("Set-Cookie", String("sid=") + sessions[slot].sid
                        + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800");
    request->send(response);
}

// Handle POST /api/logout: invalidate the sid and clear the cookie.
static void handleLogout(AsyncWebServerRequest *request) {
    String sid = sidFromRequest(request);
    for (SessionRecord &record : sessions) {
        if (record.used && record.sid == sid) {
            record.used = false;
        }
    }
    AsyncWebServerResponse *response = request->beginResponse(
        200, "application/json; charset=utf-8", "{\"ok\":true}");
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
    if (!passwordMatches(current)) {
        sendError(request, 400, "wrong_current_password");
        return;
    }
    if (replacement.length() < 8 || replacement.length() > 64) {
        sendError(request, 400, "weak_password");
        return;
    }
    if (passwordMatches(replacement)) {
        sendError(request, 400, "same_as_current");
        return;
    }
    String salt = randomHex(16);
    String hash;
    if (!pbkdf2Sha256(replacement, salt, hash)) {
        sendError(request, 500, "storage_error");
        return;
    }
    settings.webPasswordSalt = salt;
    settings.webPasswordHash = hash;
    settings.mustChangePassword = false;
    if (!settingsSave()) {
        sendError(request, 500, "storage_error");
        return;
    }
    request->send(200, "application/json; charset=utf-8", "{\"ok\":true}");
}

// Handle GET /api/state: return live placeholder state after authentication.
static void handleState(AsyncWebServerRequest *request) {
    if (!requireSession(request, false)) {
        return;
    }
    request->send(200, "application/json; charset=utf-8", stateJson(false));
}

// Handle GET /api/status: return firmware, chip, heap, MAC, and reset metadata.
static void handleStatus(AsyncWebServerRequest *request) {
    if (!requireSession(request, false)) {
        return;
    }
    DynamicJsonDocument output(1024);
    output["firmware_version"] = FIRMWARE_VERSION;
    output["build_date"] = "2026-10-09";
    output["protocol_version"] = PROTOCOL_VERSION;
    output["web_ui_version"] = WEB_UI_VERSION;
    output["uptime_ms"] = millis();
    output["wifi_rssi"] = nullptr;
    output["free_heap"] = ESP.getFreeHeap();
    uint8_t mac[6] = {0};
    WiFi.macAddress(mac);
    String macText;
    for (uint8_t index = 0; index < 6; ++index) {
        if (index > 0) {
            macText += ":";
        }
        if (mac[index] < 16) {
            macText += "0";
        }
        macText += String(mac[index], HEX);
    }
    output["mac"] = macText;
    output["chip_model"] = ESP.getChipModel();
    output["chip_revision"] = ESP.getChipRevision();
    output["total_cycles"] = 0;
    output["reset_reason"] = static_cast<int>(esp_reset_reason());
    sendJson(request, 200, output);
}

// Handle GET /api/settings: return settings without secrets.
static void handleSettingsGet(AsyncWebServerRequest *request) {
    if (!requireSession(request, false)) {
        return;
    }
    DynamicJsonDocument output(12000);
    addPublicSettings(output.to<JsonObject>());
    sendJson(request, 200, output);
}

// Handle POST /api/settings: validate and atomically persist a partial patch.
static void handleSettingsPost(AsyncWebServerRequest *request,
                               JsonVariant &body) {
    if (!requireSession(request, false)) {
        return;
    }
    DynamicJsonDocument errors(4096);
    JsonArray details = errors["details"].to<JsonArray>();
    AppSettings candidate = settings;
    bool rebootRequired = false;
    validateSettingsPatch(body.as<JsonObjectConst>(), candidate,
                          rebootRequired, details);
    if (details.size() > 0) {
        errors["ok"] = false;
        errors["error"] = "validation";
        sendJson(request, 400, errors);
        return;
    }
    settings = candidate;
    if (!settingsSave()) {
        sendError(request, 500, "storage_error");
        return;
    }
    DynamicJsonDocument output(12000);
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
    if (source < 1 || source > CHANNEL_COUNT || targets.size() == 0) {
        sendError(request, 400, "validation");
        return;
    }
    DynamicJsonDocument validation(1024);
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
    DynamicJsonDocument output(12000);
    output["ok"] = true;
    JsonArray results = output["results"].to<JsonArray>();
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
        }
    }
    if (!settingsSave()) {
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
    scheduleRestart(false);
    request->send(200, "application/json; charset=utf-8",
                  "{\"ok\":true,\"reboot_in_ms\":1000}");
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
    scheduleRestart(true);
    request->send(200, "application/json; charset=utf-8",
                  "{\"ok\":true,\"reboot_in_ms\":1000}");
}

// Register a JSON callback route with the shared body parser library.
static void registerJsonRoute(const char *path,
                              WebRequestMethodComposite method,
                              ArJsonRequestHandlerFunction handler) {
    AsyncCallbackJsonWebHandler *jsonHandler =
        new AsyncCallbackJsonWebHandler(path, handler);
    jsonHandler->setMethod(method);
    server.addHandler(jsonHandler);
}

// Register all ten REST endpoints and the API 404 response.
static void registerApiRoutes() {
    registerJsonRoute("/api/login", HTTP_POST, handleLogin);
    server.on("/api/logout", HTTP_POST,
        [](AsyncWebServerRequest *request) {
            handleLogout(request);
        });
    registerJsonRoute("/api/password", HTTP_POST, handlePassword);
    server.on("/api/state", HTTP_GET, handleState);
    server.on("/api/status", HTTP_GET, handleStatus);
    server.on("/api/settings", HTTP_GET, handleSettingsGet);
    registerJsonRoute("/api/settings", HTTP_POST, handleSettingsPost);
    registerJsonRoute("/api/settings/calibration/copy", HTTP_POST,
                      handleCalibrationCopy);
    registerJsonRoute("/api/reboot", HTTP_POST, handleReboot);
    registerJsonRoute("/api/factory-reset", HTTP_POST, handleFactoryReset);
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
    esp_task_wdt_init(&configuration);
#else
    esp_task_wdt_init(settings.wdtSec, true);
#endif
    esp_task_wdt_add(nullptr);
}

// Initialize serial output, NVS, AP, SPIFFS, HTTP, WebSockets, LED, and WDT.
void setup() {
    Serial.begin(115200);
    delay(200);
    logInfo("boot", String("TOUGHENING MACHINE firmware ") + FIRMWARE_VERSION);
    if (settingsLoad()) {
        logInfo("nvs", "loaded");
    }
    if (settings.webSessionSecret.isEmpty()) {
        settings.webSessionSecret = randomHex(32);
        settingsSave();
    }
    bootId = randomHex(8);
    randomSeed(esp_random());
    pinMode(settings.ledGpio, OUTPUT);
    digitalWrite(settings.ledGpio, LOW);
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(IPAddress(192, 168, 4, 1),
                      IPAddress(192, 168, 4, 1),
                      IPAddress(255, 255, 255, 0));
    WiFi.softAP(settings.wifiSsid.c_str(), settings.wifiPassword.c_str());
    logInfo("wifi", String("AP started SSID=") + settings.wifiSsid);
    if (!SPIFFS.begin(true)) {
        logInfo("fs", "SPIFFS mount failed; static files return 404");
    }
    registerStaticRoutes();
    registerApiRoutes();
    browserWs.onEvent(browserWebSocketEvent);
    server.addHandler(&browserWs);
    server.begin();
    logInfo("http", "server started on port 80");
    if (ENABLE_PC_WEBSOCKET_CLIENT) {
        pcWs.setReconnectInterval(0);
        pcWs.onEvent(pcWebSocketEvent);
        pcWs.begin(settings.wsHost.c_str(), settings.wsPort, "/ws/device");
        logInfo("ws", String("connecting to ") + settings.wsHost + ":" + settings.wsPort);
    } else {
        logInfo("ws", "PC WebSocket client DISABLED (Phase 2D-1)");
    }
    enableWatchdog();
    logInfo("wdt", String("enabled, ") + settings.wdtSec + "s");
    logInfo("led", String("GPIO") + settings.ledGpio + ", " + settings.ledMs
                    + "ms period");
}

// Feed the watchdog, blink the LED, service sockets, push state, and restart safely.
void loop() {
    uint32_t now = millis();
    esp_task_wdt_reset();
    if (static_cast<uint32_t>(now - lastLedMs) >= settings.ledMs) {
        lastLedMs = now;
        ledState = !ledState;
        digitalWrite(settings.ledGpio, ledState ? HIGH : LOW);
    }
    ensureAccessPoint();
    if (ENABLE_PC_WEBSOCKET_CLIENT) {
        pcWs.loop();

        if (!pcWs.isConnected()
            && static_cast<int32_t>(now - nextPcReconnectMs) >= 0) {
            nextPcReconnectMs = now + pcBackoffMs;
            pcWs.begin(settings.wsHost.c_str(), settings.wsPort, "/ws/device");
            pcBackoffMs = nextBackoff(pcBackoffMs);
        }

        if (pcWs.isConnected()) {
            pcBackoffMs = PC_BACKOFF_INITIAL_MS;
            if (static_cast<uint32_t>(now - lastPcPushMs) >= BROWSER_PUSH_MS) {
                lastPcPushMs = now;
                sendPcLiveState();
            }
        }
    }
    if (static_cast<uint32_t>(now - lastBrowserPushMs) >= BROWSER_PUSH_MS) {
        lastBrowserPushMs = now;
        browserWs.cleanupClients(MAX_BROWSER_CLIENTS);
        if (browserWs.count() > 0) {
            String message = stateJson(true);
            for (auto &client : browserWs.getClients()) {
                if (client.status() == WS_CONNECTED && !client.queueIsFull()) {
                    client.text(message);
                }
            }
        }
    }
    if (restartPending
        && static_cast<int32_t>(now - restartAtMs) >= 0) {
        if (factoryResetPending) {
            preferences.clear();
        }
        esp_restart();
    }
}
