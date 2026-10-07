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
  }

  init();
})();
