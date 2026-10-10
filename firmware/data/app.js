/* تافنینگ — پنل محلی دستگاه · هستهٔ برنامه (app.js)
   Merged core: app.js (DOM helpers, Persian numbers, shell, dialogs, toasts,
   reboot flow) + api.js (REST wrapper, Persian errors) + charts.js
   (calibration math + SVG chart), plus the SPA pieces: hash router, login
   view, lazy view loader and the live-state feed (WebSocket /ws with HTTP
   polling fallback). Vanilla JS, no framework. Dynamic data is only ever
   written with textContent / createElement (never innerHTML).

   Views register themselves as T.views.<name> = { mount(sub, scope),
   sub?(sub), dirty?() } and are loaded on first visit:
     #/dashboard → dashboard.js · #/settings/<tab> → settings.js
     #/calibration[/<channel>] → calibration.js */
'use strict';
(function () {
  const T = (window.T = window.T || {});
  T.views = T.views || {};

  /* ---------- DOM ---------- */
  T.$ = (sel, root) => (root || document).querySelector(sel);
  T.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // h('div', {class:'x', text:'..', onclick: fn, dataset:{a:1}}, child, 'text', [more])
  T.h = function (tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  };
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach((x) => add(el, x)); return; }
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  const NS = 'http://www.w3.org/2000/svg';
  T.svg = function (tag, attrs) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    for (let i = 2; i < arguments.length; i++) if (arguments[i]) el.append(arguments[i]);
    return el;
  };
  T.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- Icons (24×24 stroke paths, static constants) ---------- */
  const IC = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
    curve: 'M3 20h18M3 20V4M6 17c3 0 4-9 7-9s3 5 6 5',
    logout: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01',
    clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2',
    chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
    cycle: 'M20 11a8 8 0 0 0-14.6-4.5M4 4v3h3M4 13a8 8 0 0 0 14.6 4.5M20 20v-3h-3',
    pc: 'M3 4h18v12H3zM8 20h8M12 16v4',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4',
    x: 'M6 6l12 12M18 6L6 18',
    take: 'M12 3v11M7 9l5 5 5-5M5 20h14',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    warn: 'M12 3l10 18H2zM12 10v5M12 18v.01',
    lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
    power: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
    check: 'M5 12l5 5 9-10',
    info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.01',
    net: 'M12 3v6M5 21v-4h14v4M12 9a3 3 0 1 0 0 .01M12 12v5',
  };
  T.icon = (name, cls) => {
    const s = T.svg('svg', { viewBox: '0 0 24 24', class: 'ico' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    s.append(T.svg('path', { d: IC[name] || '' }));
    return s;
  };

  /* ---------- Numbers (Persian digits everywhere in display) ---------- */
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  T.faDigits = (s) => String(s).replace(/[0-9]/g, (d) => FA[d]);
  // fixed decimals, Persian decimal separator "٫", minus kept on the left via LRM
  T.num = function (v, dec) {
    if (v == null || !isFinite(v)) return '—';
    const neg = v < 0;
    let s = Math.abs(v).toFixed(dec == null ? 0 : dec);
    if (+s === 0) return T.faDigits(s).replace('.', '٫');
    s = T.faDigits(s).replace('.', '٫');
    return neg ? '\u200E−' + s : s;
  };
  // trims trailing zeros (for editable values)
  T.numT = function (v, maxDec) {
    if (v == null || !isFinite(v)) return '';
    const s = String(+(+v).toFixed(maxDec == null ? 4 : maxDec));
    return (s[0] === '-' ? '\u200E−' : '') + T.faDigits(s.replace('-', '')).replace('.', '٫');
  };
  // accepts Persian, Arabic-Indic or Latin digits; "٫" "," "." as decimal
  T.parseNum = function (str) {
    if (str == null) return NaN;
    let s = String(str).trim()
      .replace(/[\u200E\u200F\s]/g, '')
      .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776)
      .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632)
      .replace(/[٫,،]/g, '.')
      .replace(/[−–]/g, '-');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  };
  T.parseInt = (str) => { const n = T.parseNum(str); return Number.isInteger(n) ? n : NaN; };
  T.uptime = function (ms) {
    if (ms == null) return '—';
    const t = Math.floor(ms / 1000), d = Math.floor(t / 86400);
    const p = (n) => String(n).padStart(2, '0');
    const hms = T.faDigits(p(Math.floor(t / 3600) % 24) + ':' + p(Math.floor(t / 60) % 60) + ':' + p(t % 60));
    return d ? T.num(d) + ' روز و ' + hms : hms;
  };
  T.ago = function (ms) {
    if (ms < 60000) return T.num(Math.max(1, Math.round(ms / 1000))) + ' ثانیه پیش';
    const m = Math.round(ms / 60000);
    if (m < 60) return T.num(m) + ' دقیقه پیش';
    const h = Math.floor(m / 60);
    if (h < 24) return T.num(h) + ' ساعت و ' + T.num(m % 60) + ' دقیقه پیش';
    return T.num(Math.floor(h / 24)) + ' روز و ' + T.num(h % 24) + ' ساعت پیش';
  };
  T.kb = (b) => (b == null ? '—' : T.num(b / 1024, 0) + ' کیلوبایت');

  /* ---------- Vocabulary ---------- */
  T.STATION_STATE = {
    idle: 'بیکار', stabilising: 'در حال تثبیت', running: 'در حال کار',
    post_cycle: 'پس از چرخه', fault: 'خطا',
  };
  T.CH_STATE = { valid: 'معتبر', out_of_range: 'خارج از محدوده', unconfigured: 'پیکربندی نشده' };
  T.QTY = { pressure: 'فشار', temperature: 'دما' };
  T.UNIT = { pressure: 'بار', temperature: '°س' };
  T.UNIT_LONG = { pressure: 'بار', temperature: 'درجهٔ سلسیوس' };
  T.NOZZLE = { 1: 'بالا', 2: 'پایین' };
  T.MODE = { linear: 'خطی', nonlinear: 'غیرخطی' };
  T.RESET_REASON = {
    power_on: 'روشن شدن', software: 'راه‌اندازی مجدد نرم‌افزاری', watchdog: 'زمان‌سنج نگهبان',
    brownout: 'افت ولتاژ تغذیه', panic: 'خطای میان‌افزار', external: 'دکمهٔ بازنشانی', unknown: 'نامشخص',
  };

  /* ---------- Theme ---------- */
  T.theme = {
    get: () => document.documentElement.getAttribute('data-theme') || 'graphite',
    set(t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('tf-theme', t); } catch (e) { /* storage off */ }
    },
    toggle() { T.theme.set(T.theme.get() === 'graphite' ? 'daylight' : 'graphite'); },
  };

  /* ---------- Shell ---------- */
  const logo = (size) => T.svg('svg', { class: 'logo', viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': 'true' },
    T.svg('use', { href: '#logo' }));
  T.shell = function (active) {
    const top = T.$('#top');
    const link = (href, key, icon, label) =>
      T.h('a', { href, 'aria-current': active === key ? 'page' : null }, T.icon(icon), label);
    const themeBtn = T.h('button', {
      class: 'icon-btn', type: 'button', title: 'تغییر پوسته', 'aria-label': 'تغییر پوسته روشن و تیره',
      onclick: () => { T.theme.toggle(); paintTheme(); },
    });
    function paintTheme() {
      T.clear(themeBtn).append(T.icon(T.theme.get() === 'graphite' ? 'sun' : 'moon'));
    }
    paintTheme();
    T.clear(top).append(
      T.h('a', { class: 'brand', href: '#/dashboard' },
        logo(34),
        T.h('div', null, T.h('b', { text: 'تافنینگ' }), T.h('span', { text: 'پنل محلی دستگاه' }))),
      T.h('nav', { class: 'nav', 'aria-label': 'بخش‌ها' },
        link('#/dashboard', 'dash', 'grid', 'داشبورد'),
        link('#/settings', 'set', 'sliders', 'تنظیمات'),
        link('#/calibration', 'cal', 'curve', 'کالیبراسیون')),
      T.h('div', { class: 'top-actions' },
        themeBtn,
        T.h('button', { class: 'icon-btn', type: 'button', onclick: T.logout },
          T.icon('logout'), T.h('span', { class: 'lbl-t', text: 'خروج' })))
    );
  };

  // settings sub navigation shared by the settings and calibration views
  T.SETTINGS_TABS = [
    ['network', 'شبکه', 'wifi'], ['system', 'سیستم', 'chip'], ['polarity', 'قطبیت ورودی و خروجی', 'power'],
    ['calibration', 'کالیبراسیون', 'curve'], ['about', 'درباره', 'info'],
  ];
  T.subnav = function (el, active) {
    T.clear(el).append(...T.SETTINGS_TABS.map(([k, label, ic]) =>
      T.h('a', {
        href: k === 'calibration' ? '#/calibration' : '#/settings/' + k,
        'aria-current': active === k ? 'true' : null, dataset: { tab: k },
      }, T.icon(ic), label)));
  };

  /* ---------- Toast ---------- */
  T.toast = function (msg, kind) {
    let box = T.$('.toasts');
    if (!box) { box = T.h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
    const t = T.h('div', { class: 'toast ' + (kind || ''), text: msg });
    box.append(t);
    setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3200);
  };

  /* ---------- Dialog ----------
     T.ask({title, body, ok, cancel, danger, typeWord}) → Promise<boolean>
     typeWord: user must type this exact Persian word to enable OK. */
  T.ask = function (o) {
    return new Promise((resolve) => {
      const okBtn = T.h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), type: 'submit', text: o.ok || 'تأیید' });
      const input = o.typeWord ? T.h('input', { class: 'input', autocomplete: 'off', 'aria-label': 'عبارت تأیید' }) : null;
      if (input) {
        okBtn.disabled = true;
        input.addEventListener('input', () => { okBtn.disabled = input.value.trim() !== o.typeWord; });
      }
      const form = T.h('form', { method: 'dialog', class: 'dlg-b' },
        T.h('h2', { text: o.title }),
        o.body ? (typeof o.body === 'string' ? T.h('p', { text: o.body }) : o.body) : null,
        input ? T.h('label', { class: 'field', style: 'margin-block-start:14px' },
          T.h('span', null, 'برای تأیید، عبارت «', T.h('b', { text: o.typeWord }), '» را بنویسید'), input) : null,
        T.h('div', { class: 'actions' },
          okBtn,
          T.h('button', { class: 'btn ghost', type: 'button', text: o.cancel || 'انصراف', onclick: () => done(false) })));
      const dlg = T.h('dialog', { class: o.wide ? 'wide' : null }, form);
      let settled = false;
      function done(v) { if (settled) return; settled = true; dlg.close(); dlg.remove(); resolve(v); }
      form.addEventListener('submit', (e) => { e.preventDefault(); done(true); });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
      document.body.append(dlg);
      dlg.showModal();
      (input || okBtn).focus();
    });
  };

  /* ---------- Reboot flow ---------- */
  T.rebootFlow = async function (opts) {
    opts = opts || {};
    if (!opts.skipAsk) {
      const ok = await T.ask({
        title: 'راه‌اندازی مجدد دستگاه',
        body: 'پایش و ارسال داده تا بالا آمدن دوباره قطع می‌شود و باید دوباره وارد شوید. ادامه می‌دهید؟',
        ok: 'راه‌اندازی مجدد',
      });
      if (!ok) return;
    }
    try {
      if (opts.call) await opts.call(); else await T.api.reboot();
    } catch (e) { T.toast(T.errMsg(e), 'bad'); return; }
    T.waitForDevice(opts.note);
  };
  T.waitForDevice = function (note) {
    const msg = T.h('p', { class: 'muted', text: 'دستگاه در حال راه‌اندازی مجدد است…' });
    document.body.append(T.h('div', { class: 'overlay' },
      T.h('div', { class: 'card' }, T.h('div', { class: 'spin' }), T.h('h2', { text: 'لطفاً صبر کنید' }), msg,
        note ? T.h('p', { class: 'small muted', style: 'margin-block-start:10px', text: note }) : null)));
    // sessions are gone after a reboot: start the SPA again from a clean slate on the login view
    const restart = () => { history.replaceState(null, '', location.pathname + '#/login'); location.reload(); };
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        await T.api.ping();
        restart();
        return;
      } catch (e) {
        if (e.status === 401 || e.status === 403) { restart(); return; }
      }
      if (tries > 45) msg.textContent = 'دستگاه هنوز پاسخ نمی‌دهد. اتصال وای‌فای را بررسی کنید.';
      setTimeout(tick, 2000);
    };
    setTimeout(tick, 2500);
  };

  /* ---------- REST layer: fetch wrapper, timeout, session handling, Persian errors (API.md) ---------- */
  class ApiError extends Error {
    constructor(status, data) {
      super((data && data.error) || 'http_' + status);
      this.status = status;
      this.data = data || {};
      this.code = this.data.error || (status ? 'http_' + status : 'network');
    }
  }
  T.ApiError = ApiError;

  async function req(method, path, body, opt) {
    opt = opt || {};
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), opt.timeout || 8000) : 0;
    let res, data = null;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctl ? ctl.signal : undefined,
      });
    } catch (e) {
      throw new ApiError(0, { error: e && e.name === 'AbortError' ? 'timeout' : 'network' });
    } finally {
      clearTimeout(timer);
    }
    try { data = await res.json(); } catch (e) { data = null; }
    if (!opt.noRedirect) {
      if (res.status === 401) { T.toLogin(false); throw new ApiError(401, data); }
      if (res.status === 403 && data && data.error === 'password_change_required') { T.toLogin(true); throw new ApiError(403, data); }
    }
    if (!res.ok || (data && data.ok === false)) throw new ApiError(res.status, data);
    return data;
  }

  T.api = {
    // Password hashing (PBKDF2) runs on the ESP32; a legacy 600 000-round hash
    // can take ~20 s to verify once, so these two calls get a long timeout.
    login: (username, password) => req('POST', '/api/login', { username, password }, { noRedirect: true, timeout: 45000 }),
    logout: () => req('POST', '/api/logout', {}, { noRedirect: true }),
    changePassword: (current_password, new_password) =>
      req('POST', '/api/password', { current_password, new_password }, { noRedirect: true, timeout: 45000 }),
    // Exists only in development firmware (TM_DEV_SHOW_PASSWORD=1); 404 otherwise.
    devCredentials: () => req('GET', '/api/dev/credentials', undefined, { noRedirect: true, timeout: 3000 }),
    state: () => req('GET', '/api/state', undefined, { timeout: 4000 }),
    status: () => req('GET', '/api/status'),
    ping: () => req('GET', '/api/status', undefined, { timeout: 3000, noRedirect: true }),
    settings: () => req('GET', '/api/settings'),
    saveSettings: (patch) => req('POST', '/api/settings', patch),
    copyCalibration: (body) => req('POST', '/api/settings/calibration/copy', body),
    reboot: () => req('POST', '/api/reboot', { confirm: true }),
    factoryReset: () => req('POST', '/api/factory-reset', { confirm: 'RESET' }),
  };

  /* Persian message for any error. Field-level details are handled by pages. */
  const MSG = {
    network: 'ارتباط با دستگاه برقرار نشد. اتصال وای‌فای را بررسی کنید.',
    timeout: 'دستگاه در زمان مقرر پاسخ نداد.',
    invalid_credentials: 'نام کاربری یا رمز عبور نادرست است.',
    too_many_attempts: 'تلاش ناموفق زیاد بود. کمی بعد دوباره امتحان کنید.',
    password_change_required: 'ابتدا باید رمز عبور پیش‌فرض را تغییر دهید.',
    weak_password: 'رمز عبور جدید باید دست‌کم ۸ نویسه داشته باشد.',
    same_as_default: 'رمز عبور جدید نباید با رمز پیش‌فرض یکسان باشد.',
    same_as_current: 'رمز عبور جدید باید با رمز فعلی متفاوت باشد.',
    wrong_current_password: 'رمز عبور فعلی نادرست است.',
    validation: 'برخی مقادیر نامعتبرند. موارد مشخص‌شده را اصلاح کنید.',
    confirm_required: 'تأیید عملیات دریافت نشد.',
    busy: 'دستگاه مشغول است. چند لحظه بعد دوباره تلاش کنید.',
    storage_error: 'ذخیره در حافظهٔ دستگاه ناموفق بود.',
    payload_too_large: 'حجم درخواست بیش از حد مجاز دستگاه است.',
    http_404: 'این بخش روی دستگاه در دسترس نیست.',
    http_500: 'خطای داخلی دستگاه.',
    http_503: 'دستگاه موقتاً در دسترس نیست.',
  };
  T.errMsg = function (e) {
    const code = (e && e.code) || 'network';
    let m = MSG[code] || 'خطای ناشناخته در ارتباط با دستگاه.';
    if (code === 'too_many_attempts' && e.data && e.data.retry_after_s)
      m = 'تلاش ناموفق زیاد بود. ' + T.num(e.data.retry_after_s) + ' ثانیه دیگر دوباره امتحان کنید.';
    return m;
  };

  /* Persian text for server-side field validation codes (details[].code) */
  T.FIELD_MSG = {
    required: 'این مقدار الزامی است.',
    too_long: 'طول مقدار بیش از حد مجاز است.',
    too_short: 'طول مقدار کمتر از حد مجاز است.',
    out_of_bounds: 'مقدار خارج از بازهٔ مجاز است.',
    not_integer: 'مقدار باید عدد صحیح باشد.',
    invalid_host: 'نشانی میزبان نامعتبر است.',
    reserved_pin: 'این پایه رزرو شده یا برای خروجی مناسب نیست.',
    invalid_enum: 'گزینهٔ انتخاب‌شده نامعتبر است.',
    point_count: 'تعداد نقاط با حالت انتخاب‌شده هم‌خوانی ندارد.',
    not_finite: 'مقدار باید عددی متناهی باشد.',
    not_ascending: 'ولتاژها باید متمایز و صعودی باشند.',
    voltage_range: 'ولتاژ باید بین ۰ تا ۵ ولت باشد.',
    window_invalid: 'پنجرهٔ ولتاژ معتبر نادرست است.',
    quantity_mismatch: 'کمیت کانال مقصد با مبدأ یکسان نیست.',
    unknown_channel: 'کانال وجود ندارد.',
  };

  /* ---------- Calibration math + preview chart (SVG, no library) ----------
     The preview uses exactly the rules the firmware must apply (DR-27 / DR-30):
     - LINEAR: 2 points, NON-LINEAR: 5 points, piecewise-linear between points
     - outside the calibrated span but inside 0–5 V and the valid window:
       linear extrapolation along the end segment (still valid)
     - outside 0–5 V or outside the valid window: out_of_range (no value) */
  const VMIN = 0, VMAX = 5;

  const CM = (T.calMath = {
    VMIN, VMAX,
    count: (mode) => (mode === 'linear' ? 2 : mode === 'nonlinear' ? 5 : 0),
    // returns array of {row, field, msg}; empty = valid
    validate(c) {
      const out = [];
      if (!c.mode) return out;
      const n = CM.count(c.mode);
      if (!c.points || c.points.length !== n) out.push({ row: -1, field: 'mode', msg: 'تعداد نقاط باید ' + T.num(n) + ' باشد.' });
      (c.points || []).forEach((p, i) => {
        if (!isFinite(p.voltage)) out.push({ row: i, field: 'voltage', msg: 'ولتاژ نقطهٔ ' + T.num(i + 1) + ' عدد معتبری نیست.' });
        else if (p.voltage < VMIN || p.voltage > VMAX) out.push({ row: i, field: 'voltage', msg: 'ولتاژ نقطهٔ ' + T.num(i + 1) + ' باید بین ۰ تا ۵ ولت باشد.' });
        if (!isFinite(p.value)) out.push({ row: i, field: 'value', msg: 'مقدار نقطهٔ ' + T.num(i + 1) + ' عدد معتبری نیست.' });
        if (i > 0 && isFinite(p.voltage) && isFinite(c.points[i - 1].voltage) && !(p.voltage > c.points[i - 1].voltage))
          out.push({ row: i, field: 'voltage', msg: 'ولتاژ نقطهٔ ' + T.num(i + 1) + ' باید بیشتر از نقطهٔ ' + T.num(i) + ' باشد (متمایز و صعودی).' });
      });
      const w = c.valid_window || [];
      if (!(isFinite(w[0]) && isFinite(w[1]) && w[0] >= VMIN && w[1] <= VMAX && w[0] < w[1]))
        out.push({ row: -1, field: 'window', msg: 'پنجرهٔ ولتاژ معتبر باید در بازهٔ ۰ تا ۵ ولت و «از» کوچک‌تر از «تا» باشد.' });
      return out;
    },
    ok: (c) => !!c.mode && CM.validate(c).length === 0,
    // piecewise-linear with end-segment extrapolation; no range checks
    curve(pts, v) {
      let i = 0;
      while (i < pts.length - 2 && v > pts[i + 1].voltage) i++;
      const a = pts[i], b = pts[i + 1];
      return a.value + ((v - a.voltage) * (b.value - a.value)) / (b.voltage - a.voltage);
    },
    convert(c, v) {
      if (!c || !c.mode) return { state: 'unconfigured' };
      if (!CM.ok(c)) return { state: 'invalid' };
      if (!isFinite(v) || v < VMIN || v > VMAX || v < c.valid_window[0] || v > c.valid_window[1]) return { state: 'out_of_range' };
      return { state: 'valid', value: CM.curve(c.points, v) };
    },
  });

  /* ---------- chart ---------- */
  const W = 360, H = 210, L = 46, R = 12, TP = 14, B = 34;
  const s = (tag, a, txt) => { const el = T.svg(tag, a); if (txt != null) el.textContent = txt; return el; };

  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => span / x <= n) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return { out, step };
  }

  T.calChart = function (unitLabel) {
    const svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', direction: 'ltr' });
    function update(c, live) {
      T.clear(svg);
      const okCal = c && CM.ok(c);
      const win = okCal ? c.valid_window : [VMIN, VMAX];
      const x = (v) => L + ((v - VMIN) / (VMAX - VMIN)) * (W - L - R);
      let ylo = 0, yhi = 1;
      if (okCal) {
        const ys = c.points.map((p) => p.value).concat([CM.curve(c.points, win[0]), CM.curve(c.points, win[1])]);
        ylo = Math.min.apply(null, ys); yhi = Math.max.apply(null, ys);
        if (yhi - ylo < 1e-9) { ylo -= 1; yhi += 1; }
        const pad = (yhi - ylo) * 0.08; ylo -= pad; yhi += pad;
      }
      const ticks = niceTicks(ylo, yhi, 4);
      const y = (v) => TP + (1 - (v - ylo) / (yhi - ylo)) * (H - TP - B);
      const dec = ticks.step < 0.1 ? 2 : ticks.step < 1 ? 1 : 0;

      // out-of-window zones
      if (win[0] > VMIN) svg.append(s('rect', { class: 'oow', x: x(VMIN), y: TP, width: x(win[0]) - x(VMIN), height: H - TP - B }));
      if (win[1] < VMAX) svg.append(s('rect', { class: 'oow', x: x(win[1]), y: TP, width: x(VMAX) - x(win[1]), height: H - TP - B }));
      // grid + axis labels
      for (let v = 0; v <= 5; v++) {
        svg.append(s('line', { class: 'grid', x1: x(v), x2: x(v), y1: TP, y2: H - B }));
        svg.append(s('text', { x: x(v), y: H - B + 14, 'text-anchor': 'middle' }, T.num(v)));
      }
      svg.append(s('text', { x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle', direction: 'rtl' }, 'ولتاژ ورودی (ولت)'));
      if (okCal) {
        ticks.out.forEach((v) => {
          svg.append(s('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
          svg.append(s('text', { x: L - 6, y: y(v) + 3, 'text-anchor': 'end' }, T.num(v, dec)));
        });
        svg.append(s('text', { x: L + 4, y: TP + 10, direction: 'rtl', 'text-anchor': 'start' }, unitLabel));
        const p = c.points, first = p[0], last = p[p.length - 1];
        if (win[0] < first.voltage)
          svg.append(s('path', { class: 'seg-x', d: 'M' + x(win[0]) + ' ' + y(CM.curve(p, win[0])) + 'L' + x(first.voltage) + ' ' + y(first.value) }));
        if (win[1] > last.voltage)
          svg.append(s('path', { class: 'seg-x', d: 'M' + x(last.voltage) + ' ' + y(last.value) + 'L' + x(win[1]) + ' ' + y(CM.curve(p, win[1])) }));
        svg.append(s('path', { class: 'seg-c', d: p.map((q, i) => (i ? 'L' : 'M') + x(q.voltage) + ' ' + y(q.value)).join('') }));
        p.forEach((q, i) => {
          svg.append(s('circle', { class: 'pt', cx: x(q.voltage), cy: y(q.value), r: 4.5 }));
          svg.append(s('text', { x: x(q.voltage), y: y(q.value) - 9, 'text-anchor': 'middle' }, T.num(i + 1)));
        });
      } else {
        svg.append(s('text', { class: 'msg', x: (L + W - R) / 2, y: (TP + H - B) / 2, 'text-anchor': 'middle', direction: 'rtl' },
          !c || !c.mode ? 'پیکربندی نشده — نقاط را وارد کنید' : 'نقاط کامل یا معتبر نیستند'));
      }
      if (live != null && isFinite(live)) {
        const lv = Math.min(VMAX, Math.max(VMIN, live));
        svg.append(s('line', { class: 'lv', x1: x(lv), x2: x(lv), y1: TP, y2: H - B }));
        const r = CM.convert(c, live);
        if (r.state === 'valid' && r.value >= ylo && r.value <= yhi) svg.append(s('circle', { class: 'lvd', cx: x(lv), cy: y(r.value), r: 5 }));
      }
      svg.setAttribute('aria-label', okCal ? 'نمودار نگاشت ولتاژ به مقدار' : 'پیش‌نمایش در دسترس نیست');
    }
    return { el: svg, update };
  };

  /* ---------- Scope: per-mount cleanup (listeners, timers, subscriptions) ---------- */
  T.scope = function () {
    const fns = [];
    return {
      on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); fns.push(() => t.removeEventListener(ev, fn, opt)); },
      every(fn, ms) { const id = setInterval(fn, ms); fns.push(() => clearInterval(id)); },
      add(fn) { fns.push(fn); },
      dispose() { while (fns.length) { try { fns.pop()(); } catch (e) { /* keep disposing */ } } },
    };
  };

  /* ---------- Live state feed ----------
     One shared source for GET /api/state-shaped data, used by the dashboard
     and the calibration editor's live voltage. Primary: server-push WebSocket
     at ws://<host>/ws ({type:"hello"} once, then {type:"state"} every 1 s).
     Fallback: sequential fetch() polling at 1 Hz, while the socket is retried
     with backoff (2 s → 30 s). The socket is closed while the tab is hidden
     and shortly after the last subscriber leaves. The client never sends. */
  T.live = (function () {
    const subs = new Set();
    const POLL_MS = 1000, WS_STALE_MS = 3500, WS_OPEN_MS = 4000, LINGER_MS = 3000;
    let ws = null, wsUp = false, pollOn = false, gen = 0;
    let pollTimer = 0, retryTimer = 0, staleTimer = 0, openTimer = 0, lingerTimer = 0, retryDelay = 2000;
    const L = { hello: null, transport: 'off' };

    function emit(kind, x) {
      subs.forEach((s) => { if (s[kind]) { try { s[kind](x); } catch (e) { console.error(e); } } });
    }
    const active = () => subs.size > 0 && !document.hidden;
    function setTransport(t) { L.transport = t; emit('transport', t); }

    function stopWs() {
      clearTimeout(staleTimer); clearTimeout(openTimer);
      if (ws) { const s = ws; ws = null; s.onopen = s.onmessage = s.onclose = s.onerror = null; try { s.close(); } catch (e) { /* closed */ } }
      wsUp = false;
    }
    function stopPoll() { pollOn = false; gen++; clearTimeout(pollTimer); }
    function stopAll() { clearTimeout(retryTimer); stopWs(); stopPoll(); setTransport('off'); }

    function openWs() {
      clearTimeout(retryTimer);
      if (!active() || ws) return;
      if (typeof WebSocket !== 'function') { startPoll(); return; }
      let sock;
      try { sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); }
      catch (e) { fallback(); return; }
      ws = sock;
      openTimer = setTimeout(() => { if (ws === sock && !wsUp) { stopWs(); fallback(); } }, WS_OPEN_MS);
      sock.onopen = () => {
        clearTimeout(openTimer);
        wsUp = true; retryDelay = 2000;
        stopPoll(); setTransport('ws'); armStale();
      };
      sock.onmessage = (ev) => {
        let d = null;
        try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (!d || typeof d !== 'object') return;
        if (d.type === 'hello') { L.hello = d; emit('hello', d); return; }
        if (d.type === 'state') { armStale(); emit('data', d); }
      };
      sock.onerror = () => { /* a close event always follows */ };
      sock.onclose = () => { if (ws !== sock) return; stopWs(); fallback(); };
    }
    // an open socket that goes quiet is treated as dead
    function armStale() {
      clearTimeout(staleTimer);
      staleTimer = setTimeout(() => { stopWs(); fallback(); }, WS_STALE_MS);
    }
    function fallback() {
      if (!active()) return;
      startPoll();
      clearTimeout(retryTimer);
      retryTimer = setTimeout(openWs, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }

    function startPoll() {
      if (pollOn || !active()) return;
      pollOn = true;
      setTransport('http');
      poll(gen);
    }
    // sequential: the next request starts only after the previous one settles
    async function poll(my) {
      const t0 = Date.now();
      try {
        const d = await T.api.state();
        if (my !== gen) return;
        emit('data', d);
      } catch (e) {
        if (my !== gen) return;
        if (e.status === 401 || e.status === 403) return; // api layer already went to login
        emit('error', e);
      }
      if (my === gen && pollOn) pollTimer = setTimeout(() => poll(my), Math.max(0, POLL_MS - (Date.now() - t0)));
    }

    function resume() { if (active() && !ws && !pollOn) openWs(); }
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); else resume(); });

    // subscribe({data(d), error(e), hello(h), transport(t)}) → unsubscribe()
    L.subscribe = function (s) {
      subs.add(s);
      clearTimeout(lingerTimer);
      if (s.transport) s.transport(L.transport);
      resume();
      return () => {
        if (!subs.delete(s)) return;
        if (!subs.size) lingerTimer = setTimeout(() => { if (!subs.size) stopAll(); }, LINGER_MS);
      };
    };
    L.stop = () => { subs.clear(); stopAll(); };
    return L;
  })();

  /* ---------- Router + view loader ---------- */
  const ROUTES = {
    dashboard: { nav: 'dash', title: 'داشبورد', file: 'dashboard.js' },
    settings: { nav: 'set', title: 'تنظیمات', file: 'settings.js' },
    calibration: { nav: 'set', title: 'کالیبراسیون', file: 'calibration.js' },
  };
  const NEXT_RE = /^#\/(dashboard|settings(\/[a-z]+)?|calibration(\/\d+)?)$/;
  let authed = false, cur = null, curHash = '', next = '#/dashboard', queue = Promise.resolve();
  // where to go after login; kept in sessionStorage so a reload on the login view doesn't lose it
  function remember(hash) {
    if (!NEXT_RE.test(hash)) return;
    next = hash;
    try { sessionStorage.setItem('tf-next', hash); } catch (e) { /* storage off */ }
  }
  try { const n = sessionStorage.getItem('tf-next'); if (NEXT_RE.test(n)) next = n; } catch (e) { /* storage off */ }

  T.parseHash = function () {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    return { name: parts[0] || '', sub: parts.slice(1).join('/') };
  };
  // update the hash without a history entry or a route (views use it for sub-state)
  T.replaceHash = function (hash) { history.replaceState(null, '', hash); curHash = location.hash; };
  T.nav = function (hash) {
    if (location.hash === hash) enqueue();
    else location.replace(hash); // fires hashchange
  };
  function enqueue() { queue = queue.then(route, route); return queue; }

  const loaded = {};
  function need(file) {
    return loaded[file] || (loaded[file] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = file;
      s.onload = resolve;
      s.onerror = () => { delete loaded[file]; s.remove(); reject(new ApiError(0, { error: 'network' })); };
      document.head.append(s);
    }));
  }

  function unmount() {
    if (!cur) return;
    T.$$('dialog').forEach((d) => { try { d.close(); } catch (e) { /* not open */ } d.remove(); });
    cur.scope.dispose();
    T.$('#p-' + cur.name).hidden = true;
    cur = null;
  }
  function showOnly(id) {
    T.$('#v-boot').hidden = id !== 'v-boot';
    T.$('#v-login').hidden = id !== 'v-login';
    T.$('#shell').hidden = id !== 'shell';
  }

  async function route() {
    const r = T.parseHash();
    if (r.name === 'login') {
      if (authed) { T.nav('#/dashboard'); return; }
      unmount();
      showLogin(r.sub === 'change');
      return;
    }
    if (!authed) {
      remember(location.hash);
      T.nav('#/login');
      return;
    }
    const def = ROUTES[r.name];
    if (!def) { T.nav('#/dashboard'); return; }
    if (cur && cur.name === r.name) {
      curHash = location.hash;
      if (cur.view.sub) await cur.view.sub(r.sub);
      return;
    }
    if (cur && cur.view.dirty && cur.view.dirty() &&
        !(await T.ask({ title: 'تغییرات ذخیره نشده', body: 'تغییرات این صفحه ذخیره نشده است. رها شود؟', ok: 'رها کن', danger: true }))) {
      history.replaceState(null, '', curHash);
      return;
    }
    unmount();
    showOnly('shell');
    T.shell(def.nav);
    document.title = def.title + ' · تافنینگ';
    const page = T.$('#p-' + r.name);
    page.hidden = false;
    window.scrollTo(0, 0);
    try { await need(def.file); }
    catch (e) {
      T.toast(T.errMsg(e), 'bad');
      return;
    }
    if (T.parseHash().name !== r.name) return; // navigated away while loading
    const scope = T.scope();
    cur = { name: r.name, view: T.views[r.name], scope };
    curHash = location.hash;
    cur.view.mount(r.sub, scope);
  }

  window.addEventListener('hashchange', enqueue);
  window.addEventListener('beforeunload', (e) => {
    if (cur && cur.view.dirty && cur.view.dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  T.logout = async function () {
    try { await T.api.logout(); } catch (e) { /* ignore */ }
    authed = false;
    next = '#/dashboard';
    try { sessionStorage.removeItem('tf-next'); } catch (e) { /* storage off */ }
    T.live.stop();
    T.nav('#/login');
  };
  // called by the API layer on 401 (session gone) or 403 password_change_required
  T.toLogin = function (change) {
    if (!authed && T.parseHash().name === 'login') return;
    authed = false;
    remember(location.hash);
    T.nav(change ? '#/login/change' : '#/login');
  };

  /* ---------- Login view (+ mandatory default-password change, DR-22) ---------- */
  let lastPassword = null, lastUser = '', loginReady = false;
  function busy(btn, on, label) { btn.disabled = on; btn.textContent = on ? 'لطفاً صبر کنید…' : label; }
  function showChange(knowCurrent) {
    T.$('#f-login').hidden = true;
    T.$('#f-change').hidden = false;
    T.$('#w-cur').hidden = knowCurrent;
    (knowCurrent ? T.$('#c1') : T.$('#c0')).focus();
  }
  function enter() {
    authed = true; lastPassword = null;
    const to = NEXT_RE.test(next) ? next : '#/dashboard';
    next = '#/dashboard';
    try { sessionStorage.removeItem('tf-next'); } catch (e) { /* storage off */ }
    T.nav(to);
  }
  function initLogin() {
    if (loginReady) return;
    loginReady = true;
    const $ = T.$;
    $('#note').append(T.icon('lock'), T.h('span', { text: 'این اتصال رمزنگاری نشده است. فقط از طریق شبکهٔ وای‌فای خود دستگاه وارد شوید و رمز عبور را در اختیار دیگران قرار ندهید.' }));
    T.$$('.pw-t').forEach((b) => {
      b.append(T.icon('eye'));
      b.addEventListener('click', () => {
        const i = b.previousElementSibling, show = i.type === 'password';
        i.type = show ? 'text' : 'password';
        b.setAttribute('aria-label', show ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور');
      });
    });
    $('#f-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = $('#u').value.trim(), p = $('#p').value, err = $('#e-login');
      err.textContent = '';
      if (!u || !p) { err.textContent = 'نام کاربری و رمز عبور را وارد کنید.'; return; }
      busy($('#b-login'), true);
      try {
        const r = await T.api.login(u, p);
        lastUser = u; lastPassword = p;
        busy($('#b-login'), false, 'ورود');
        if (r && r.must_change_password) { showChange(true); return; }
        enter();
      } catch (ex) {
        err.textContent = T.errMsg(ex);
        $('#p').select();
        busy($('#b-login'), false, 'ورود');
      }
    });
    $('#f-change').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#e-change'), cur0 = lastPassword != null ? lastPassword : $('#c0').value;
      const n1 = $('#c1').value, n2 = $('#c2').value;
      err.textContent = '';
      if (!cur0) { err.textContent = 'رمز عبور فعلی را وارد کنید.'; return; }
      if (n1.length < 8) { err.textContent = 'رمز عبور جدید باید دست‌کم ۸ نویسه داشته باشد.'; return; }
      if (n1 === cur0) { err.textContent = 'رمز عبور جدید باید با رمز فعلی متفاوت باشد.'; return; }
      if (lastUser && n1 === lastUser) { err.textContent = 'رمز عبور نباید با نام کاربری یکسان باشد.'; return; }
      if (n1 !== n2) { err.textContent = 'تکرار رمز عبور با رمز جدید یکسان نیست.'; return; }
      busy($('#b-change'), true);
      try {
        await T.api.changePassword(cur0, n1);
        busy($('#b-change'), false, 'ذخیره و ادامه');
        enter();
      } catch (ex) {
        busy($('#b-change'), false, 'ذخیره و ادامه');
        if (ex.status === 401) { showLogin(false); return; }
        err.textContent = T.errMsg(ex);
      }
    });
  }
  /* DEV builds only: always show the current random password on the login page. */
  async function showDevCredentials() {
    const box = T.$('#dev-banner');
    if (!box) return;
    let d = null;
    try { d = await T.api.devCredentials(); } catch (e) { box.hidden = true; return; }
    if (!d || !d.dev_mode) { box.hidden = true; return; }
    const kv = (k, v) => T.h('div', { class: 'dev-kv' }, T.h('span', { text: k }), T.h('code', { class: 'ltr', text: v || '—' }));
    T.clear(box).append(
      T.icon('warn'),
      T.h('div', { class: 'dev-body' },
        T.h('b', { text: 'نسخهٔ توسعه (TM_DEV_SHOW_PASSWORD) — هرگز روی دستگاه نهایی نصب نکنید' }),
        kv('نام کاربری', d.username),
        kv('رمز عبور', d.password),
        kv('شبکهٔ وای‌فای', d.ap_ssid),
        kv('رمز وای‌فای', d.ap_password),
        T.h('button', {
          class: 'btn sm', type: 'button', text: 'پر کردن فرم',
          onclick: () => { T.$('#u').value = d.username || ''; T.$('#p').value = d.password || ''; T.$('#c0').value = d.password || ''; },
        })));
    box.hidden = false;
  }

  function showLogin(change) {
    initLogin();
    showDevCredentials();
    showOnly('v-login');
    document.title = 'ورود · تافنینگ';
    ['#e-login', '#e-change'].forEach((s) => { T.$(s).textContent = ''; });
    ['#p', '#c0', '#c1', '#c2'].forEach((s) => { T.$(s).value = ''; });
    if (change) { lastPassword = null; showChange(false); return; }
    T.$('#f-change').hidden = true;
    T.$('#f-login').hidden = false;
    T.$('#u').focus();
  }

  /* ---------- Boot ---------- */
  async function boot() {
    let change = false;
    try { await T.api.ping(); authed = true; }
    catch (e) { change = e.status === 403 && e.code === 'password_change_required'; }
    const r = T.parseHash();
    if (authed) {
      if (!ROUTES[r.name]) history.replaceState(null, '', '#/dashboard');
    } else {
      remember(location.hash);
      history.replaceState(null, '', change ? '#/login/change' : '#/login');
    }
    enqueue();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
