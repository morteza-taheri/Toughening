// Toughening console — shell + hash router.
import { prefs, setPref, onPrefs, applyPrefs, t, esc, fmtTime, fmtDate, pad2 } from "./core.js";
import { icon } from "./icons.js";
import { connectLive, onLive, live, linkState as combinedLinkState } from "./store.js";
import { dashboardPage, stationPage } from "./pages-monitor.js";
import { eventsPage, reportsPage } from "./pages-data.js";
import { settingsPage } from "./pages-settings.js";

const ROUTES = {
  dashboard: { page: dashboardPage, icon: "dashboard", section: "monitor" },
  stations: { page: stationPage, icon: "stations", section: "monitor" },
  events: { page: eventsPage, icon: "events", section: "monitor" },
  reports: { page: reportsPage, icon: "reports", section: "data" },
  settings: { page: settingsPage, icon: "settings", section: "system" },
};

let cleanup = null;
let current = { name: "dashboard", params: [] };

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const name = ROUTES[parts[0]] ? parts[0] : "dashboard";
  return { name, params: parts.slice(1) };
}

function linkState() {
  return combinedLinkState();
}

function drawSidebar() {
  const sb = document.getElementById("sidebar");
  const sections = ["monitor", "data", "system"];
  sb.innerHTML = `
    <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <div><b>${esc(t("app.name"))}</b><small>${esc(t("app.sub"))}</small></div></div>
    <nav class="nav">${sections.map(sec => `<p class="nav-sec">${esc(t(`nav.section.${sec}`))}</p>` +
      Object.entries(ROUTES).filter(([, r]) => r.section === sec).map(([name, r]) =>
        `<a href="#/${name}" class="nav-item${current.name === name ? " on" : ""}">${icon(r.icon, 19)}<span>${esc(t(`nav.${name}`))}</span></a>`).join("")).join("")}
    </nav>
    <div class="sb-foot" id="sb-link"></div>`;
  drawLink();
}

function drawLink() {
  const el = document.getElementById("sb-link"); if (!el) return;
  const st = linkState();
  el.className = `sb-foot link-${st}`;
  el.innerHTML = `<span class="pulse"></span><div><b>${esc(t(`conn.${st}`))}</b><small>${esc(deviceLine())}</small></div>`;
  const tl = document.getElementById("top-link");
  if (tl) { tl.className = `top-link link-${st}`; tl.innerHTML = `<span class="pulse"></span>${esc(t(`conn.${st}`))}`; }
}

function deviceLine() {
  const d = live.device;
  const fw = d?.firmware_version ? ` · fw ${d.firmware_version}` : "";
  return `${(d?.device_id || "MICROCONTROLLER-01").toUpperCase()} · PC-01 · v1.1.1${fw}`;
}

function drawTopbar() {
  const tb = document.getElementById("topbar");
  const dark = !["daylight", "polar"].includes(prefs.theme);
  tb.innerHTML = `
    <div class="tb-title"><p class="eyebrow">${esc(t(`page.${current.name}.sub`))}</p><h1>${esc(t(`page.${current.name}`))}</h1></div>
    <div class="tb-actions">
      <form class="jump" id="jump">${icon("search", 16)}<input id="jump-in" inputmode="numeric" placeholder="${esc(t("search.placeholder"))}" aria-label="${esc(t("search.placeholder"))}"><kbd>/</kbd></form>
      <span class="top-link" id="top-link"></span>
      <div class="clock" id="clock"></div>
      <button class="icon-btn" id="tb-cal" title="${esc(t("set.calendar"))}">${icon("calendar", 18)}<span>${esc(prefs.calendar === "jalali" ? t("set.calendar.jalali") : t("set.calendar.gregorian"))}</span></button>
      <button class="icon-btn" id="tb-lang" title="${esc(t("set.language"))}">${icon("globe", 18)}<span>${prefs.lang === "fa" ? "EN" : "فا"}</span></button>
      <button class="icon-btn square" id="tb-theme" title="${esc(t("set.theme"))}">${icon(dark ? "sun" : "moon", 18)}</button>
      <a class="icon-btn square" href="#/settings" title="${esc(t("nav.settings"))}">${icon("settings", 18)}</a>
    </div>`;
  tb.querySelector("#tb-cal").onclick = () => setPref("calendar", prefs.calendar === "jalali" ? "gregorian" : "jalali");
  tb.querySelector("#tb-lang").onclick = () => setPref("lang", prefs.lang === "fa" ? "en" : "fa");
  tb.querySelector("#tb-theme").onclick = () => setPref("theme", dark ? "daylight" : "graphite");
  tb.querySelector("#jump").onsubmit = e => {
    e.preventDefault();
    const raw = tb.querySelector("#jump-in").value.replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= 16) location.hash = `#/stations/${n}`;
  };
  drawClock(); drawLink();
}

function drawClock() {
  const c = document.getElementById("clock");
  if (c) c.innerHTML = `<b>${esc(fmtTime(Date.now()))}</b><small>${esc(fmtDate(Date.now()))}</small>`;
}

function mount() {
  cleanup?.();
  current = parseHash();
  drawSidebar(); drawTopbar();
  const view = document.getElementById("view");
  view.className = `view view-${current.name}`;
  view.innerHTML = "";
  cleanup = ROUTES[current.name].page(view, current.params) || null;
  view.animate?.([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: prefs.motion ? 260 : 0, easing: "cubic-bezier(.2,.7,.2,1)" });
}

applyPrefs();
window.addEventListener("hashchange", mount);
onPrefs(() => {
  if (current.name === "settings") { drawSidebar(); drawTopbar(); }
  else mount();
});
onLive(drawLink);
setInterval(drawClock, 1000);
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); document.getElementById("jump-in")?.focus(); }
});
mount();
connectLive();
