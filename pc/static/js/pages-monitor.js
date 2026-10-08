// Dashboard and Station pages.
import { prefs, t, h, num, int, pad2, fmtTime, fmtDateTime, fmtDuration, ago, stationName, esc, download } from "./core.js";
import { icon } from "./icons.js";
import { api, live, onLive, isStale, stationLive, stationState, STATION_IDS } from "./store.js";
import { sparkline } from "./chart.js";
import { historyPanel, liveDetail, makeRange, resolveRange, statePill, cssVar } from "./components.js";

let selected = Number(sessionStorage.getItem("toughening.selected")) || 1;
function select(id) { selected = id; sessionStorage.setItem("toughening.selected", String(id)); }

// --------------------------------------------------------- status rail
function railHTML() {
  const p = live.last;
  const reporting = STATION_IDS.filter(id => stationState(id) !== "offline").length;
  const link = live.ws !== "connected" ? live.ws : isStale() ? "stale" : "connected";
  const linkTxt = { connected: t("conn.connected"), connecting: t("conn.connecting"), disconnected: t("conn.disconnected"), stale: t("conn.stale") }[link];
  const alarm = p?.alarm_state || null, warn = p?.warning_state || null;
  const cell = (cls, ic, label, value, sub = "") =>
    `<div class="rail-cell ${cls}"><span class="rail-ic">${icon(ic, 18)}</span><div><span>${esc(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div></div>`;
  return [
    cell(`link-${link}`, "link", t("kpi.link"), esc(linkTxt), live.lastAt ? esc(ago(live.lastAt)) : ""),
    cell("reporting", "layers", t("kpi.reporting"), `${int(reporting)}<small> / ${int(16)}</small>`),
    cell((p?.invalid_channel_count_now || 0) > 0 ? "warn" : "", "activity", t("kpi.invalid"), int(p ? p.invalid_channel_count_now ?? 0 : null)),
    cell(alarm === "active" ? "danger" : "", "alert", t("kpi.alarm"), esc(alarm ? t(`state.${alarm}`) : "—")),
    cell(warn === "active" ? "warn" : "", "events", t("kpi.warning"), esc(warn ? t(`state.${warn}`) : "—")),
    cell(p?.data_loss_pending ? "warn" : "", "database", t("kpi.dataloss"), esc(p ? (p.data_loss_pending ? t("state.pending") : t("state.none")) : "—")),
    cell("clock", "calendar", t("kpi.updated"), esc(live.lastAt ? fmtTime(live.lastAt) : "—")),
  ].join("");
}

// ------------------------------------------------------- station card
function cardHTML(id, ov) {
  const st = stationState(id);
  const s = stationLive(id);
  const nz = n => (s?.nozzles || []).find(z => Number(z.nozzle_id) === n);
  const row = n => {
    const z = nz(n);
    return `<div class="sc-row${n === 2 ? " minor" : ""}"><span class="sc-n">N${pad2(n)}</span><span class="sc-p">${num(z?.converted_pressure, 2)}<small>${esc(prefs.pUnit)}</small></span><span class="sc-t">${num(z?.converted_temperature, 0)}<small>${esc(prefs.tUnit)}</small></span></div>`;
  };
  const spark = prefs.spark ? `<div class="sc-spark">${sparkline((ov?.spark || []).map(x => x.p), { color: cssVar("--accent") })}</div>` : "";
  return `<button class="station-card st-${st}${id === selected ? " selected" : ""}" data-id="${id}" aria-pressed="${id === selected}">
    <span class="sc-edge"></span>
    <div class="sc-top"><span class="sc-no">${pad2(id)}</span>${statePill(st)}</div>
    <div class="sc-name">${esc(stationName(id))}</div>
    <div class="sc-vals">${row(1)}${prefs.secondNozzle ? row(2) : ""}</div>
    ${spark}
    <div class="sc-foot"><span>${icon("layers", 13)} ${int(ov?.cycle_count ?? 0)} ${esc(t("stat.cycles"))}</span><span>${ov?.last_cycle_ms ? esc(ago(ov.last_cycle_ms)) : "—"}</span></div>
  </button>`;
}

export function dashboardPage(root) {
  const range = makeRange();
  let overview = null;
  root.innerHTML = `
    <section class="rail" id="rail"></section>
    <section class="block">
      <div class="block-head"><div><p class="eyebrow">${esc(t("line.hint"))}</p><h2>${esc(t("grid.title"))}</h2></div>
        <div class="legend-states">${["healthy", "attention", "unconfigured", "offline"].map(statePill).join("")}</div></div>
      <div class="station-grid cols-${prefs.columns}" id="grid"></div>
    </section>
    <section class="split">
      <div class="card history-card" id="history"></div>
      <aside class="card live-card" id="live-detail"></aside>
    </section>`;
  const rail = root.querySelector("#rail"), grid = root.querySelector("#grid"), detail = root.querySelector("#live-detail");
  const ovFor = id => overview?.stations?.find(s => s.station_id === id);

  function drawGrid() { grid.innerHTML = STATION_IDS.map(id => cardHTML(id, ovFor(id))).join(""); }
  function drawDetail() {
    detail.innerHTML = liveDetail(selected) +
      `<a class="btn btn-ghost btn-block" href="#/stations/${selected}">${icon("external", 16)} ${esc(t("detail.open"))}</a>`;
  }
  grid.addEventListener("click", e => {
    const card = e.target.closest(".station-card"); if (!card) return;
    select(Number(card.dataset.id)); drawGrid(); drawDetail(); panel.update(selected);
  });

  async function loadOverview() {
    const w = resolveRange({ key: "12h" });
    try { overview = await api.overview(w.since, w.until); } catch { overview = null; }
    drawGrid();
  }

  const panel = historyPanel(root.querySelector("#history"), { stationId: selected, range, height: 330 });
  rail.innerHTML = railHTML(); drawGrid(); drawDetail(); loadOverview();
  const off = onLive(() => { rail.innerHTML = railHTML(); drawGrid(); drawDetail(); panel.syncState(); });
  const timer = setInterval(() => { loadOverview(); panel.refresh(); }, prefs.refreshSec * 1000);
  return () => { off(); clearInterval(timer); panel.destroy(); };
}

// --------------------------------------------------------- station page
export function stationPage(root, params) {
  if (params[0]) select(Math.min(16, Math.max(1, Number(params[0]) || 1)));
  const range = makeRange();
  let page = 0; const PER = 12; let points = [];
  root.innerHTML = `
    <div class="station-layout">
      <nav class="card station-list" id="list"></nav>
      <div class="station-main">
        <div class="card history-card" id="history"></div>
        <div class="split narrow">
          <div class="card" id="cycles"></div>
          <aside class="card live-card" id="live-detail"></aside>
        </div>
      </div>
    </div>`;
  const list = root.querySelector("#list"), cycles = root.querySelector("#cycles"), detail = root.querySelector("#live-detail");

  function drawList() {
    list.innerHTML = STATION_IDS.map(id => {
      const st = stationState(id);
      return `<a href="#/stations/${id}" class="sl-item st-${st}${id === selected ? " on" : ""}"><span class="sl-no">${pad2(id)}</span><span class="sl-name">${esc(stationName(id))}</span><i class="dot dot-${st}"></i></a>`;
    }).join("");
  }
  function drawCycles() {
    const rows = points.slice().reverse();
    const pages = Math.max(1, Math.ceil(rows.length / PER));
    page = Math.min(page, pages - 1);
    const slice = rows.slice(page * PER, page * PER + PER);
    const nz = (p, n) => (p.nozzles || []).find(z => Number(z.nozzle_id) === n) || {};
    cycles.innerHTML = `
      <div class="card-head"><div class="title-block"><p class="eyebrow">${esc(t("type.cycle_summary"))}</p><h3>${int(rows.length)} ${esc(t("stat.cycles"))}</h3></div>
        <button class="btn btn-ghost btn-sm" id="exp">${icon("download", 15)} ${esc(t("action.exportStation"))}</button></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>${esc(t("table.time"))}</th><th>${esc(t("table.duration"))}</th><th>${esc(t("pressure"))} N01</th><th>${esc(t("temperature"))} N01</th>${prefs.secondNozzle ? `<th>${esc(t("pressure"))} N02</th><th>${esc(t("temperature"))} N02</th>` : ""}<th>${esc(t("table.faults"))}</th></tr></thead>
        <tbody>${slice.length ? slice.map(p => {
          const a = nz(p, 1), b = nz(p, 2);
          const cell = (z, k, d) => `<td class="num">${num(z[`${k}_avg`], d)}<small>${num(z[`${k}_min`], d)}–${num(z[`${k}_max`], d)}</small></td>`;
          return `<tr><td>${esc(fmtDateTime(p.t))}</td><td class="num">${esc(fmtDuration(p.duration_ms))}</td>${cell(a, "pressure", 2)}${cell(a, "temperature", 1)}${prefs.secondNozzle ? cell(b, "pressure", 2) + cell(b, "temperature", 1) : ""}<td class="num">${p.faulted_channel_count ? `<span class="pill pill-attention"><i></i>${int(p.faulted_channel_count)}</span>` : int(0)}</td></tr>`;
        }).join("") : `<tr><td colspan="7" class="empty">${esc(t("table.empty"))}</td></tr>`}</tbody></table></div>
      <div class="pager"><button class="btn btn-ghost btn-sm" id="prev" ${page === 0 ? "disabled" : ""}>${esc(t("action.prev"))}</button><span>${int(page + 1)} / ${int(pages)}</span><button class="btn btn-ghost btn-sm" id="next" ${page >= pages - 1 ? "disabled" : ""}>${esc(t("action.next"))}</button></div>`;
    cycles.querySelector("#prev").onclick = () => { page--; drawCycles(); };
    cycles.querySelector("#next").onclick = () => { page++; drawCycles(); };
    cycles.querySelector("#exp").onclick = () => {
      const head = ["time_ms", "time_source", "duration_ms", "faulted_channel_count", "nozzle_id", "pressure_avg", "pressure_min", "pressure_max", "temperature_avg", "temperature_min", "temperature_max"];
      const lines = [head.join(",")];
      points.forEach(p => (p.nozzles || []).forEach(z => lines.push([p.t, p.time_source, p.duration_ms ?? "", p.faulted_channel_count ?? "", z.nozzle_id, z.pressure_avg ?? "", z.pressure_min ?? "", z.pressure_max ?? "", z.temperature_avg ?? "", z.temperature_min ?? "", z.temperature_max ?? ""].join(","))));
      download(`station-${pad2(selected).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))}-history.csv`, "\uFEFF" + lines.join("\n"), "text/csv");
    };
  }
  function drawDetail() { detail.innerHTML = liveDetail(selected); }

  const panel = historyPanel(root.querySelector("#history"), {
    stationId: selected, range, height: 380,
    onData: d => { points = d?.points || []; drawCycles(); },
  });
  drawList(); drawDetail(); drawCycles();
  const off = onLive(() => { drawList(); drawDetail(); panel.syncState(); });
  const timer = setInterval(() => panel.refresh(), prefs.refreshSec * 1000);
  return () => { off(); clearInterval(timer); panel.destroy(); };
}
