// Admin panel JS (DR-50, PC-side only) — v2 (2026-10-10 review).
// Vanilla JS, no framework, no CDN. Dynamic data is written with
// textContent / createElement only (never innerHTML).
//
// Fixes vs v1: HTTP errors are detected (r.ok) instead of being rendered as
// "unknown"; a failed backup is no longer reported as "Backup triggered";
// bilingual UI (fa/en); tabs for overview, database, records, backups, audit.
'use strict';

(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const LANG_KEY = 'toughening.admin.lang';
  let lang = 'fa';
  try { lang = localStorage.getItem(LANG_KEY) || 'fa'; } catch (e) { /* storage off */ }

  const STR = {
    fa: {
      title: 'مدیریت پایگاه داده', subtitle: 'پنل محلی رایانهٔ کنسول · فقط از همین رایانه',
      console: 'کنسول پایش', logout: 'خروج',
      'tab.overview': 'نمای کلی', 'tab.database': 'پایگاه داده', 'tab.records': 'رکوردها', 'tab.backups': 'پشتیبان‌ها', 'tab.settings': 'تنظیمات', 'tab.audit': 'گزارش رویدادها',
      status: 'وضعیت', 'device.title': 'اتصال دستگاه ریزکنترلگر', 'device.unknown': 'دستگاه: نامشخص',
      'device.on': 'دستگاه متصل', 'device.off': 'دستگاه قطع',
      'db.types': 'رکوردها به تفکیک نوع', 'db.check': 'بررسی سلامت پایگاه داده', 'db.csv': 'خروجی CSV', 'db.json': 'خروجی JSON',
      'db.file': 'فایل پایگاه داده',
      'db.deferred': 'حذف رکورد، پاک‌سازی دادهٔ نمایشی، بازیابی پشتیبان و تغییر نگهداشت طبق DR-50 به مرحلهٔ بعد موکول شده‌اند و در این پنل وجود ندارند.',
      'col.type': 'نوع', 'col.count': 'تعداد', 'col.first': 'نخستین', 'col.last': 'آخرین', 'col.received': 'دریافت', 'col.id': 'شناسه',
      'col.summary': 'خلاصه', 'col.name': 'نام', 'col.size': 'حجم', 'col.modified': 'زمان', 'col.time': 'زمان', 'col.user': 'کاربر',
      'col.action': 'عملیات', 'col.detail': 'جزئیات',
      all: 'همه', search: 'جستجو', apply: 'اعمال', prev: 'قبلی', next: 'بعدی', refresh: 'تازه‌سازی', close: 'بستن', view: 'نمایش',
      download: 'دریافت', 'backup.now': 'تهیهٔ پشتیبان اکنون',
      footer: 'Toughening Machine · پنل مدیریت (DR-50) · دسترسی فقط از همین رایانه (loopback)',
      'k.db_path': 'مسیر پایگاه داده', 'k.db_size': 'حجم پایگاه داده', 'k.records': 'تعداد رکورد', 'k.types': 'انواع رکورد',
      'k.backup_dir': 'پوشهٔ پشتیبان', 'k.backup_ok': 'پوشهٔ پشتیبان در دسترس', 'k.last_backup': 'آخرین پشتیبان', 'k.log': 'فایل گزارش',
      'k.config': 'فایل پیکربندی', 'k.connected': 'وضعیت', 'k.host': 'نشانی دستگاه', 'k.fw': 'نسخهٔ میان‌افزار', 'k.boot': 'شناسهٔ راه‌اندازی',
      'k.last_msg': 'آخرین پیام', 'k.msgs': 'پیام‌های دریافتی', 'k.rejected': 'پیام‌های ردشده', 'k.last_reject': 'آخرین علت رد',
      'k.connections': 'دفعات اتصال', 'k.gui': 'کنسول‌های باز', 'k.wal': 'حجم WAL', 'k.schema': 'نسخهٔ طرح', 'k.journal': 'حالت ژورنال',
      'k.pages': 'صفحه‌ها (آزاد)', 'k.demo': 'رکوردهای نمایشی (demo)',
      'stat.records': 'رکورد', 'stat.types': 'نوع', 'stat.size': 'حجم پایگاه داده', 'stat.backup': 'آخرین پشتیبان',
      yes: 'بله', no: 'خیر', none: '—', never: 'هرگز', connected: 'متصل', disconnected: 'قطع',
      'err.auth': 'نشست مدیریت منقضی شد. صفحه را دوباره بارگذاری کنید.', 'err.local': 'این پنل فقط از همین رایانه در دسترس است.',
      'err.config': 'پیکربندی مدیریت در دسترس نیست (سرور را یک بار راه‌اندازی کنید).',
      'backup.none': 'هنوز پشتیبانی وجود ندارد.', 'backup.nodir': 'پوشهٔ پشتیبان تنظیم نشده است (TOUGHENING_BACKUP_DIR یا backup_dir در pc/config.json).',
      'backup.count': '{n} فایل · نگهداشت: {r} · ساعت پشتیبان‌گیری روزانه: {h}', 'backup.done': 'پشتیبان ساخته شد: {p}', 'backup.fail': 'پشتیبان‌گیری ناموفق: {e}',
      'settings.title': 'تنظیمات پشتیبان و پایگاه داده', 'settings.save': 'ذخیره', 'settings.hint': 'متغیرهای محیطی بر مقدار ذخیره‌شده اولویت دارند.',
      'settings.db_path': 'مسیر پایگاه داده', 'settings.backup_dir': 'پوشه پشتیبان', 'settings.backup_hour': 'ساعت پشتیبان‌گیری', 'settings.retention': 'تعداد نگهداری', 'settings.saved': 'تنظیمات ذخیره شد', 'settings.env': 'با متغیر محیطی کنترل می‌شود: {v}',
      'check.ok': 'سالم ✓ ({ms} میلی‌ثانیه)', 'check.bad': 'مشکل در پایگاه داده: {m}', 'check.run': 'در حال بررسی…',
      'rec.info': '{t} رکورد · نمایش {a} تا {b}', 'rec.empty': 'رکوردی یافت نشد.', 'ago': 'پیش',
    },
    en: {
      title: 'Database administration', subtitle: 'Local console PC panel · this computer only',
      console: 'Operator console', logout: 'Log out',
      'tab.overview': 'Overview', 'tab.database': 'Database', 'tab.records': 'Records', 'tab.backups': 'Backups', 'tab.settings': 'Settings', 'tab.audit': 'Audit log',
      status: 'Status', 'device.title': 'Microcontroller link', 'device.unknown': 'Device: unknown',
      'device.on': 'Device online', 'device.off': 'Device offline',
      'db.types': 'Records by type', 'db.check': 'Check database integrity', 'db.csv': 'Export CSV', 'db.json': 'Export JSON',
      'db.file': 'Database file',
      'db.deferred': 'Record deletion, demo purge, restore and retention changes are DEFERRED by DR-50 and are not available here.',
      'col.type': 'Type', 'col.count': 'Count', 'col.first': 'First', 'col.last': 'Last', 'col.received': 'Received', 'col.id': 'Record ID',
      'col.summary': 'Summary', 'col.name': 'Name', 'col.size': 'Size', 'col.modified': 'Modified', 'col.time': 'Time', 'col.user': 'User',
      'col.action': 'Action', 'col.detail': 'Detail',
      all: 'All', search: 'Search', apply: 'Apply', prev: 'Previous', next: 'Next', refresh: 'Refresh', close: 'Close', view: 'View',
      download: 'Download', 'backup.now': 'Back up now',
      footer: 'Toughening Machine · Admin panel (DR-50) · loopback access only',
      'k.db_path': 'Database path', 'k.db_size': 'Database size', 'k.records': 'Record count', 'k.types': 'Record types',
      'k.backup_dir': 'Backup directory', 'k.backup_ok': 'Backup directory available', 'k.last_backup': 'Last backup', 'k.log': 'Audit log file',
      'k.config': 'Config file', 'k.connected': 'Status', 'k.host': 'Device address', 'k.fw': 'Firmware', 'k.boot': 'Boot ID',
      'k.last_msg': 'Last message', 'k.msgs': 'Messages received', 'k.rejected': 'Messages rejected', 'k.last_reject': 'Last reject reason',
      'k.connections': 'Connections', 'k.gui': 'Open consoles', 'k.wal': 'WAL size', 'k.schema': 'Schema version', 'k.journal': 'Journal mode',
      'k.pages': 'Pages (free)', 'k.demo': 'Demo records',
      'stat.records': 'records', 'stat.types': 'types', 'stat.size': 'database size', 'stat.backup': 'last backup',
      yes: 'yes', no: 'no', none: '—', never: 'never', connected: 'connected', disconnected: 'disconnected',
      'err.auth': 'Admin session expired. Reload the page.', 'err.local': 'This panel is only reachable from this computer.',
      'err.config': 'Admin config unavailable (start the server once).',
      'backup.none': 'No backups yet.', 'backup.nodir': 'Backup directory not configured (TOUGHENING_BACKUP_DIR or backup_dir in pc/config.json).',
      'backup.count': '{n} file(s) · retention: {r} · daily backup hour: {h}', 'backup.done': 'Backup created: {p}', 'backup.fail': 'Backup failed: {e}',
      'settings.title': 'Backup and database settings', 'settings.save': 'Save', 'settings.hint': 'Environment variables override saved values.',
      'settings.db_path': 'Database path', 'settings.backup_dir': 'Backup directory', 'settings.backup_hour': 'Backup hour', 'settings.retention': 'Retention count', 'settings.saved': 'Settings saved', 'settings.env': 'Controlled by environment variable: {v}',
      'check.ok': 'Healthy ✓ ({ms} ms)', 'check.bad': 'Database problem: {m}', 'check.run': 'Checking…',
      'rec.info': '{t} record(s) · showing {a}-{b}', 'rec.empty': 'No records found.', 'ago': 'ago',
    },
  };
  const t = (k, vars) => {
    let s = (STR[lang] && STR[lang][k]) || STR.en[k] || k;
    if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(String(vars[v])); });
    return s;
  };

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $('#btn-lang').textContent = lang === 'fa' ? 'EN' : 'فا';
  }

  /* ---------- formatting ---------- */
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return t('none');
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + units[i];
  }
  function formatDate(ms) {
    if (!ms) return t('none');
    const d = new Date(ms);
    try {
      return d.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium' });
    } catch (e) { return d.toISOString().replace('T', ' ').slice(0, 19); }
  }
  function ago(ms) {
    if (ms == null) return t('never');
    const s = Math.round(ms / 1000);
    const txt = s < 90 ? s + 's' : s < 5400 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h';
    return txt + ' ' + t('ago');
  }
  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    if (props) Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v == null) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    kids.forEach((c) => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  };
  function fillKv(table, rows) {
    const tb = table.tBodies[0];
    tb.textContent = '';
    rows.forEach(([k, v, cls]) => tb.append(el('tr', null, el('th', { text: t(k) }), el('td', { text: v == null || v === '' ? t('none') : String(v), class: cls || null }))));
  }

  /* ---------- HTTP ---------- */
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ credentials: 'include', cache: 'no-store' }, opts || {}));
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      const msg = r.status === 401 ? t('err.auth') : r.status === 403 ? t('err.local') : r.status === 503 && data && /config/i.test(data.detail || '') ? t('err.config')
        : (data && (data.detail || data.error)) || ('HTTP ' + r.status);
      throw new HttpError(r.status, msg);
    }
    return data;
  }
  function toast(message, bad) {
    const n = el('div', { class: 'toast' + (bad ? ' bad' : ''), text: message, role: 'status' });
    document.body.append(n);
    setTimeout(() => n.remove(), bad ? 6000 : 3500);
  }

  /* ---------- overview ---------- */
  let lastStatus = null;
  async function loadStatus() {
    try {
      const d = await api('/api/admin/status');
      lastStatus = d;
      fillKv($('#tbl-status'), [
        ['k.db_path', d.db_path, 'mono'], ['k.db_size', formatBytes(d.db_size_bytes)], ['k.records', d.record_count],
        ['k.types', (d.record_types || []).join(', ')], ['k.backup_dir', d.backup_dir, 'mono'],
        ['k.backup_ok', d.backup_dir_available ? t('yes') : t('no'), d.backup_dir_available ? 'ok' : 'warn'],
        ['k.last_backup', d.last_backup ? formatDate(d.last_backup_ms) : t('never')], ['k.log', d.log_path, 'mono'], ['k.config', d.config_path, 'mono'],
      ]);
      const stats = $('#ov-stats');
      stats.textContent = '';
      [[d.record_count, t('stat.records')], [(d.record_types || []).length, t('stat.types')], [formatBytes(d.db_size_bytes), t('stat.size')],
        [d.last_backup_ms ? ago(Date.now() - d.last_backup_ms) : t('never'), t('stat.backup')]]
        .forEach(([v, k]) => stats.append(el('div', { class: 'stat' }, el('b', { text: String(v) }), el('span', { text: k }))));
    } catch (e) { fillKv($('#tbl-status'), [['k.db_path', e.message, 'bad']]); }
  }
  async function loadDevice() {
    try {
      const d = await api('/api/admin/device');
      const pill = $('#device-pill');
      pill.className = 'pill ' + (d.connected ? 'on' : 'off');
      pill.lastElementChild.textContent = d.connected ? t('device.on') : t('device.off');
      fillKv($('#tbl-device'), [
        ['k.connected', d.connected ? t('connected') : t('disconnected'), d.connected ? 'ok' : 'warn'],
        ['k.host', d.host, 'mono'], ['k.fw', d.firmware_version], ['k.boot', d.boot_id, 'mono'],
        ['k.last_msg', d.last_message_age_ms != null ? ago(d.last_message_age_ms) : t('never')],
        ['k.msgs', d.messages_received], ['k.rejected', d.messages_rejected, d.messages_rejected ? 'warn' : null],
        ['k.last_reject', d.last_reject_reason, 'mono'], ['k.connections', d.connections], ['k.gui', d.gui_clients],
      ]);
    } catch (e) { /* keep the previous state */ }
  }

  /* ---------- database ---------- */
  async function loadDb() {
    try {
      const d = await api('/api/admin/db');
      const tb = $('#tbl-types').tBodies[0];
      tb.textContent = '';
      const sel = $('#rec-type');
      const keep = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      (d.types || []).forEach((x) => {
        tb.append(el('tr', null, el('td', { class: 'mono', text: x.record_type }), el('td', { text: x.count }),
          el('td', { text: formatDate(x.first_ms) }), el('td', { text: formatDate(x.last_ms) })));
        sel.append(el('option', { value: x.record_type, text: x.record_type + ' (' + x.count + ')' }));
      });
      sel.value = keep;
      if (!(d.types || []).length) tb.append(el('tr', null, el('td', { colspan: '4', class: 'muted', text: t('rec.empty') })));
      fillKv($('#tbl-dbfile'), [
        ['k.db_path', d.db_path, 'mono'], ['k.db_size', formatBytes(d.db_size_bytes)], ['k.wal', formatBytes(d.wal_size_bytes)],
        ['k.schema', d.schema_version], ['k.journal', d.journal_mode], ['k.pages', d.page_count + ' (' + d.free_pages + ')'],
        ['k.demo', d.demo_record_count, d.demo_record_count ? 'warn' : null],
      ]);
    } catch (e) { toast(e.message, true); }
  }
  async function runCheck() {
    const out = $('#check-result'), btn = $('#btn-check');
    btn.disabled = true; out.className = 'hint'; out.textContent = t('check.run');
    try {
      const r = await api('/api/admin/db/check', { method: 'POST' });
      out.className = 'hint ' + (r.ok ? 'ok' : 'bad');
      out.textContent = r.ok ? t('check.ok', { ms: r.elapsed_ms }) : t('check.bad', { m: (r.messages || []).join(' | ') });
    } catch (e) { out.className = 'hint bad'; out.textContent = e.message; }
    finally { btn.disabled = false; }
  }

  /* ---------- records ---------- */
  const REC = { limit: 50, offset: 0, total: 0 };
  function summarize(p) {
    if (!p || typeof p !== 'object') return String(p);
    const keys = ['station_id', 'event_code', 'channel_id', 'duration_ms', 'duration_basis', 'faulted_channel_count', 'alarm_state', 'records_overwritten'];
    const parts = keys.filter((k) => k in p).map((k) => k + '=' + JSON.stringify(p[k]));
    return parts.join('  ') || JSON.stringify(p).slice(0, 120);
  }
  async function loadRecords() {
    const qs = new URLSearchParams({ limit: REC.limit, offset: REC.offset });
    if ($('#rec-type').value) qs.set('type', $('#rec-type').value);
    if ($('#rec-q').value.trim()) qs.set('q', $('#rec-q').value.trim());
    try {
      const d = await api('/api/admin/records?' + qs.toString());
      REC.total = d.total;
      const tb = $('#tbl-records').tBodies[0];
      tb.textContent = '';
      d.items.forEach((r) => {
        tb.append(el('tr', null,
          el('td', { text: formatDate(r.pc_received_ms) }), el('td', { class: 'mono', text: r.record_type }),
          el('td', { class: 'mono small', text: r.record_id }), el('td', { class: 'mono small', text: summarize(r.payload) }),
          el('td', null, el('button', { class: 'btn ghost sm', type: 'button', text: t('view'), onclick: () => showRecord(r) }))));
      });
      if (!d.items.length) tb.append(el('tr', null, el('td', { colspan: '5', class: 'muted', text: t('rec.empty') })));
      $('#rec-info').textContent = t('rec.info', { t: d.total, a: d.total ? d.offset + 1 : 0, b: d.offset + d.items.length });
      $('#rec-prev').disabled = REC.offset === 0;
      $('#rec-next').disabled = REC.offset + REC.limit >= REC.total;
      $('#rec-page').textContent = (Math.floor(REC.offset / REC.limit) + 1) + ' / ' + Math.max(1, Math.ceil(REC.total / REC.limit));
    } catch (e) { toast(e.message, true); }
  }
  function showRecord(r) {
    $('#dlg-title').textContent = r.record_type + ' · ' + r.record_id;
    $('#dlg-body').textContent = JSON.stringify(r, null, 2);
    $('#dlg-record').showModal();
  }

  /* ---------- backups ---------- */
  async function loadBackups() {
    const hint = $('#backup-hint');
    const tb = $('#tbl-backups').tBodies[0];
    try {
      const data = await api('/api/admin/backups');
      const backups = (data.backups || []).filter((b) => b.is_backup !== false).sort((a, b) => b.mtime_ms - a.mtime_ms);
      tb.textContent = '';
      $('#btn-backup').disabled = !data.writable;
      if (!data.backup_dir) { hint.textContent = t('backup.nodir'); return; }
      hint.textContent = backups.length ? t('backup.count', { n: backups.length, r: data.retention, h: data.backup_hour }) : t('backup.none');
      backups.forEach((b) => {
        tb.append(el('tr', null, el('td', { class: 'mono', text: b.name }), el('td', { text: formatBytes(b.size_bytes) }),
          el('td', { text: formatDate(b.mtime_ms) }),
          el('td', null, el('a', { class: 'btn ghost sm', href: '/api/admin/backups/' + encodeURIComponent(b.name), download: b.name, text: t('download') }))));
      });
    } catch (e) { hint.textContent = e.message; }
  }

  async function loadSettings() {
    try {
      const d = await api('/api/admin/settings');
      const set = d.settings || {};
      [['db_path', 'cfg-db-path'], ['backup_dir', 'cfg-backup-dir'],
       ['backup_hour', 'cfg-backup-hour'], ['backup_retention', 'cfg-backup-retention']]
        .forEach(([key, id]) => {
          const item = set[key] || {};
          const input = $('#' + id);
          input.value = item.value == null ? '' : item.value;
          input.disabled = !item.editable;
          input.title = item.environment ? t('settings.env', { v: item.environment }) : '';
        });
    } catch (e) { toast(e.message, true); }
  }

  async function saveSettings() {
    const values = {
      db_path: $('#cfg-db-path').value.trim(),
      backup_dir: $('#cfg-backup-dir').value.trim(),
      backup_hour: Number($('#cfg-backup-hour').value),
      backup_retention: Number($('#cfg-backup-retention').value),
    };
    Object.keys(values).forEach((key) => {
      const input = document.querySelector('[name="' + key + '"]');
      if (input && input.disabled) delete values[key];
    });
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: values }),
      });
      $('#settings-result').className = 'hint ok';
      $('#settings-result').textContent = t('settings.saved');
      loadStatus(); loadBackups();
    } catch (e) {
      $('#settings-result').className = 'hint bad';
      $('#settings-result').textContent = e.message;
    }
  }
  async function triggerBackup() {
    const btn = $('#btn-backup');
    btn.disabled = true;
    try {
      const data = await api('/api/admin/backup', { method: 'POST' });
      toast(t('backup.done', { p: data.path }));
      loadBackups(); loadStatus();
    } catch (e) {
      toast(t('backup.fail', { e: e.message }), true);
    } finally { btn.disabled = false; }
  }

  /* ---------- audit ---------- */
  async function loadAudit() {
    try {
      const d = await api('/api/admin/audit?lines=300');
      const tb = $('#tbl-audit').tBodies[0];
      tb.textContent = '';
      d.entries.forEach((x) => tb.append(el('tr', { class: /fail|error/i.test(x.action || '') ? 'warnrow' : null },
        el('td', { class: 'mono small', text: x.ts || '' }), el('td', { text: x.user || '' }),
        el('td', { class: 'mono', text: x.action || '' }), el('td', { class: 'mono small', text: x.detail || x.raw }))));
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- logout ---------- */
  function logout() {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
      .catch(() => null)
      .then(() => {
        // Ask the browser to drop cached Basic credentials (works in Chromium / Firefox).
        return fetch('/api/admin/status', { headers: { Authorization: 'Basic ' + btoa('logout:logout') }, cache: 'no-store' }).catch(() => null);
      })
      .then(() => { window.location.href = '/'; });
  }

  /* ---------- tabs ---------- */
  const LOADERS = { overview: () => { loadStatus(); loadDevice(); }, database: loadDb, records: () => { loadDb(); loadRecords(); }, backups: loadBackups, settings: loadSettings, audit: loadAudit };
  let current = 'overview';
  function show(tab) {
    current = LOADERS[tab] ? tab : 'overview';
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === current); b.setAttribute('aria-selected', b.dataset.tab === current); });
    document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== current; });
    try { history.replaceState(null, '', '#' + current); } catch (e) { /* ignore */ }
    LOADERS[current]();
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyLang();
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
    $('#btn-backup').addEventListener('click', triggerBackup);
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-check').addEventListener('click', runCheck);
    $('#btn-audit').addEventListener('click', loadAudit);
    $('#btn-settings-save').addEventListener('click', saveSettings);
    $('#btn-lang').addEventListener('click', () => {
      lang = lang === 'fa' ? 'en' : 'fa';
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* storage off */ }
      applyLang(); LOADERS[current]();
    });
    $('#rec-form').addEventListener('submit', (e) => { e.preventDefault(); REC.offset = 0; loadRecords(); });
    $('#rec-prev').addEventListener('click', () => { REC.offset = Math.max(0, REC.offset - REC.limit); loadRecords(); });
    $('#rec-next').addEventListener('click', () => { REC.offset += REC.limit; loadRecords(); });
    show((location.hash || '').slice(1) || 'overview');
    loadDevice();
    setInterval(loadDevice, 5000);
  });
})();
