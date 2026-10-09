/* تافنینگ — ویرایشگر کالیبراسیون ۶۴ کانال (DR-27, DR-30, DR-43)
   Bulk table (filter/search) + single-channel editor + copy-to-channels.
   The UI never invents calibration values: new points start empty, and
   unconfigured channels are always shown as «پیکربندی نشده».
   View: #/calibration, #/calibration/<channel_id> opens that channel's editor.
   The editor's live voltage comes from the shared T.live feed (WebSocket
   /ws, HTTP polling fallback) and is subscribed only while a channel is open. */
'use strict';
(function () {
  const { h, $, num, icon } = T, CM = T.calMath;
  let chans = [], names = {}, live = null, selId = null, draft = null, edRefs = null;
  let filter = { q: '', kind: 'all' };
  const byId = (id) => chans.find((c) => c.channel_id === id);
  const isNarrow = () => matchMedia('(max-width: 1180px)').matches;
  const DEF_WIN = [0, 5];

  /* ---------- helpers ---------- */
  const norm = (c) => ({
    mode: c.mode || null,
    points: c.mode ? (c.points || []).map((p) => ({ voltage: +p.voltage, value: +p.value })) : [],
    valid_window: (c.valid_window || DEF_WIN).map(Number),
  });
  const stationLabel = (id) => 'ایستگاه ' + num(id) + (names[id] ? ' · ' + names[id] : '');
  const chTitle = (c) => T.QTY[c.quantity] + ' · ' + stationLabel(c.station_id) + ' · نازل ' + T.NOZZLE[c.nozzle_id];
  const winText = (w) => num(w[0], w[0] % 1 ? 2 : 0) + ' تا ' + num(w[1], w[1] % 1 ? 2 : 0) + ' ولت';
  const isDefWin = (w) => !w || (+w[0] === 0 && +w[1] === 5);
  const latin = (s) => String(s).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632)
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();

  function liveVoltage(c) {
    if (!live || !c) return null;
    const st = (live.stations || []).find((s) => s.station_id === c.station_id);
    const nz = st && (st.nozzles || []).find((n) => n.nozzle_id === c.nozzle_id);
    if (!nz) return null;
    return nz[c.quantity === 'pressure' ? 'raw_pressure_voltage' : 'raw_temperature_voltage'];
  }

  /* ---------- summary + toolbar ---------- */
  function renderSummary() {
    const conf = chans.filter((c) => c.mode).length;
    const lin = chans.filter((c) => c.mode === 'linear').length;
    const box = T.clear($('#sum'));
    const card = (n, label, cls, kind) => h('button', {
      class: 'sum' + (cls ? ' ' + cls : ''), type: 'button',
      onclick: () => { filter.kind = kind; syncFilterUI(); renderTable(); },
    }, h('b', { text: num(n) }), h('span', { text: label }));
    box.append(
      card(conf, 'پیکربندی‌شده از ' + num(chans.length), '', 'all'),
      card(lin, 'خطی (۲ نقطه)', '', 'all'),
      card(conf - lin, 'غیرخطی (۵ نقطه)', '', 'all'),
      card(chans.length - conf, 'پیکربندی نشده', 'un', 'unconfigured'));
  }
  const KINDS = [['all', 'همه'], ['pressure', 'فشار'], ['temperature', 'دما'], ['unconfigured', 'پیکربندی نشده']];
  let countEl, searchEl;
  function buildToolbar() {
    searchEl = h('input', {
      class: 'input', type: 'search', placeholder: 'جست‌وجو: شمارهٔ کانال یا ایستگاه، نام، فشار، دما…',
      'aria-label': 'جست‌وجوی کانال', oninput: () => { filter.q = searchEl.value; renderTable(); },
    });
    countEl = h('span', { class: 'muted small' });
    $('#toolbar').append(
      h('div', { class: 'search' }, icon('search'), searchEl),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'پالایش کانال‌ها' },
        KINDS.map(([k, l]) => h('label', null,
          h('input', { type: 'radio', name: 'kind', value: k, checked: filter.kind === k, onchange: () => { filter.kind = k; renderTable(); } }),
          h('span', { text: l })))),
      countEl);
  }
  function syncFilterUI() { T.$$('input[name=kind]').forEach((r) => { r.checked = r.value === filter.kind; }); }

  function matches(c) {
    if (filter.kind === 'pressure' && c.quantity !== 'pressure') return false;
    if (filter.kind === 'temperature' && c.quantity !== 'temperature') return false;
    if (filter.kind === 'unconfigured' && c.mode) return false;
    const q = latin(filter.q);
    if (!q) return true;
    if (/^\d+$/.test(q)) return c.channel_id === +q || c.station_id === +q;
    const hay = [T.QTY[c.quantity], 'نازل ' + T.NOZZLE[c.nozzle_id], names[c.station_id] || '', c.mode ? T.MODE[c.mode] : 'پیکربندی نشده'].join(' ');
    return q.split(/\s+/).every((t) => hay.indexOf(t) >= 0);
  }

  /* ---------- table ---------- */
  function renderTable(flashIds) {
    const rows = chans.filter(matches);
    countEl.textContent = num(rows.length) + ' کانال';
    const wrap = T.clear($('#tblwrap'));
    if (!rows.length) { wrap.append(h('div', { class: 'empty', text: 'کانالی با این مشخصات پیدا نشد.' })); return; }
    const tb = h('tbody');
    rows.forEach((c) => {
      const tr = h('tr', {
        tabindex: '0', 'aria-selected': c.channel_id === selId ? 'true' : 'false',
        dataset: { id: String(c.channel_id), alt: String(c.station_id % 2), un: c.mode ? '0' : '1' },
        class: flashIds && flashIds.includes(c.channel_id) ? 'flash' : null,
        onclick: () => select(c.channel_id),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(c.channel_id); } },
      },
        h('td', null, h('b', { text: num(c.channel_id) })),
        h('td', { text: stationLabel(c.station_id) }),
        h('td', { text: T.NOZZLE[c.nozzle_id] }),
        h('td', null, h('span', { class: 'q' + (c.quantity === 'temperature' ? ' t' : '') }, h('i'), T.QTY[c.quantity])),
        h('td', { class: 'mode' }, c.mode ? h('span', { class: 'badge ok', text: T.MODE[c.mode] }) : h('span', { class: 'badge un', text: 'پیکربندی نشده' })),
        h('td', { class: 'hide-s', text: c.mode ? num((c.points || []).length) : '—' }),
        h('td', { class: 'hide-s' }, c.mode ? h('span', { class: isDefWin(c.valid_window) ? 'muted' : null, text: winText(c.valid_window || DEF_WIN) }) : '—'));
      tb.append(tr);
    });
    wrap.append(h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['کانال', 'ایستگاه', 'نازل', 'کمیت', 'حالت'].map((t) => h('th', { scope: 'col', text: t })),
        h('th', { scope: 'col', class: 'hide-s', text: 'نقاط' }), h('th', { scope: 'col', class: 'hide-s', text: 'پنجرهٔ معتبر' }))),
      tb));
    if (flashIds) setTimeout(() => T.$$('tr.flash').forEach((r) => r.classList.remove('flash')), 1600);
  }

  /* ---------- editor ---------- */
  function draftFrom(c) {
    const n = norm(c);
    return {
      mode: n.mode,
      points: n.points.map((p) => ({ v: T.numT(p.voltage), y: T.numT(p.value) })),
      win: n.valid_window.map((x) => T.numT(x)),
    };
  }
  function parsed() {
    return {
      mode: draft.mode,
      points: draft.mode ? draft.points.map((p) => ({ voltage: T.parseNum(p.v), value: T.parseNum(p.y) })) : [],
      valid_window: draft.win.map(T.parseNum),
    };
  }
  const isDirty = () => !!draft && !!byId(selId) && JSON.stringify(parsed()) !== JSON.stringify(norm(byId(selId)));

  async function select(id, force) {
    if (id === selId && !force) return;
    if (!force && isDirty() && !(await T.ask({ title: 'تغییرات ذخیره نشده', body: 'تغییرات کانال ' + num(selId) + ' ذخیره نشده است. رها شود؟', ok: 'رها کن', danger: true }))) {
      T.replaceHash(hashFor(selId));
      return;
    }
    selId = id;
    draft = id ? draftFrom(byId(id)) : null;
    T.replaceHash(hashFor(id));
    T.$$('#tblwrap tr[data-id]').forEach((r) => r.setAttribute('aria-selected', r.dataset.id === String(id) ? 'true' : 'false'));
    renderEditor();
    liveOn(!!id);
  }
  const hashFor = (id) => '#/calibration' + (id ? '/' + id : '');

  function setMode(m) {
    const old = draft.points, n = CM.count(m);
    const blank = () => ({ v: '', y: '' });
    let pts = [];
    if (n) {
      // keep the outer points when switching 2 ↔ 5; middle points start empty
      pts = Array.from({ length: n }, blank);
      if (old.length) { pts[0] = old[0]; pts[n - 1] = old[old.length - 1]; }
    }
    draft.mode = m;
    draft.points = pts;
    renderEditor();
    const r = T.$('#editor input[name=mode]:checked');
    if (r) r.focus();
  }

  function renderEditor() {
    const ed = T.clear($('#editor'));
    ed.classList.toggle('open', !!selId);
    document.body.classList.toggle('ed-open', !!selId && isNarrow());
    if (!selId) {
      ed.append(h('div', { class: 'empty' }, h('h2', { text: 'یک کانال را انتخاب کنید' }),
        h('p', { text: 'روی هر ردیف جدول بزنید تا نقاط کالیبراسیون، پنجرهٔ ولتاژ معتبر و پیش‌نمایش نگاشت آن نمایش داده شود.' })));
      edRefs = null;
      return;
    }
    const c = byId(selId), unit = T.UNIT_LONG[c.quantity];
    const R = (edRefs = { rows: [] });
    R.badge = h('span', { class: 'badge' });
    R.liveV = h('b', { text: '—' });
    R.liveOut = h('span', { class: 'muted' });
    R.chart = T.calChart(unit);

    const modeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'حالت تبدیل' },
      [[null, 'پیکربندی نشده'], ['linear', 'خطی · ۲ نقطه'], ['nonlinear', 'غیرخطی · ۵ نقطه']].map(([m, l]) => h('label', null,
        h('input', { type: 'radio', name: 'mode', value: m || '', checked: draft.mode === m, onchange: () => setMode(m) }),
        h('span', { text: l }))));

    let ptsBox;
    if (draft.mode) {
      const tb = h('tbody');
      draft.points.forEach((p, i) => {
        const vi = h('input', { class: 'input ltr', value: p.v, inputmode: 'decimal', 'aria-label': 'ولتاژ نقطهٔ ' + num(i + 1), placeholder: 'ولت', oninput: () => { p.v = vi.value; refresh(); } });
        const yi = h('input', { class: 'input ltr', value: p.y, inputmode: 'decimal', 'aria-label': 'مقدار نقطهٔ ' + num(i + 1), placeholder: T.UNIT[c.quantity], oninput: () => { p.y = yi.value; refresh(); } });
        const take = h('button', {
          class: 'ib', type: 'button', title: 'ثبت ولتاژ زندهٔ فعلی برای این نقطه', 'aria-label': 'ثبت ولتاژ زنده برای نقطهٔ ' + num(i + 1),
          onclick: () => { const lv = liveVoltage(c); if (lv == null) { T.toast('ولتاژ زنده در دسترس نیست.', 'bad'); return; } vi.value = p.v = T.numT(lv, 3); refresh(); yi.focus(); },
        }, icon('take'));
        R.rows.push({ vi, yi });
        tb.append(h('tr', null, h('td', { text: num(i + 1) }), h('td', null, vi), h('td', null, yi), h('td', null, take)));
      });
      ptsBox = h('div', { class: 'sect' },
        h('div', { class: 'lbl', text: 'نقاط کالیبراسیون (ولتاژ صعودی)' }),
        h('table', { class: 'pts' }, h('thead', null, h('tr', null, h('th', { text: '#' }), h('th', { text: 'ولتاژ (ولت)' }), h('th', { text: 'مقدار (' + unit + ')' }), h('th'))), tb));
    } else {
      ptsBox = h('div', { class: 'sect banner info' }, icon('info'),
        h('p', { text: 'این کانال پیکربندی نشده است و مقدار تبدیل‌شده تولید نمی‌کند. برای شروع، حالت خطی یا غیرخطی را انتخاب و نقاط اندازه‌گیری‌شده را وارد کنید.' }));
    }

    R.w0 = h('input', { class: 'input ltr', value: draft.win[0], inputmode: 'decimal', 'aria-label': 'کمینهٔ ولتاژ معتبر', oninput: () => { draft.win[0] = R.w0.value; refresh(); } });
    R.w1 = h('input', { class: 'input ltr', value: draft.win[1], inputmode: 'decimal', 'aria-label': 'بیشینهٔ ولتاژ معتبر', oninput: () => { draft.win[1] = R.w1.value; refresh(); } });
    R.errs = h('div');
    R.probeIn = h('input', { class: 'input ltr', inputmode: 'decimal', placeholder: 'ولت', 'aria-label': 'ولتاژ آزمون', oninput: refresh });
    R.probeOut = h('output', { text: '—' });
    R.save = h('button', { class: 'btn primary', type: 'button', text: 'ذخیره', onclick: saveChannel });
    R.cancel = h('button', { class: 'btn ghost', type: 'button', text: 'لغو', onclick: () => { draft = draftFrom(byId(selId)); renderEditor(); } });
    R.copy = h('button', { class: 'btn', type: 'button', onclick: openCopy }, icon('copy'), 'کپی به کانال‌های دیگر…');
    R.hint = h('p', { class: 'small muted', style: 'margin-block-start:8px' });

    ed.append(
      h('div', { class: 'card-h' },
        h('div', null, h('h2', null, 'کانال ' + num(c.channel_id) + ' ', R.badge), h('p', { class: 'ed-sub', text: chTitle(c) })),
        h('button', { class: 'btn ghost sm ed-close', type: 'button', 'aria-label': 'بستن ویرایشگر', onclick: () => select(null) }, icon('x'), 'بستن')),
      h('div', { class: 'live' }, h('i', { class: 'dot' }), 'ولتاژ زنده', R.liveV, R.liveOut),
      h('div', { class: 'lbl', text: 'حالت تبدیل' }), modeSeg,
      ptsBox,
      h('div', { class: 'sect' },
        h('div', { class: 'lbl' }, 'پنجرهٔ ولتاژ معتبر', h('span', { class: 'badge', text: 'اختیاری · پیش‌فرض ۰ تا ۵' })),
        h('div', { class: 'win' },
          h('label', { class: 'field' }, h('span', { text: 'از (ولت)' }), R.w0),
          h('label', { class: 'field' }, h('span', { text: 'تا (ولت)' }), R.w1))),
      R.errs,
      h('div', { class: 'sect' }, h('div', { class: 'lbl', text: 'پیش‌نمایش نگاشت' }), R.chart.el,
        h('div', { class: 'probe' }, h('span', { text: 'ولتاژ آزمون' }), R.probeIn, h('span', { text: '←' }), R.probeOut)),
      h('div', { class: 'actions' }, R.save, R.cancel, h('span', { class: 'grow' }), R.copy),
      R.hint);
    refresh();
  }

  function convText(c, cal, v) {
    const r = CM.convert(cal, v);
    if (r.state === 'valid') return num(r.value, c.quantity === 'pressure' ? 3 : 2) + ' ' + T.UNIT_LONG[c.quantity];
    if (r.state === 'invalid') return 'نقاط نامعتبر';
    return T.CH_STATE[r.state];
  }

  function refresh() {
    if (!edRefs || !selId) return;
    const R = edRefs, c = byId(selId), cal = parsed(), errs = CM.validate(cal), dirty = isDirty();
    // inline field state
    R.rows.forEach((r, i) => {
      r.vi.setAttribute('aria-invalid', errs.some((e) => e.row === i && e.field === 'voltage') ? 'true' : 'false');
      r.yi.setAttribute('aria-invalid', errs.some((e) => e.row === i && e.field === 'value') ? 'true' : 'false');
    });
    const wBad = errs.some((e) => e.field === 'window');
    R.w0.setAttribute('aria-invalid', wBad ? 'true' : 'false');
    R.w1.setAttribute('aria-invalid', wBad ? 'true' : 'false');
    T.clear(R.errs);
    if (errs.length) R.errs.append(h('ul', { class: 'errs' }, errs.map((e) => h('li', { text: e.msg }))));
    else if (cal.mode) R.errs.append(h('p', { class: 'okmsg' }, icon('check'), 'نقاط معتبرند: متناهی، متمایز و صعودی.'));
    // badge
    R.badge.className = 'badge ' + (dirty ? 'prop' : c.mode ? 'ok' : 'un');
    R.badge.textContent = dirty ? 'ذخیره نشده' : c.mode ? T.MODE[c.mode] : 'پیکربندی نشده';
    // live
    const lv = liveVoltage(c);
    R.liveV.textContent = lv == null ? 'بدون داده' : num(lv, 3) + ' ولت';
    R.liveOut.textContent = lv == null ? '' : '← ' + convText(c, cal, lv);
    // chart + probe
    R.chart.update(cal, lv);
    const pv = T.parseNum(R.probeIn.value);
    R.probeOut.textContent = R.probeIn.value.trim() === '' ? '—' : isNaN(pv) ? 'عدد نامعتبر' : convText(c, cal, pv);
    // actions
    R.save.disabled = !dirty || (cal.mode && errs.length > 0) || (!cal.mode && wBad);
    R.cancel.disabled = !dirty;
    const canCopy = !dirty && !!c.mode;
    R.copy.disabled = !canCopy;
    R.hint.textContent = dirty ? 'برای کپی به کانال‌های دیگر، ابتدا تغییرات را ذخیره کنید.' : !c.mode ? 'کانال پیکربندی‌نشده قابل کپی نیست.' : '';
  }

  async function saveChannel() {
    const cal = parsed();
    if (!cal.mode) {
      const ok = await T.ask({ title: 'حذف کالیبراسیون', body: 'کالیبراسیون کانال ' + num(selId) + ' پاک می‌شود و این کانال تا پیکربندی دوباره مقداری تولید نمی‌کند.', ok: 'پاک کن', danger: true });
      if (!ok) return;
    }
    const item = Object.assign({ channel_id: selId }, cal);
    edRefs.save.disabled = true;
    edRefs.save.textContent = 'در حال ذخیره…';
    try {
      const r = await T.api.saveSettings({ calibration: { channels: [item] } });
      applyChannels(r, [item]);
      draft = draftFrom(byId(selId));
      T.toast('کالیبراسیون کانال ' + num(selId) + ' ذخیره شد.', 'ok');
      renderSummary(); renderTable([selId]); renderEditor();
    } catch (e) {
      const det = (e.data && e.data.details) || [];
      T.toast(det.length ? det.map((d) => T.FIELD_MSG[d.code] || 'مقدار نامعتبر است.').join(' ') : T.errMsg(e), 'bad');
      edRefs.save.textContent = 'ذخیره';
      refresh();
    }
  }
  function applyChannels(resp, items) {
    if (resp && resp.settings && resp.settings.calibration) { chans = resp.settings.calibration.channels; return; }
    items.forEach((it) => Object.assign(byId(it.channel_id), it));
  }

  /* ---------- copy dialog (DR-43) ---------- */
  function openCopy() {
    const src = byId(selId), cal = norm(src);
    if (CM.validate(cal).length) { T.toast('کالیبراسیون مبدأ معتبر نیست.', 'bad'); return; }
    const boxes = [];
    const COLS = [[1, 'pressure'], [1, 'temperature'], [2, 'pressure'], [2, 'temperature']];
    const tb = h('tbody');
    for (let s = 1; s <= 16; s++) {
      tb.append(h('tr', null, h('th', { scope: 'row', text: stationLabel(s) }),
        COLS.map(([nz, q]) => {
          const c = chans.find((x) => x.station_id === s && x.nozzle_id === nz && x.quantity === q);
          if (!c) return h('td');
          const isSrc = c.channel_id === src.channel_id, other = q !== src.quantity;
          const cb = h('input', {
            type: 'checkbox', value: String(c.channel_id), disabled: isSrc || other, class: isSrc ? 'src' : null,
            'aria-label': 'کانال ' + num(c.channel_id) + ' · ' + chTitle(c), onchange: count,
          });
          if (!isSrc && !other) boxes.push({ cb, c });
          return h('td', null, h('label', { title: isSrc ? 'کانال مبدأ' : other ? 'کمیت متفاوت؛ قابل کپی نیست' : chTitle(c) },
            cb, h('span', { text: isSrc ? 'مبدأ' : num(c.channel_id) })));
        })));
    }
    const info = h('p', { class: 'small muted' });
    const go = h('button', { class: 'btn primary', type: 'submit', disabled: true });
    function count() {
      const sel = boxes.filter((b) => b.cb.checked), over = sel.filter((b) => b.c.mode).length;
      go.disabled = !sel.length;
      go.textContent = sel.length ? 'کپی به ' + num(sel.length) + ' کانال' : 'کانالی انتخاب نشده';
      info.textContent = sel.length
        ? num(sel.length) + ' کانال انتخاب شد' + (over ? '؛ کالیبراسیون فعلی ' + num(over) + ' کانال بازنویسی می‌شود.' : '.')
        : 'کانال‌های مقصد را از جدول زیر انتخاب کنید. فقط کانال‌های ' + T.QTY[src.quantity] + ' قابل انتخاب‌اند.';
    }
    const pick = (fn) => { boxes.forEach((b) => { b.cb.checked = fn(b.c); }); count(); };
    const form = h('form', { method: 'dialog', class: 'dlg-b' },
      h('h2', { text: 'کپی کالیبراسیون کانال ' + num(src.channel_id) }),
      h('p', { text: T.MODE[src.mode] + ' · ' + num(src.points.length) + ' نقطه · پنجرهٔ ' + winText(cal.valid_window) + '. پس از کپی، دستگاه نقاط هر کانال را دوباره اعتبارسنجی می‌کند.' }),
      h('div', { class: 'actions', style: 'margin-block-start:12px' },
        h('button', { class: 'btn sm', type: 'button', text: 'همهٔ کانال‌های ' + T.QTY[src.quantity], onclick: () => pick(() => true) }),
        h('button', { class: 'btn sm', type: 'button', text: 'فقط پیکربندی‌نشده‌ها', onclick: () => pick((c) => !c.mode) }),
        h('button', { class: 'btn sm', type: 'button', text: 'همین نازل در همهٔ ایستگاه‌ها', onclick: () => pick((c) => c.nozzle_id === src.nozzle_id) }),
        h('button', { class: 'btn sm ghost', type: 'button', text: 'هیچ', onclick: () => pick(() => false) })),
      h('div', { class: 'mx-wrap' }, h('table', { class: 'mx' },
        h('thead', null, h('tr', null, h('th'), ['فشار بالا', 'دما بالا', 'فشار پایین', 'دما پایین'].map((t) => h('th', { scope: 'col', text: t })))), tb)),
      info,
      h('div', { class: 'actions' }, go, h('button', { class: 'btn ghost', type: 'button', text: 'انصراف', onclick: () => close() })));
    const dlg = h('dialog', { class: 'wide' }, form);
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targets = boxes.filter((b) => b.cb.checked).map((b) => b.c.channel_id);
      go.disabled = true; go.textContent = 'در حال کپی…';
      try {
        const r = await T.api.copyCalibration({ source_channel: src.channel_id, targets, mode: cal.mode, points: cal.points, valid_window: cal.valid_window });
        const res = (r && r.results) || targets.map((id) => ({ channel_id: id, ok: true }));
        const okIds = res.filter((x) => x.ok).map((x) => x.channel_id), bad = res.filter((x) => !x.ok);
        if (r && r.settings) applyChannels(r, []);
        else okIds.forEach((id) => Object.assign(byId(id), { mode: cal.mode, points: cal.points.map((p) => Object.assign({}, p)), valid_window: cal.valid_window.slice() }));
        close();
        renderSummary(); renderTable(okIds);
        if (bad.length) T.toast('کپی برای کانال‌های ' + bad.map((b) => num(b.channel_id)).join('، ') + ' رد شد: ' + (T.FIELD_MSG[bad[0].error] || 'نامعتبر'), 'bad');
        else T.toast('کالیبراسیون به ' + num(okIds.length) + ' کانال کپی و اعتبارسنجی شد.', 'ok');
      } catch (ex) {
        T.toast(T.errMsg(ex), 'bad');
        count();
      }
    });
    document.body.append(dlg);
    count();
    dlg.showModal();
  }

  /* ---------- live voltage (only while a channel is open) ---------- */
  let liveOff = null;
  function liveOn(on) {
    if (on && !liveOff) {
      liveOff = T.live.subscribe({
        data: (d) => { live = d; refresh(); },
        error: () => { live = null; refresh(); },
      });
    } else if (!on && liveOff) { liveOff(); liveOff = null; }
  }

  // #/calibration/<id> changed by the user (address bar, back/forward)
  function sub(s) {
    if (!chans.length) return;
    const id = /^\d+$/.test(s) ? +s : null;
    if (id && byId(id) && id !== selId) select(id);
    else if (!s && selId) select(null);
  }

  /* ---------- mount ---------- */
  let gen = 0;
  function mount(s, scope) {
    const my = ++gen;
    chans = []; names = {}; live = null; selId = null; draft = null; edRefs = null;
    filter = { q: '', kind: 'all' };
    T.subnav($('#subnav-cal'), 'calibration');
    T.clear($('#sum'));
    T.clear($('#toolbar'));
    T.clear($('#editor')).classList.remove('open');
    T.clear($('#tblwrap')).append(h('div', { class: 'empty' }, h('div', { class: 'spin' }), 'در حال دریافت تنظیمات کالیبراسیون…'));
    buildToolbar();
    const mq = matchMedia('(max-width: 1180px)');
    const onMq = () => document.body.classList.toggle('ed-open', !!selId && isNarrow());
    if (mq.addEventListener) scope.on(mq, 'change', onMq);
    scope.add(() => { gen++; liveOn(false); document.body.classList.remove('ed-open'); selId = null; draft = null; });
    (async function init() {
      try {
        const [st, ss] = await Promise.all([T.api.settings(), T.api.state().catch(() => null)]);
        if (my !== gen) return;
        chans = (st.calibration && st.calibration.channels) || [];
        live = ss;
        ((ss && ss.stations) || []).forEach((x) => { if (x.name) names[x.station_id] = x.name; });
      } catch (e) {
        if (my !== gen || e.status === 401 || e.status === 403) return;
        T.clear($('#tblwrap')).append(h('div', { class: 'empty' }, T.errMsg(e)));
        return;
      }
      renderSummary();
      renderTable();
      const cur = T.parseHash().sub;
      if (/^\d+$/.test(cur) && byId(+cur)) select(+cur, true);
      else { if (cur) T.replaceHash('#/calibration'); renderEditor(); }
    })();
  }

  T.views.calibration = { mount, sub, dirty: isDirty };
})();
