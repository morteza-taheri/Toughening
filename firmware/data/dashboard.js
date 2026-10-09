/* تافنینگ — داشبورد (view: #/dashboard)
   Live data arrives as WebSocket push from ws://<host>/ws ({type:"state"}
   every 1 s) through the shared T.live feed in app.js. If the socket can't be
   opened or goes quiet, T.live falls back to sequential GET /api/state polling
   at 1 Hz and keeps retrying the socket. DOM is built once per mount; each
   message only updates textContent / data-attributes. */
'use strict';
(function () {
  const { h, $, num, icon } = T;
  const STALE_AFTER = 3;
  const TRANSPORT = { ws: 'دریافت پیوسته از وب‌سوکت', http: 'دریافت با درخواست دوره‌ای (پشتیبان)', off: '' };

  function mount(sub, scope) {
    $('#stale').hidden = true;
    $('#grid').classList.remove('stale');

    /* ---------- status bar ---------- */
    const sb = {};
    function chip(key, ic, label) {
      const v = h('b', { class: 'v', text: '—' });
      const el = h('div', { class: 'chip' }, ic, h('span', { class: 'k', text: label }), v);
      sb[key] = { el, v };
      return el;
    }
    const bars = h('span', { class: 'bars', 'data-l': '0', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
    const beat = h('span', { class: 'beat', 'aria-hidden': 'true' });
    T.clear($('#sbar')).append(
      chip('rssi', bars, 'سیگنال وای‌فای'),
      chip('up', icon('clock'), 'زمان کارکرد'),
      chip('heap', icon('chip'), 'حافظهٔ آزاد'),
      chip('cyc', icon('cycle'), 'شمار چرخه‌ها'),
      chip('ws', icon('pc'), 'اتصال به رایانه'),
      chip('live', beat, 'داده'));

    /* ---------- legend ---------- */
    const lg = {};
    const LEG = [
      ['running', 'var(--st-run)'], ['stabilising', 'var(--st-stab)'], ['post_cycle', 'var(--st-post)'],
      ['idle', 'var(--st-idle)'], ['fault', 'var(--st-fault)'],
    ];
    T.clear($('#legend'));
    LEG.forEach(([k, c]) => {
      lg[k] = h('b', { text: '۰' });
      $('#legend').append(h('span', null, h('i', { class: 'dot', style: '--c:' + c }), T.STATION_STATE[k], lg[k]));
    });
    lg.oor = h('b', { text: '۰' });
    lg.un = h('b', { text: '۰' });
    $('#legend').append(
      h('span', null, h('i', { class: 'dot', style: '--c:var(--warn)' }), 'کانال خارج از محدوده', lg.oor),
      h('span', null, h('i', { class: 'dot', style: '--c:var(--unconf)' }), 'کانال پیکربندی نشده', lg.un));

    /* ---------- tiles ---------- */
    const tiles = [];
    function channelCell(qty) {
      const v = h('b', { text: '—' }), u = h('small'), r = h('div', { class: 'ch-r', text: '\u00a0' });
      const el = h('div', { class: 'ch', dataset: { s: 'none' } },
        h('div', { class: 'ch-k' }, T.QTY[qty], h('i', { class: 'dot' })),
        h('div', { class: 'ch-v' }, v, u), r);
      return { el, v, u, r, qty };
    }
    function buildTile(i) {
      const t = { no: h('div', { class: 'tile-no', text: num(i) }), name: h('b'), sub: h('span') };
      t.pill = h('span', { class: 'pill', text: '…' });
      t.actTxt = h('span', { text: '—' });
      t.act = h('span', { class: 'act', dataset: { on: 'false' } }, h('i', { class: 'dot' }), t.actTxt);
      t.cyc = h('b', { text: '—' });
      t.nz = [1, 2].map((n) => ({ p: channelCell('pressure'), t: channelCell('temperature'), n }));
      t.el = h('article', { class: 'tile', dataset: { state: 'idle' } },
        h('div', { class: 'tile-h' }, t.no, h('div', { class: 'tile-t' }, t.name, t.sub), t.pill),
        h('div', { class: 'tile-m' }, t.act, h('span', null, 'چرخه', t.cyc)),
        t.nz.map((z) => h('div', { class: 'nz' },
          h('div', { class: 'nz-l' }, h('i', { text: z.n === 1 ? '▲' : '▼' }), T.NOZZLE[z.n]),
          z.p.el, z.t.el)));
      t.name.textContent = 'ایستگاه ' + num(i);
      return t;
    }
    T.clear($('#grid'));
    for (let i = 1; i <= 16; i++) { const t = buildTile(i); tiles.push(t); $('#grid').append(t.el); }

    const set = (el, txt) => { if (el.textContent !== txt) el.textContent = txt; };
    const setData = (el, k, v) => { if (el.dataset[k] !== v) el.dataset[k] = v; };

    function renderChannel(c, nozzle) {
      const p = c.qty === 'pressure';
      const st = nozzle ? nozzle[p ? 'pressure_state' : 'temperature_state'] : null;
      const val = nozzle ? nozzle[p ? 'converted_pressure' : 'converted_temperature'] : null;
      const raw = nozzle ? nozzle[p ? 'raw_pressure_voltage' : 'raw_temperature_voltage'] : null;
      const s = T.CH_STATE[st] ? st : 'none';
      setData(c.el, 's', s);
      if (s === 'valid' && val != null) { set(c.v, num(val, p ? 2 : 1)); set(c.u, T.UNIT[c.qty]); }
      else { set(c.v, s === 'none' ? '—' : T.CH_STATE[s]); set(c.u, ''); }
      set(c.r, raw != null ? 'ولتاژ ' + num(raw, 3) : '\u00a0');
      c.el.title = T.QTY[c.qty] + ': ' + (T.CH_STATE[s] || 'بدون داده');
    }

    function render(d) {
      const counts = { idle: 0, stabilising: 0, running: 0, post_cycle: 0, fault: 0 };
      let oor = 0, un = 0;
      (d.stations || []).forEach((s) => {
        const t = tiles[s.station_id - 1];
        if (!t) return;
        const state = T.STATION_STATE[s.state] ? s.state : 'idle';
        counts[state]++;
        setData(t.el, 'state', state);
        set(t.pill, T.STATION_STATE[state]);
        if (s.name) { set(t.name, s.name); set(t.sub, 'ایستگاه ' + num(s.station_id)); }
        else { set(t.name, 'ایستگاه ' + num(s.station_id)); set(t.sub, ''); }
        setData(t.act, 'on', s.activation ? 'true' : 'false');
        set(t.actTxt, s.activation ? 'ورودی فعال' : 'ورودی غیرفعال');
        const inCycle = state === 'running' || state === 'stabilising' || state === 'post_cycle';
        set(t.cyc, inCycle && s.cycle_number != null ? num(s.cycle_number) : '—');
        t.nz.forEach((z) => {
          const n = (s.nozzles || []).find((x) => x.nozzle_id === z.n);
          renderChannel(z.p, n); renderChannel(z.t, n);
          if (n) {
            [n.pressure_state, n.temperature_state].forEach((x) => { if (x === 'out_of_range') oor++; if (x === 'unconfigured') un++; });
          }
        });
      });
      Object.keys(counts).forEach((k) => set(lg[k], num(counts[k])));
      set(lg.oor, num(oor)); set(lg.un, num(un));

      // status bar
      const r = d.wifi_rssi;
      const lvl = r == null ? 0 : r >= -55 ? 4 : r >= -67 ? 3 : r >= -78 ? 2 : 1;
      bars.dataset.l = String(lvl);
      set(sb.rssi.v, r == null ? 'نامشخص' : ['', 'ضعیف', 'متوسط', 'خوب', 'عالی'][lvl]);
      sb.rssi.el.title = r == null ? 'هیچ دستگاهی به نقطهٔ دسترسی وصل نیست' : 'قدرت سیگنال: ' + num(r) + ' دسی‌بل‌میلی‌وات';
      set(sb.up.v, T.uptime(d.uptime_ms));
      set(sb.heap.v, T.kb(d.free_heap));
      set(sb.cyc.v, num(d.cycle_counter));
      if (d.ws_connected == null) sb.ws.el.hidden = true;
      else {
        sb.ws.el.hidden = false;
        set(sb.ws.v, d.ws_connected ? 'متصل' : 'قطع');
        sb.ws.el.classList.toggle('bad', !d.ws_connected);
      }
    }

    /* ---------- live feed ---------- */
    let fails = 0, lastOk = 0, beatTimer = 0;
    function onData(d) {
      render(d);
      fails = 0; lastOk = Date.now();
      beat.className = 'beat on';
      clearTimeout(beatTimer);
      beatTimer = setTimeout(() => { if (beat.className === 'beat on') beat.className = 'beat'; }, 250);
      set(sb.live.v, 'زنده');
      sb.live.el.classList.remove('bad');
      $('#grid').classList.remove('stale');
      $('#stale').hidden = true;
    }
    function onError(e) {
      fails++;
      if (fails < STALE_AFTER) return;
      beat.className = 'beat off';
      set(sb.live.v, 'قطع');
      sb.live.el.classList.add('bad');
      $('#grid').classList.add('stale');
      const b = T.clear($('#stale'));
      b.hidden = false;
      b.append(T.icon('warn'), h('p', {
        text: T.errMsg(e) + (lastOk ? ' آخرین دادهٔ دریافتی: ' + T.ago(Date.now() - lastOk) + '. ' : ' ') + 'تلاش مجدد خودکار ادامه دارد.',
      }));
    }
    scope.add(T.live.subscribe({
      data: onData,
      error: onError,
      transport: (t) => { sb.live.el.title = TRANSPORT[t] || ''; },
    }));
    scope.add(() => clearTimeout(beatTimer));
  }

  T.views.dashboard = { mount };
})();
