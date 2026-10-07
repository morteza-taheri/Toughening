(function () {
  const LANG_KEY = "toughening.lang";
  const CALENDAR_KEY = "toughening.calendar";
  const LANG_EN = "en";
  const LANG_FA = "fa";
  const CAL_GREGORIAN = "gregorian";
  const CAL_JALALI = "jalali";

  let i18n = {};
  let currentLang = LANG_EN;
  let currentCalendar = CAL_GREGORIAN;

  async function loadI18n() {
    const [en, fa] = await Promise.all([
      fetch("/static/i18n/en.json").then(r => r.json()),
      fetch("/static/i18n/fa.json").then(r => r.json()),
    ]);
    i18n = { en, fa };
  }

  function detectLang() {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === LANG_FA || stored === LANG_EN) {
      return stored;
    }
    const browser = navigator.language || navigator.userLanguage || "";
    if (browser.toLowerCase().startsWith("fa")) {
      return LANG_FA;
    }
    return LANG_EN;
  }

  function detectCalendar() {
    const stored = localStorage.getItem(CALENDAR_KEY);
    if (stored === CAL_GREGORIAN || stored === CAL_JALALI) {
      return stored;
    }
    return CAL_GREGORIAN;
  }

  function applyLang() {
    const root = document.documentElement;
    root.lang = currentLang;
    root.dir = currentLang === LANG_FA ? "rtl" : "ltr";

    const labels = i18n[currentLang];
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (labels[key] !== undefined) {
        el.textContent = labels[key];
      }
    });

    const langBtn = document.getElementById("lang-toggle");
    if (langBtn) {
      const toggleKey = currentLang === LANG_FA
        ? "header.languageToggle.whenFa"
        : "header.languageToggle.whenEn";
      langBtn.textContent = labels[toggleKey] || "";
    }

    const calBtn = document.getElementById("calendar-toggle");
    if (calBtn) {
      const calKey = currentCalendar === CAL_JALALI
        ? "header.calendarToggle.whenJalali"
        : "header.calendarToggle.whenGregorian";
      calBtn.textContent = labels[calKey] || "";
    }
  }

  function applyCalendar() {
    const labels = i18n[currentLang];
    const calBtn = document.getElementById("calendar-toggle");
    if (calBtn) {
      const calKey = currentCalendar === CAL_JALALI
        ? "header.calendarToggle.whenJalali"
        : "header.calendarToggle.whenGregorian";
      calBtn.textContent = labels[calKey] || "";
    }
  }

  function toggleLang() {
    currentLang = currentLang === LANG_EN ? LANG_FA : LANG_EN;
    localStorage.setItem(LANG_KEY, currentLang);
    applyLang();
  }

  function toggleCalendar() {
    currentCalendar = currentCalendar === CAL_GREGORIAN ? CAL_JALALI : CAL_GREGORIAN;
    localStorage.setItem(CALENDAR_KEY, currentCalendar);
    applyCalendar();
  }

  function setStatus(key) {
    const el = document.getElementById("live-status");
    if (el && i18n[currentLang]) {
      el.textContent = i18n[currentLang][key] || key;
    }
  }

  function formatEventTime(ms) {
    if (ms === null || ms === undefined) {
      return "";
    }
    const d = new Date(Number(ms));
    if (currentCalendar === CAL_JALALI) {
      try {
        return new Intl.DateTimeFormat(currentLang, {
          calendar: "persian",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(d);
      } catch {
        // fallback to Gregorian if Intl Persian calendar unavailable
      }
    }
    return new Intl.DateTimeFormat(currentLang, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  }

  function renderStations(stations) {
    const grid = document.getElementById("live-stations");
    if (!grid) {
      return;
    }
    grid.innerHTML = "";
    if (!Array.isArray(stations)) {
      return;
    }
    stations.forEach(station => {
      const tile = document.createElement("div");
      tile.className = "station-tile";
      const stationId = document.createElement("div");
      stationId.textContent = `#${station.station_id}`;
      tile.appendChild(stationId);
      const nozzles = Array.isArray(station.nozzles) ? station.nozzles : [];
      nozzles.forEach(nozzle => {
        const row = document.createElement("div");
        row.textContent = `N${nozzle.nozzle_id}`;
        const state = nozzle.channel_state || "unconfigured";
        if (state === "valid") {
          tile.classList.add("valid");
        } else if (state === "out_of_range") {
          tile.classList.add("out_of_range");
        } else {
          tile.classList.add("unconfigured");
        }
        const value = document.createElement("div");
        value.textContent = state;
        row.appendChild(value);
        tile.appendChild(row);
      });
      grid.appendChild(tile);
    });
  }

  function applyLiveState(message) {
    const payload = message.payload || message;
    const labels = i18n[currentLang];
    const setText = (id, key, fallback) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = labels[key] || fallback || "";
      }
    };
    setText("live-event-time", "live.value.none", formatEventTime(payload.event_time));
    setText("live-station-count", "live.value.none", String(payload.stations ? payload.stations.length : 0));
    setText("live-invalid-channel-count", "live.value.none", String(payload.invalid_channel_count_now ?? 0));
    setText("live-alarm-state", "live.value.none", payload.alarm_state || "");
    setText("live-warning-state", "live.value.none", payload.warning_state || "");
    const pending = payload.data_loss_pending;
    const pendingKey = pending ? "live.value.yes" : "live.value.no";
    setText("live-data-loss-pending", "live.value.none", labels[pendingKey] || String(pending));
    renderStations(payload.stations);
  }

  let ws = null;
  let reconnectDelayMs = 1000;

  function connectWebSocket() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws/gui`;
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      reconnectDelayMs = 1000;
      setStatus("live.status.connected");
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "live_state") {
          applyLiveState(message);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      setStatus("live.status.disconnected");
      setTimeout(connectWebSocket, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000);
    });

    ws.addEventListener("error", () => {
      setStatus("live.status.disconnected");
    });
  }

  async function init() {
    await loadI18n();
    currentLang = detectLang();
    currentCalendar = detectCalendar();
    applyLang();
    applyCalendar();

    const langBtn = document.getElementById("lang-toggle");
    const calBtn = document.getElementById("calendar-toggle");
    if (langBtn) langBtn.addEventListener("click", toggleLang);
    if (calBtn) calBtn.addEventListener("click", toggleCalendar);

    connectWebSocket();
  }

  init();
})();
