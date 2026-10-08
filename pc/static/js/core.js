// Toughening console — preferences, i18n, formatting, small DOM helpers.
import { STRINGS } from "./i18n.js";

const PREF_KEY = "toughening.console.prefs.v2";

export const THEMES = ["graphite", "daylight", "furnace", "polar", "midnight", "contrast"];
export const ACCENTS = ["auto", "#4FD1B5", "#38BDF8", "#6E8BFF", "#B98CFF", "#FFB547", "#FF6B8B"];
export const FONTS = {
  vazirmatn: "'Vazirmatn', 'Segoe UI', Tahoma, sans-serif",
  vazirmatnRound: "'Vazirmatn RD', 'Vazirmatn', 'Segoe UI', Tahoma, sans-serif",
  system: "system-ui, 'Segoe UI', Tahoma, sans-serif",
  tahoma: "Tahoma, 'Segoe UI', sans-serif",
  mono: "'Cascadia Mono', Consolas, 'Vazirmatn', monospace",
};
export const FONT_LABELS = {
  vazirmatn: "Vazirmatn", vazirmatnRound: "Vazirmatn Rounded",
  system: "System UI", tahoma: "Tahoma", mono: "Cascadia / Consolas",
};
export const RANGES = [
  { key: "1h", h: 1 }, { key: "6h", h: 6 }, { key: "12h", h: 12 },
  { key: "24h", h: 24 }, { key: "3d", h: 72 }, { key: "7d", h: 168 },
];

export const DEFAULTS = {
  theme: "graphite",
  accent: "auto",
  radius: "soft",
  density: "comfortable",
  motion: true,
  glow: true,
  font: "vazirmatn",
  fontSize: 15,
  digits: "fa",
  lang: "fa",
  calendar: "jalali",
  clock: "24",
  seconds: true,
  defaultRange: "12h",
  columns: "auto",
  spark: true,
  secondNozzle: true,
  pUnit: "bar",
  tUnit: "°C",
  refreshSec: 30,
  staleSec: 10,
  stationNames: {},
};

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    return { ...DEFAULTS, ...raw, stationNames: { ...(raw.stationNames || {}) } };
  } catch {
    return { ...DEFAULTS, stationNames: {} };
  }
}

export const prefs = loadPrefs();
const listeners = new Set();

export function onPrefs(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setPref(key, value) {
  prefs[key] = value;
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  applyPrefs();
  listeners.forEach(fn => fn(key, value));
}

export function replacePrefs(next) {
  Object.keys(prefs).forEach(k => delete prefs[k]);
  Object.assign(prefs, { ...DEFAULTS, ...next, stationNames: { ...(next.stationNames || {}) } });
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  applyPrefs();
  listeners.forEach(fn => fn("*", null));
}

export function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.radius = prefs.radius;
  root.dataset.density = prefs.density;
  root.dataset.motion = prefs.motion ? "on" : "off";
  root.dataset.glow = prefs.glow ? "on" : "off";
  root.lang = prefs.lang;
  root.dir = prefs.lang === "fa" ? "rtl" : "ltr";
  root.style.setProperty("--font", FONTS[prefs.font] || FONTS.vazirmatn);
  root.style.fontSize = `${prefs.fontSize}px`;
  if (prefs.accent && prefs.accent !== "auto") root.style.setProperty("--accent", prefs.accent);
  else root.style.removeProperty("--accent");
}

// ---------------------------------------------------------------- i18n
export function t(key, vars) {
  const table = STRINGS[prefs.lang] || STRINGS.fa;
  let s = table[key] ?? STRINGS.en[key] ?? key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
  return s;
}

// ---------------------------------------------------------- formatting
function numLocale() { return prefs.digits === "fa" ? "fa-IR" : "en-US"; }

export function num(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat(numLocale(), {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(Number(v));
}

export function int(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat(numLocale(), { maximumFractionDigits: 0 }).format(Number(v));
}

export function pad2(n) {
  const s = String(n).padStart(2, "0");
  return prefs.digits === "fa" ? s.replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]) : s;
}

function dtLocale() {
  const base = prefs.lang === "fa" ? "fa-IR" : "en-GB";
  const cal = prefs.calendar === "jalali" ? "persian" : "gregory";
  const nu = prefs.digits === "fa" ? "arabext" : "latn";
  return `${base}-u-ca-${cal}-nu-${nu}`;
}

export function fmtTime(ms, withSeconds = prefs.seconds) {
  if (!ms) return "—";
  return new Intl.DateTimeFormat(dtLocale(), {
    hour: "2-digit", minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: prefs.clock === "12",
  }).format(new Date(Number(ms)));
}

export function fmtDate(ms) {
  if (!ms) return "—";
  return new Intl.DateTimeFormat(dtLocale(), { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Number(ms)));
}

export function fmtDateTime(ms) {
  if (!ms) return "—";
  return `${fmtDate(ms)}  ${fmtTime(ms)}`;
}

export function fmtShortDate(ms) {
  return new Intl.DateTimeFormat(dtLocale(), { month: "short", day: "numeric" }).format(new Date(Number(ms)));
}

export function fmtDuration(ms) {
  if (ms === null || ms === undefined) return "—";
  const s = Math.round(Number(ms) / 1000);
  const m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${int(m)}:${pad2(r)}` : `${int(r)} ${t("unit.s")}`;
}

export function ago(ms) {
  if (!ms) return "—";
  const rtf = new Intl.RelativeTimeFormat(prefs.lang === "fa" ? "fa" : "en", { numeric: "auto" });
  const d = Math.round((Number(ms) - Date.now()) / 1000);
  if (Math.abs(d) < 60) return rtf.format(d, "second");
  if (Math.abs(d) < 3600) return rtf.format(Math.round(d / 60), "minute");
  if (Math.abs(d) < 86400) return rtf.format(Math.round(d / 3600), "hour");
  return rtf.format(Math.round(d / 86400), "day");
}

export function stationName(id) {
  const custom = (prefs.stationNames || {})[id];
  return custom && custom.trim() ? custom.trim() : `${t("station")} ${pad2(id)}`;
}

export function rangeHours(key) {
  return (RANGES.find(r => r.key === key) || RANGES[2]).h;
}

// ---------------------------------------------------------------- DOM
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer = null;
export function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status" }); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

export function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
