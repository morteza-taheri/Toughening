/* تافنینگ — تنظیمات (شبکه، سیستم، قطبیت، درباره) · view: #/settings/<tab>
   Loads GET /api/settings + GET /api/status once per mount, renders one tab at
   a time (#/settings/network|system|polarity|about), and saves each tab as a
   partial POST /api/settings. */
'use strict';
(function () {
  const { h, $, num, icon } = T;
  const TABS = ['network', 'system', 'polarity', 'about'];
  let S = null, ST = null, stAt = 0, dirty = () => false;

  /* ---------- small builders ---------- */
  function field(label, input, hint, badge) {
    return h('label', { class: 'field' },
      h('span', null, label, badge || null), input, hint ? h('small', { text: hint }) : null,
      h('span', { class: 'err', role: 'alert' }));
  }
  const inp = (o) => h('input', Object.assign({ class: 'input', autocomplete: 'off', spellcheck: 'false' }, o));
  const prop = () => h('span', { class: 'badge prop', title: 'مقدار پیشنهادی، هنوز تأیید نشده', text: 'پیشنهادی' });
  function setErr(input, msg) {
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const e = input.closest('.field').querySelector('.err');
    if (e) e.textContent = msg || '';
    return !msg;
  }
  function pwInput(o) {
    const i = inp(Object.assign({ type: 'password', class: 'input ltr' }, o));
    const b = h('button', { type: 'button', 'aria-label': 'نمایش رمز عبور' }, icon('eye'));
    b.addEventListener('click', () => { i.type = i.type === 'password' ? 'text' : 'password'; });
    return { i, el: h('div', { class: 'pw' }, i, b) };
  }
  function saveBar(onSave, onReset) {
    const save = h('button', { class: 'btn primary', type: 'submit', text: 'ذخیره', disabled: true });
    const reset = h('button', { class: 'btn ghost', type: 'button', text: 'بازگردانی', disabled: true, onclick: onReset });
    return { el: h('div', { class: 'actions' }, save, reset), save, reset, onSave };
  }
  function trackDirty(form, bar, isDirty) {
    const upd = () => { const d = isDirty(); bar.save.disabled = !d; bar.reset.disabled = !d; };
    form.addEventListener('input', upd);
    form.addEventListener('change', upd);
    dirty = isDirty;
    upd();
    return upd;
  }
  function applyFieldErrors(e, map) {
    const det = (e.data && e.data.details) || [];
    det.forEach((d) => { if (map[d.field]) setErr(map[d.field], T.FIELD_MSG[d.code] || 'مقدار نامعتبر است.'); });
  }
  async function save(patch, btn, map) {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'در حال ذخیره…';
    try {
      const r = await T.api.saveSettings(patch);
      S = r.settings || merge(S, patch);
      T.toast('ذخیره شد.', 'ok');
      if (r.reboot_required) { sessionStorage.setItem('tf-reboot', '1'); showRebootBanner(); }
      return true;
    } catch (e) {
      T.toast(T.errMsg(e), 'bad');
      if (map) applyFieldErrors(e, map);
      return false;
    } finally {
      btn.textContent = old;
    }
  }
  function merge(a, b) {
    const o = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k];
    if (o.wifi && 'password' in o.wifi) { delete o.wifi.password; o.wifi.password_set = true; }
    return o;
  }
  function showRebootBanner() {
    if (sessionStorage.getItem('tf-reboot') !== '1') return;
    const b = T.clear($('#reboot-banner'));
    b.hidden = false;
    b.append(icon('warn'),
      h('p', { text: 'برخی تغییرات تنها پس از راه‌اندازی مجدد دستگاه اعمال می‌شوند.' }),
      h('button', {
        class: 'btn sm', type: 'button', text: 'راه‌اندازی مجدد اکنون',
        onclick: () => T.rebootFlow({ note: 'اگر نام یا رمز شبکه را تغییر داده‌اید، پس از راه‌اندازی به شبکهٔ جدید وصل شوید و این صفحه را دوباره باز کنید.' }),
      }));
  }
  const strBytes = (s) => new TextEncoder().encode(s).length;
  const isHost = (s) =>
    /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s) ||
    /^(?=.{1,63}$)[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(s);

  /* ---------- Network ---------- */
  function network(root) {
    const ssid = inp({ class: 'input ltr', value: S.wifi.ssid || '', maxlength: 32 });
    const pw = pwInput({ placeholder: S.wifi.password_set ? 'بدون تغییر' : 'تعیین نشده', maxlength: 63, autocomplete: 'new-password' });
    const host = inp({ class: 'input ltr', value: S.ws.host || '', maxlength: 63, inputmode: 'url' });
    const port = inp({ class: 'input ltr', value: String(S.ws.port || ''), maxlength: 5, inputmode: 'numeric' });
    const isDirty = () => ssid.value !== S.wifi.ssid || pw.i.value !== '' || host.value.trim() !== S.ws.host || T.parseInt(port.value) !== S.ws.port;
    const bar = saveBar();
    const form = h('form', { novalidate: true },
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('div', null, h('h2', { text: 'نقطهٔ دسترسی وای‌فای' }),
          h('p', { text: 'شبکه‌ای که دستگاه می‌سازد و این صفحه از طریق آن باز می‌شود.' }))),
        h('div', { class: 'grid2' },
          field('نام شبکه', ssid, 'حداکثر ۳۲ بایت.'),
          field('رمز شبکه', pw.el, 'برای تغییر وارد کنید؛ ۸ تا ۶۳ نویسه. خالی بماند یعنی بدون تغییر.'))),
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('div', null, h('h2', { text: 'اتصال به رایانهٔ کنسول' }),
          h('p', { text: 'دستگاه برای ارسال رکوردها به این نشانی وب‌سوکت وصل می‌شود.' }))),
        h('div', { class: 'grid2' },
          field('نشانی میزبان', host, 'پیش‌فرض: 192.168.4.2'),
          field('درگاه', port, 'پیش‌فرض: 8000'))),
      h('div', { class: 'banner info', style: 'margin-block-start:16px' }, icon('info'),
        h('p', { text: 'همهٔ تغییرات این بخش پس از راه‌اندازی مجدد اعمال می‌شوند. با تغییر نام یا رمز شبکه، این صفحه قطع می‌شود و باید دوباره به شبکهٔ جدید وصل شوید.' })),
      bar.el);
    const upd = trackDirty(form, bar, isDirty);
    bar.reset.addEventListener('click', () => { T.clear(root); network(root); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const s = ssid.value, p = pw.i.value, hs = host.value.trim(), pt = T.parseInt(port.value);
      let ok = true;
      ok = setErr(ssid, !s ? T.FIELD_MSG.required : strBytes(s) > 32 ? T.FIELD_MSG.too_long : '') && ok;
      ok = setErr(pw.i, p && (p.length < 8 || p.length > 63 || !/^[\x20-\x7e]+$/.test(p)) ? 'رمز باید ۸ تا ۶۳ نویسهٔ لاتین باشد.' : '') && ok;
      ok = setErr(host, !isHost(hs) ? T.FIELD_MSG.invalid_host : '') && ok;
      ok = setErr(port, !(pt >= 1 && pt <= 65535) ? 'درگاه باید عددی بین ۱ تا ۶۵۵۳۵ باشد.' : '') && ok;
      if (!ok) return;
      const patch = {};
      if (s !== S.wifi.ssid || p) { patch.wifi = { ssid: s }; if (p) patch.wifi.password = p; }
      if (hs !== S.ws.host || pt !== S.ws.port) patch.ws = { host: hs, port: pt };
      if (patch.wifi) {
        const go = await T.ask({ title: 'تغییر شبکهٔ وای‌فای', body: 'پس از راه‌اندازی مجدد، ارتباط این صفحه قطع می‌شود و باید به شبکهٔ «' + s + '» وصل شوید. ادامه می‌دهید؟', ok: 'ذخیره' });
        if (!go) return;
      }
      if (await save(patch, bar.save, { 'wifi.ssid': ssid, 'wifi.password': pw.i, 'ws.host': host, 'ws.port': port })) {
        T.clear(root); network(root);
      } else upd();
    });
    root.append(form);
  }

  /* ---------- System ---------- */
  // Output-capable GPIOs excluding: 0/5/12/15 (strapping), 1/3 (UART0),
  // 6–11 (flash), 21/22 (I2C, DR-37), 34–39 (input only).
  // GPIO2 is the DevKit on-board LED and the firmware default (must match
  // ALLOWED_LED_PINS in main.cpp, otherwise the System tab could never be saved).
  const LED_PINS = [2, 4, 13, 14, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33];
  function system(root) {
    const wdt = inp({ class: 'input', value: T.numT(S.wdt_sec), inputmode: 'numeric', maxlength: 3 });
    const gpio = h('select', { class: 'input' }, LED_PINS.map((p) => h('option', { value: String(p), text: 'پایهٔ ' + num(p), selected: p === S.led.gpio })));
    if (!LED_PINS.includes(S.led.gpio)) gpio.prepend(h('option', { value: String(S.led.gpio), text: 'پایهٔ ' + num(S.led.gpio), selected: true }));
    const per = inp({ class: 'input', value: T.numT(S.led.period_ms), inputmode: 'numeric', maxlength: 4 });
    const isDirty = () => T.parseInt(wdt.value) !== S.wdt_sec || +gpio.value !== S.led.gpio || T.parseInt(per.value) !== S.led.period_ms;
    const bar = saveBar();
    const form = h('form', { novalidate: true, class: 'card' },
      h('div', { class: 'card-h' }, h('div', null, h('h2', { text: 'پایش داخلی دستگاه' }),
        h('p', { text: 'پس از ذخیره، با راه‌اندازی مجدد اعمال می‌شود.' }))),
      h('div', { class: 'grid2' },
        field('زمان زمان‌سنج نگهبان (ثانیه)', wdt, 'اگر میان‌افزار در این مدت پاسخ ندهد، تراشه بازنشانی می‌شود. ۵ تا ۶۰.', prop()),
        field('پایهٔ چراغ ضربان', gpio, 'پایه‌های راه‌اندازی، حافظهٔ فلش، گذرگاه آی‌تو‌سی و ورودی‌محض حذف شده‌اند.', prop()),
        field('دورهٔ چشمک (میلی‌ثانیه)', per, '۲۰ تا ۵۰۰۰.')),
      bar.el);
    const upd = trackDirty(form, bar, isDirty);
    bar.reset.addEventListener('click', () => { T.clear(root); system(root); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const w = T.parseInt(wdt.value), p = T.parseInt(per.value);
      let ok = setErr(wdt, !(w >= 5 && w <= 60) ? 'عددی صحیح بین ۵ تا ۶۰ وارد کنید.' : '');
      ok = setErr(per, !(p >= 20 && p <= 5000) ? 'عددی صحیح بین ۲۰ تا ۵۰۰۰ وارد کنید.' : '') && ok;
      if (!ok) return;
      if (await save({ wdt_sec: w, led: { gpio: +gpio.value, period_ms: p } }, bar.save, { wdt_sec: wdt, 'led.gpio': gpio, 'led.period_ms': per })) {
        T.clear(root); system(root);
      } else upd();
    });

    // admin password
    const c0 = pwInput({ autocomplete: 'current-password', maxlength: 64 });
    const c1 = pwInput({ autocomplete: 'new-password', maxlength: 64 });
    const c2 = inp({ type: 'password', class: 'input ltr', autocomplete: 'new-password', maxlength: 64 });
    const pbtn = h('button', { class: 'btn', type: 'submit', text: 'تغییر رمز' });
    const pform = h('form', { novalidate: true, class: 'card' },
      h('div', { class: 'card-h' }, h('div', null, h('h2', { text: 'رمز عبور مدیر' }), h('p', { text: 'تنها یک کاربر مدیر وجود دارد.' }))),
      h('div', { class: 'grid2' }, field('رمز فعلی', c0.el), field('رمز جدید', c1.el, 'دست‌کم ۸ نویسه.'), field('تکرار رمز جدید', c2)),
      h('div', { class: 'actions' }, pbtn));
    pform.addEventListener('submit', async (e) => {
      e.preventDefault();
      let ok = setErr(c0.i, c0.i.value ? '' : T.FIELD_MSG.required);
      ok = setErr(c1.i, c1.i.value.length < 8 ? T.errMsg({ code: 'weak_password' }) : c1.i.value === c0.i.value ? T.errMsg({ code: 'same_as_current' }) : '') && ok;
      ok = setErr(c2, c2.value !== c1.i.value ? 'تکرار رمز با رمز جدید یکسان نیست.' : '') && ok;
      if (!ok) return;
      pbtn.disabled = true;
      try {
        await T.api.changePassword(c0.i.value, c1.i.value);
        T.toast('رمز عبور تغییر کرد.', 'ok');
        pform.reset();
      } catch (ex) {
        if (ex.code === 'wrong_current_password') setErr(c0.i, T.errMsg(ex)); else T.toast(T.errMsg(ex), 'bad');
      } finally { pbtn.disabled = false; }
    });

    root.append(form,
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('h2', { text: 'مشخصات سخت‌افزار' })),
        h('dl', { class: 'kv' },
          kv('نسخهٔ میان‌افزار', ltr(ST.firmware_version)),
          kv('زمان کارکرد', h('span', { dataset: { uptime: '1' }, text: T.uptime(ST.uptime_ms) })),
          kv('نشانی سخت‌افزاری', ltr(ST.mac)),
          kv('تراشه', ltr(ST.chip_model)),
          kv('بازبینی تراشه', ltr(ST.chip_revision)))),
      pform,
      h('div', { class: 'card', style: 'border-color:var(--danger)' },
        h('div', { class: 'card-h' }, h('div', null, h('h2', { text: 'عملیات حساس' }),
          h('p', { text: 'بازنشانی کارخانه همهٔ تنظیمات، کالیبراسیون ۶۴ کانال و رمز مدیر را پاک می‌کند.' }))),
        h('div', { class: 'actions', style: 'margin:0' },
          h('button', { class: 'btn', type: 'button', onclick: () => T.rebootFlow() }, icon('power'), 'راه‌اندازی مجدد'),
          h('button', { class: 'btn danger', type: 'button', onclick: factoryReset }, icon('warn'), 'بازنشانی کارخانه'))));
  }
  async function factoryReset() {
    const ok = await T.ask({
      title: 'بازنشانی کارخانه',
      body: 'تمام تنظیمات شبکه، قطبیت، کالیبراسیون همهٔ ۶۴ کانال و رمز عبور مدیر پاک می‌شود و دستگاه با مقادیر پیش‌فرض راه‌اندازی می‌شود. این کار برگشت‌پذیر نیست.',
      ok: 'پاک کردن و راه‌اندازی مجدد', danger: true, typeWord: 'بازنشانی',
    });
    if (!ok) return;
    T.rebootFlow({ skipAsk: true, call: T.api.factoryReset, note: 'پس از بازنشانی، نام و رمز شبکه به مقدار پیش‌فرض برمی‌گردد.' });
  }
  const ltr = (v) => h('span', { class: 'ltr', text: v == null || v === '' ? '—' : String(v) });
  const kv = (k, v) => h('div', null, h('dt', { text: k }), h('dd', null, v));

  /* ---------- Polarity ---------- */
  function wave(mode) {
    // active portion drawn in the middle third; label sits at the active level
    const hi = 10, lo = 34, act = mode === 'active_low' ? lo : hi, idle = act === lo ? hi : lo;
    return T.svg('svg', { class: 'wave', viewBox: '0 0 150 44', 'aria-hidden': 'true' },
      T.svg('path', { class: 'base', d: 'M0 ' + hi + 'H150M0 ' + lo + 'H150' }),
      T.svg('path', { d: 'M2 ' + idle + 'H50V' + act + 'H100V' + idle + 'H148' }),
      Object.assign(T.svg('text', { x: 75, y: act === lo ? 30 : 22, 'text-anchor': 'middle' }), { textContent: 'فعال' }));
  }
  const POL = [
    ['stations_global', 'ورودی فعال‌سازی ایستگاه‌ها', 'یک تنظیم برای هر ۱۶ ورودی؛ سطحی که نشان می‌دهد ایستگاه فعال شده است.'],
    ['alarm_output', 'خروجی آلارم', 'سطحی که خروجی آلارم فیزیکی مشترک هنگام فعال بودن می‌گیرد.'],
    ['reset_input', 'ورودی بازنشانی', 'سطحی که فشردن کلید بازنشانی مشترک را نشان می‌دهد.'],
  ];
  function polarity(root) {
    const cur = Object.assign({}, S.polarity);
    const isDirty = () => POL.some(([k]) => cur[k] !== S.polarity[k]);
    const bar = saveBar();
    const rows = POL.map(([k, title, desc]) => {
      const pic = h('span');
      const paint = () => T.clear(pic).append(wave(cur[k]));
      const opt = (v, label) => h('label', null,
        h('input', { type: 'radio', name: k, value: v, checked: cur[k] === v, onchange: () => { cur[k] = v; paint(); } }),
        h('span', { text: label }));
      paint();
      return h('div', { class: 'pol' },
        h('div', null, h('h3', { text: title }), h('p', { text: desc })),
        h('div', { class: 'pol-c' }, pic,
          h('div', { class: 'seg', role: 'radiogroup', 'aria-label': title },
            opt('active_low', 'فعال با سطح پایین'), opt('active_high', 'فعال با سطح بالا'))));
    });
    const form = h('form', { novalidate: true },
      h('div', { class: 'banner' }, icon('warn'),
        h('p', { text: 'تغییر قطبیت ورودی ایستگاه‌ها، وضعیت فعال‌سازی هر ۱۶ ایستگاه را بلافاصله معکوس می‌کند. فقط وقتی خط متوقف است تغییر دهید.' })),
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('div', null, h('h2', { text: 'قطبیت ورودی و خروجی' }),
          h('p', { text: 'پیش‌فرض برای هر سه: فعال با سطح پایین. قطبیت جداگانه برای هر ورودی پشتیبانی نمی‌شود.' }))),
        rows, bar.el));
    const upd = trackDirty(form, bar, isDirty);
    bar.reset.addEventListener('click', () => { T.clear(root); polarity(root); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changed = POL.filter(([k]) => cur[k] !== S.polarity[k]).map(([, t]) => t);
      const go = await T.ask({ title: 'ذخیرهٔ قطبیت', body: 'قطبیت این موارد تغییر می‌کند: ' + changed.join('، ') + '. آیا خط متوقف است؟', ok: 'بله، ذخیره کن' });
      if (!go) return;
      if (await save({ polarity: Object.assign({}, cur) }, bar.save)) { T.clear(root); polarity(root); } else upd();
    });
    root.append(form);
  }

  /* ---------- About ---------- */
  function about(root) {
    let built = ST.build_date || '';
    try {
      const d = new Date(ST.build_date + 'T00:00:00');
      if (!isNaN(d)) built = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long' }).format(d);
    } catch (e) { built = T.faDigits(built); }
    root.append(
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('h2', { text: 'نرم‌افزار' })),
        h('dl', { class: 'kv' },
          kv('نسخهٔ میان‌افزار', ltr(ST.firmware_version)),
          kv('تاریخ ساخت', built || '—'),
          kv('نسخهٔ قرارداد پروتکل', ltr(ST.protocol_version)),
          kv('نسخهٔ رابط محلی', ltr(ST.web_ui_version)))),
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('h2', { text: 'کارکرد' })),
        h('dl', { class: 'kv' },
          kv('کل چرخه‌های ثبت‌شده', num(ST.total_cycles)),
          kv('آخرین راه‌اندازی', h('span', { dataset: { ago: '1' }, text: T.ago(ST.uptime_ms) })),
          kv('علت آخرین راه‌اندازی', T.RESET_REASON[ST.reset_reason] || T.RESET_REASON.unknown),
          kv('زمان کارکرد', h('span', { dataset: { uptime: '1' }, text: T.uptime(ST.uptime_ms) })))),
      h('p', { class: 'small muted', style: 'margin-block-start:12px', text: 'دستگاه ساعت واقعی ندارد؛ زمان آخرین راه‌اندازی بر اساس زمان کارکرد محاسبه می‌شود. سوابق و گزارش‌ها در کنسول رایانه نگهداری می‌شوند.' }));
  }

  /* ---------- tab routing (#/settings/<tab>) ---------- */
  const VIEWS = { network, system, polarity, about };
  let current = 'network', gen = 0;
  const tabOf = (sub) => (TABS.includes(sub) ? sub : 'network');
  async function route(sub) {
    const tab = tabOf(sub);
    if (!S) { T.subnav($('#subnav-set'), tab); return; } // still loading; init() renders the tab in the hash
    if (tab === current && $('#panel').firstChild && $('#panel').dataset.tab === tab) return;
    if (dirty() && !(await T.ask({ title: 'تغییرات ذخیره نشده', body: 'تغییرات این بخش ذخیره نشده است. رها شود؟', ok: 'رها کن', danger: true }))) {
      T.replaceHash('#/settings/' + current);
      return;
    }
    dirty = () => false;
    current = tab;
    if (sub !== tab) T.replaceHash('#/settings/' + tab);
    T.subnav($('#subnav-set'), tab);
    const p = T.clear($('#panel'));
    p.dataset.tab = tab;
    VIEWS[tab](p);
  }

  function mount(sub, scope) {
    const my = ++gen;
    S = null; ST = null; dirty = () => false; current = tabOf(sub);
    T.subnav($('#subnav-set'), current);
    $('#reboot-banner').hidden = true;
    showRebootBanner();
    delete $('#panel').dataset.tab;
    scope.every(() => {
      if (!ST) return;
      const up = ST.uptime_ms + (Date.now() - stAt);
      T.$$('#panel [data-uptime]').forEach((el) => { el.textContent = T.uptime(up); });
      T.$$('#panel [data-ago]').forEach((el) => { el.textContent = T.ago(up); });
    }, 1000);
    scope.add(() => { gen++; dirty = () => false; });
    async function init() {
      T.clear($('#panel')).append(h('div', { class: 'card' }, h('div', { class: 'spin' })));
      try {
        const [s, st] = await Promise.all([T.api.settings(), T.api.status()]);
        if (my !== gen) return;
        S = s; ST = st;
        stAt = Date.now();
        route(T.parseHash().sub);
      } catch (e) {
        if (my !== gen || e.status === 401 || e.status === 403) return;
        T.clear($('#panel')).append(h('div', { class: 'banner danger' }, icon('warn'), h('p', { text: T.errMsg(e) }),
          h('button', { class: 'btn sm', type: 'button', text: 'تلاش دوباره', onclick: init })));
      }
    }
    init();
  }

  T.views.settings = { mount, sub: route, dirty: () => dirty() };
})();
