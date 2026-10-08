// Events and Reports pages.
import { prefs, t, h, num, int, pad2, fmtTime, fmtDate, fmtDateTime, stationName, esc, download } from "./core.js";
import { icon } from "./icons.js";
import { api, STATION_IDS } from "./store.js";
import { makeRange, resolveRange, rangeControl, rangeLabel } from "./components.js";

const EVENT_TYPES = ["alarm_event", "system_event", "settings_change", "interrupted_cycle", "data_loss", "raw_voltage_record"];
const EVENT_ICON = { alarm_event: "alert", system_event: "server", settings_change: "settings", interrupted_cycle: "activity", data_loss: "database", raw_voltage_record: "gauge" };
const ALL_TYPES = ["cycle_summary", ...EVENT_TYPES];

function eventDetail(e) {
  const p = e.payload || {};
  const bits = [];
  if (p.station_id) bits.push(`${stationName(p.station_id)}`);
  if (p.nozzle_id) bits.push(`${t("nozzle")} ${pad2(p.nozzle_id)}`);
  if (p.channel_id !== undefined) bits.push(`CH ${pad2(p.channel_id)}`);
  if (p.alarm_state) bits.push(`${t("kpi.alarm")}: ${t(`state.${p.alarm_state}`)}`);
  if (p.event_code) bits.push(p.event_code);
  if (p.settings_affected?.length) bits.push(p.settings_affected.join("، "));
  if (p.change_source) bits.push(p.change_source);
  if (Number.isFinite(p.raw_voltage)) bits.push(`${num(p.raw_voltage, 3)} V`);
  if (Number.isFinite(p.records_overwritten)) bits.push(`${int(p.records_overwritten)} ${t("reports.records")}`);
  if (p.status) bits.push(p.status);
  return bits.map(esc).join(" · ");
}

export function eventsPage(root) {
  const range = makeRange("24h");
  const active = new Set(EVENT_TYPES);
  let data = null;
  root.innerHTML = `<div class="card"><div class="toolbar" id="tb"></div><div id="list" class="timeline"></div></div>`;
  const tb = root.querySelector("#tb"), list = root.querySelector("#list");

  function drawToolbar() {
    tb.innerHTML = "";
    const chips = h("div", { class: "chips" });
    chips.appendChild(h("button", { class: `chip${active.size === EVENT_TYPES.length ? " on" : ""}`, onclick: () => { EVENT_TYPES.forEach(x => active.add(x)); drawToolbar(); draw(); } }, t("events.all")));
    EVENT_TYPES.forEach(type => chips.appendChild(h("button", {
      class: `chip chip-${type}${active.has(type) && active.size !== EVENT_TYPES.length ? " on" : ""}`,
      html: `${icon(EVENT_ICON[type], 15)} ${esc(t(`type.${type}`))}`,
      onclick: () => { if (active.size === EVENT_TYPES.length) { active.clear(); active.add(type); } else if (active.has(type)) { active.delete(type); if (!active.size) EVENT_TYPES.forEach(x => active.add(x)); } else active.add(type); drawToolbar(); draw(); },
    })));
    tb.append(chips, rangeControl(range, () => { drawToolbar(); load(); }));
  }

  function draw() {
    const items = (data?.events || []).filter(e => active.has(e.record_type));
    if (!items.length) {
      list.innerHTML = `<div class="empty-state">${icon("events", 30)}<b>${esc(t("events.empty"))}</b><small>${esc(rangeLabel(range))}</small></div>`;
      return;
    }
    let lastDay = "";
    list.innerHTML = `<p class="count">${esc(t("events.count", { n: int(items.length) }))}</p>` + items.map(e => {
      const day = fmtDate(e.t);
      const sep = day !== lastDay ? `<div class="tl-day">${esc(day)}</div>` : "";
      lastDay = day;
      const sev = e.record_type === "alarm_event" ? (e.payload?.alarm_state === "active" ? "danger" : "muted") : e.record_type === "data_loss" || e.record_type === "interrupted_cycle" ? "warn" : "info";
      return `${sep}<div class="tl-item sev-${sev}"><span class="tl-ic">${icon(EVENT_ICON[e.record_type], 17)}</span>
        <div class="tl-body"><div class="tl-top"><b>${esc(t(`type.${e.record_type}`))}</b><time>${esc(fmtTime(e.t))}${e.time_source === "pc" ? " · PC" : ""}</time></div>
        <div class="tl-detail">${eventDetail(e) || "&nbsp;"}</div></div></div>`;
    }).join("");
  }

  async function load() {
    const w = resolveRange(range);
    list.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
    try { data = await api.events(w.since, w.until); } catch { data = { events: [] }; }
    draw();
  }
  drawToolbar(); load();
  return () => {};
}

// ---------------------------------------------------------------- reports
export function reportsPage(root) {
  const range = makeRange("24h");
  const stations = new Set(STATION_IDS);
  const types = new Set(ALL_TYPES);
  let rows = [], summary = null;

  root.innerHTML = `<div class="report-layout">
    <aside class="card builder" id="builder"></aside>
    <section class="card report-sheet" id="sheet"></section></div>`;
  const builder = root.querySelector("#builder"), sheet = root.querySelector("#sheet");

  const recTime = r => {
    const p = r.payload || {};
    if (r.record_type === "cycle_summary" && p.end_time_valid === 1 && p.cycle_end_ms > 0) return p.cycle_end_ms;
    if (p.event_time_valid === 1 && p.event_time > 0) return p.event_time;
    return r.pc_received_ms;
  };
  function filtered() {
    const w = resolveRange(range);
    return rows.filter(r => {
      const tm = recTime(r);
      if (tm < w.since || tm > w.until || !types.has(r.record_type)) return false;
      const sid = r.payload?.station_id;
      return sid === undefined || stations.has(Number(sid));
    });
  }

  function drawBuilder() {
    builder.innerHTML = "";
    const stGrid = h("div", { class: "pick-grid" });
    STATION_IDS.forEach(id => stGrid.appendChild(h("button", {
      class: `pick${stations.has(id) ? " on" : ""}`, title: stationName(id),
      onclick: () => { stations.has(id) ? stations.delete(id) : stations.add(id); drawBuilder(); drawSheet(); },
    }, pad2(id))));
    const tyList = h("div", { class: "check-list" });
    ALL_TYPES.forEach(ty => tyList.appendChild(h("label", { class: "check" },
      h("input", { type: "checkbox", checked: types.has(ty), onchange: e => { e.target.checked ? types.add(ty) : types.delete(ty); drawSheet(); } }),
      h("span", {}, t(`type.${ty}`)))));
    const quick = (set, all) => h("div", { class: "mini-actions" },
      h("button", { class: "link-btn", onclick: () => { all.forEach(x => set.add(x)); drawBuilder(); drawSheet(); } }, t("reports.all")),
      h("button", { class: "link-btn", onclick: () => { set.clear(); drawBuilder(); drawSheet(); } }, t("reports.none")));
    builder.append(
      h("div", { class: "card-head" }, h("div", { class: "title-block" }, h("p", { class: "eyebrow" }, t("page.reports")), h("h3", {}, t("reports.builder")))),
      h("div", { class: "field" }, h("label", { class: "field-label", html: `${icon("calendar", 15)} ${esc(t("reports.period"))}` }), rangeControl(range, () => { drawBuilder(); load(); })),
      h("div", { class: "field" }, h("div", { class: "field-row" }, h("label", { class: "field-label", html: `${icon("layers", 15)} ${esc(t("reports.stations"))}` }), quick(stations, STATION_IDS)), stGrid),
      h("div", { class: "field" }, h("div", { class: "field-row" }, h("label", { class: "field-label", html: `${icon("tag", 15)} ${esc(t("reports.types"))}` }), quick(types, ALL_TYPES)), tyList),
      h("div", { class: "export-actions" },
        h("button", { class: "btn btn-accent btn-block", html: `${icon("download", 16)} ${esc(t("reports.csv"))}`, onclick: exportCSV }),
        h("div", { class: "btn-pair" },
          h("button", { class: "btn btn-ghost", html: `${icon("download", 16)} JSON`, onclick: exportJSON }),
          h("button", { class: "btn btn-ghost", html: `${icon("printer", 16)} ${esc(t("reports.print"))}`, onclick: () => window.print() }))),
      h("p", { class: "hint" }, t("reports.note")));
  }

  function drawSheet() {
    const f = filtered();
    const counts = {}; ALL_TYPES.forEach(x => { counts[x] = 0; });
    const perStation = {}; STATION_IDS.forEach(id => { perStation[id] = 0; });
    f.forEach(r => { counts[r.record_type] = (counts[r.record_type] || 0) + 1; if (r.record_type === "cycle_summary") perStation[r.payload?.station_id] = (perStation[r.payload?.station_id] || 0) + 1; });
    const maxC = Math.max(1, ...Object.values(perStation));
    const w = resolveRange(range);
    const cyc = f.filter(r => r.record_type === "cycle_summary");
    const avgOf = key => { const v = cyc.flatMap(r => (r.payload?.nozzles || []).map(z => z[key])).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    sheet.innerHTML = `
      <header class="sheet-head"><div><p class="eyebrow">${esc(t("reports.preview"))}</p><h2>${esc(t("app.name"))} · ${esc(t("page.reports"))}</h2>
        <p class="sheet-range">${esc(fmtDateTime(w.since))}  →  ${esc(fmtDateTime(w.until))}</p></div>
        <div class="sheet-total"><b>${int(f.length)}</b><span>${esc(t("reports.records"))}</span></div></header>
      <div class="sheet-kpis">
        <div><span>${esc(t("stat.cycles"))}</span><b>${int(counts.cycle_summary)}</b></div>
        <div><span>${esc(t("type.alarm_event"))}</span><b class="${counts.alarm_event ? "danger" : ""}">${int(counts.alarm_event)}</b></div>
        <div><span>${esc(t("pressure"))} · ${esc(t("stat.avg"))}</span><b>${num(avgOf("pressure_avg"), 2)}<small> ${esc(prefs.pUnit)}</small></b></div>
        <div><span>${esc(t("temperature"))} · ${esc(t("stat.avg"))}</span><b>${num(avgOf("temperature_avg"), 1)}<small> ${esc(prefs.tUnit)}</small></b></div>
      </div>
      <h4>${esc(t("reports.cyclesPerStation"))}</h4>
      <div class="bars">${STATION_IDS.map(id => `<div class="bar${stations.has(id) ? "" : " off"}" title="${esc(stationName(id))}"><span class="bar-v">${int(perStation[id])}</span><span class="bar-fill" style="height:${(perStation[id] / maxC) * 100}%"></span><span class="bar-l">${pad2(id)}</span></div>`).join("")}</div>
      <h4>${esc(t("reports.byType"))}</h4>
      <table class="table compact"><tbody>${ALL_TYPES.filter(x => types.has(x)).map(x => `<tr><td>${esc(t(`type.${x}`))}</td><td class="num">${int(counts[x])}</td><td class="bar-cell"><span style="width:${f.length ? (counts[x] / f.length) * 100 : 0}%"></span></td></tr>`).join("")}</tbody></table>
      ${f.length ? "" : `<div class="empty-state small">${icon("reports", 26)}<b>${esc(t("reports.empty"))}</b></div>`}
      <footer class="sheet-foot">${esc(t("reports.generated"))}: ${esc(fmtDateTime(Date.now()))} · PC-01 · Contract v1.1.1</footer>`;
  }

  function exportCSV() {
    const f = filtered();
    const lines = ["record_id,record_type,time_ms,pc_received_ms,station_id,payload_json"];
    f.forEach(r => lines.push([r.record_id, r.record_type, recTime(r), r.pc_received_ms, r.payload?.station_id ?? "", `"${JSON.stringify(r.payload).replace(/"/g, '""')}"`].join(",")));
    download(`toughening-report-${Date.now()}.csv`, "\uFEFF" + lines.join("\n"), "text/csv");
  }
  function exportJSON() {
    download(`toughening-report-${Date.now()}.json`, JSON.stringify(filtered(), null, 2), "application/json");
  }

  async function load() {
    sheet.innerHTML = `<div class="empty-state"><span class="spinner"></span></div>`;
    try { rows = await api.exportJSON(); } catch { rows = []; }
    drawSheet();
  }
  drawBuilder(); load();
  return () => {};
}
