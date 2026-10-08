// Settings page: separate tabs, every change applies live and persists locally.
import { prefs, setPref, replacePrefs, DEFAULTS, THEMES, ACCENTS, FONTS, FONT_LABELS, RANGES, t, h, int, pad2, esc, toast, download, stationName } from "./core.js";
import { icon } from "./icons.js";
import { api, live, STATION_IDS } from "./store.js";

const TABS = [
  { id: "appearance", icon: "palette" },
  { id: "typography", icon: "type" },
  { id: "locale", icon: "globe" },
  { id: "dashboard", icon: "dashboard" },
  { id: "stations", icon: "tag" },
  { id: "system", icon: "server" },
  { id: "device", icon: "lock" },
];

function seg(key, options) {
  return h("div", { class: "seg" }, ...options.map(([val, label]) => h("button", {
    class: String(prefs[key]) === String(val) ? "on" : "",
    onclick: () => { setPref(key, val); rerender(); },
  }, label)));
}

function toggle(key) {
  return h("button", { class: `switch${prefs[key] ? " on" : ""}`, role: "switch", "aria-checked": !!prefs[key],
    onclick: () => { setPref(key, !prefs[key]); rerender(); } }, h("span"));
}

function row(label, hint, control) {
  return h("div", { class: "set-row" }, h("div", { class: "set-label" }, h("b", {}, label), hint ? h("small", {}, hint) : null), h("div", { class: "set-control" }, control));
}

function group(title, ...rows) {
  return h("section", { class: "set-group" }, title ? h("h4", {}, title) : null, ...rows);
}

let rerender = () => {};

const PANES = {
  appearance() {
    const themes = h("div", { class: "theme-grid" }, ...THEMES.map(th => h("button", {
      class: `theme-card${prefs.theme === th ? " on" : ""}`, "data-preview": th,
      onclick: () => { setPref("theme", th); rerender(); },
    }, h("div", { class: "tp", "data-theme": th, html: `<div class="tp-side"></div><div class="tp-main"><div class="tp-bar"></div><div class="tp-cards"><i></i><i></i><i></i><i></i></div><div class="tp-line"></div></div>` }),
      h("div", { class: "theme-name" }, h("b", {}, t(`theme.${th}`)), prefs.theme === th ? h("span", { html: icon("check", 16) }) : null))));
    const accents = h("div", { class: "swatches" }, ...ACCENTS.map(a => h("button", {
      class: `swatch${prefs.accent === a ? " on" : ""}${a === "auto" ? " auto" : ""}`, title: a === "auto" ? t("set.accent.auto") : a,
      style: a === "auto" ? {} : { background: a }, onclick: () => { setPref("accent", a); rerender(); },
    }, a === "auto" ? "A" : "")));
    return [
      group(t("set.theme"), h("p", { class: "group-hint" }, t("set.theme.hint")), themes),
      group(null,
        row(t("set.accent"), null, accents),
        row(t("set.radius"), null, seg("radius", [["sharp", t("set.radius.sharp")], ["soft", t("set.radius.soft")], ["round", t("set.radius.round")]])),
        row(t("set.density"), null, seg("density", [["comfortable", t("set.density.comfortable")], ["compact", t("set.density.compact")]])),
        row(t("set.motion"), null, toggle("motion")),
        row(t("set.glow"), null, toggle("glow"))),
    ];
  },
  typography() {
    const fonts = h("div", { class: "font-grid" }, ...Object.keys(FONTS).map(f => h("button", {
      class: `font-card${prefs.font === f ? " on" : ""}`, style: { fontFamily: FONTS[f] },
      onclick: () => { setPref("font", f); rerender(); },
    }, h("span", { class: "font-sample" }, "فشار ۱٫۲۴ · Aa 123"), h("small", {}, FONT_LABELS[f]))));
    const size = h("input", { type: "range", min: 13, max: 18, step: 1, value: prefs.fontSize, class: "slider",
      oninput: e => { setPref("fontSize", Number(e.target.value)); sizeVal.textContent = `${int(prefs.fontSize)}px`; } });
    const sizeVal = h("b", { class: "slider-val" }, `${int(prefs.fontSize)}px`);
    return [
      group(t("set.font"), fonts),
      group(null,
        row(t("set.fontSize"), null, h("div", { class: "slider-wrap" }, h("span", { class: "a-small" }, "A"), size, h("span", { class: "a-big" }, "A"), sizeVal)),
        row(t("set.digits"), null, seg("digits", [["fa", t("set.digits.fa")], ["latin", t("set.digits.latin")]]))),
      group(t("set.preview"), h("div", { class: "type-preview" },
        h("p", { class: "eyebrow" }, t("detail.live")),
        h("h2", {}, `${stationName(7)}`),
        h("div", { class: "tp-values" },
          h("div", {}, h("span", {}, t("pressure")), h("b", {}, new Intl.NumberFormat(prefs.digits === "fa" ? "fa-IR" : "en-US", { minimumFractionDigits: 2 }).format(1.24), h("small", {}, ` ${prefs.pUnit}`))),
          h("div", {}, h("span", {}, t("temperature")), h("b", { class: "heat" }, new Intl.NumberFormat(prefs.digits === "fa" ? "fa-IR" : "en-US").format(63), h("small", {}, ` ${prefs.tUnit}`)))))),
    ];
  },
  locale() {
    return [group(null,
      row(t("set.language"), null, seg("lang", [["fa", "فارسی"], ["en", "English"]])),
      row(t("set.calendar"), null, seg("calendar", [["jalali", t("set.calendar.jalali")], ["gregorian", t("set.calendar.gregorian")]])),
      row(t("set.clock"), null, seg("clock", [["24", t("set.clock.24")], ["12", t("set.clock.12")]])),
      row(t("set.seconds"), null, toggle("seconds")),
      row(t("set.digits"), null, seg("digits", [["fa", t("set.digits.fa")], ["latin", t("set.digits.latin")]])))];
  },
  dashboard() {
    const unit = key => h("input", { class: "input", value: prefs[key], maxlength: 8, onchange: e => { setPref(key, e.target.value.trim() || DEFAULTS[key]); toast(t("set.saved")); } });
    return [
      group(null,
        row(t("set.defaultRange"), null, seg("defaultRange", RANGES.map(r => [r.key, t(`range.${r.key}`)]))),
        row(t("set.columns"), null, seg("columns", [["auto", t("set.columns.auto")], ["4", int(4)], ["8", int(8)]])),
        row(t("set.spark"), null, toggle("spark")),
        row(t("set.secondNozzle"), null, toggle("secondNozzle")),
        row(t("set.refresh"), null, seg("refreshSec", [[15, `${int(15)} ${t("unit.s")}`], [30, `${int(30)} ${t("unit.s")}`], [60, `${int(60)} ${t("unit.s")}`]])),
        row(t("set.stale"), null, seg("staleSec", [[5, `${int(5)} ${t("unit.s")}`], [10, `${int(10)} ${t("unit.s")}`], [30, `${int(30)} ${t("unit.s")}`]]))),
      group(null,
        row(t("set.pUnit"), t("set.unitHint"), unit("pUnit")),
        row(t("set.tUnit"), t("set.unitHint"), unit("tUnit"))),
    ];
  },
  stations() {
    const grid = h("div", { class: "names-grid" }, ...STATION_IDS.map(id => h("label", { class: "name-field" },
      h("span", {}, pad2(id)),
      h("input", { class: "input", value: prefs.stationNames[id] || "", placeholder: `${t("station")} ${pad2(id)}`, maxlength: 28,
        onchange: e => { setPref("stationNames", { ...prefs.stationNames, [id]: e.target.value }); toast(t("set.saved")); } }))));
    return [group(null, h("p", { class: "group-hint" }, t("set.stationNames.hint")), grid)];
  },
  system() {
    const box = h("div", { class: "sys-grid" });
    const cell = (ic, label, value, cls = "") => `<div class="sys-cell ${cls}">${icon(ic, 18)}<span>${esc(label)}</span><b>${value}</b></div>`;
    const draw = health => {
      box.innerHTML = [
        cell("server", t("set.server"), health ? esc(health.status) : "—", health ? "ok" : "bad"),
        cell("info", t("set.version"), esc(health?.version || "—")),
        cell("link", t("set.ws"), esc(t(`conn.${live.ws}`)), live.ws === "connected" ? "ok" : "bad"),
        cell("activity", t("set.messages"), int(live.messages)),
        cell("layers", t("set.protocol"), "1.1.1"),
        cell("database", "SQLite", "WAL"),
      ].join("");
    };
    draw(null); api.health().then(draw).catch(() => draw(null));
    const fileIn = h("input", { type: "file", accept: "application/json", hidden: true, onchange: async e => {
      try { replacePrefs(JSON.parse(await e.target.files[0].text())); rerender(); toast(t("set.saved")); } catch { /* ignore */ }
    } });
    return [
      group(null, box),
      group(null, h("div", { class: "btn-row" },
        h("button", { class: "btn btn-ghost", html: `${icon("download", 16)} ${esc(t("set.export"))}`, onclick: () => download("toughening-console-settings.json", JSON.stringify(prefs, null, 2), "application/json") }),
        h("button", { class: "btn btn-ghost", html: `${icon("upload", 16)} ${esc(t("set.import"))}`, onclick: () => fileIn.click() }), fileIn,
        h("button", { class: "btn btn-danger", html: `${icon("refresh", 16)} ${esc(t("set.reset"))}`, onclick: () => { replacePrefs({}); rerender(); toast(t("set.resetDone")); } }))),
    ];
  },
  device() {
    return [h("div", { class: "locked" },
      h("div", { class: "locked-ic", html: icon("lock", 30) }),
      h("h3", {}, t("set.locked.title")),
      h("p", {}, t("set.locked.body")),
      h("div", { class: "locked-fields", html: ["Calibration · 0–5 V", "Valid window", "Polarity", "Hysteresis / Debounce"].map(x => `<span>${esc(x)}</span>`).join("") }))];
  },
};

export function settingsPage(root, params) {
  let tab = TABS.some(x => x.id === params[0]) ? params[0] : "appearance";
  root.innerHTML = `<div class="settings-layout"><nav class="card set-nav" id="nav"></nav><section class="set-pane" id="pane"></section></div>`;
  const nav = root.querySelector("#nav"), pane = root.querySelector("#pane");
  rerender = () => {
    nav.innerHTML = TABS.map(x => `<a href="#/settings/${x.id}" class="set-tab${x.id === tab ? " on" : ""}">${icon(x.icon, 18)}<span>${esc(t(`set.${x.id}`))}</span>${x.id === "device" ? icon("lock", 14) : ""}</a>`).join("");
    pane.innerHTML = "";
    const card = h("div", { class: "card set-card" },
      h("div", { class: "card-head" }, h("div", { class: "title-block" }, h("p", { class: "eyebrow" }, t("page.settings")), h("h2", {}, t(`set.${tab}`)))),
      ...PANES[tab]());
    pane.appendChild(card);
  };
  rerender();
  return () => { rerender = () => {}; };
}
