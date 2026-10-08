// Shared UI pieces: range control, history panel, live nozzle detail.
import { prefs, t, h, num, int, pad2, fmtDateTime, fmtDuration, ago, stationName, rangeHours, RANGES, esc } from "./core.js";
import { icon } from "./icons.js";
import { api, stationLive, stationState } from "./store.js";
import { renderChart } from "./chart.js";

let probe = null;
export function cssVar(name) {
  // Resolve through a probe so color-mix()/var() chains become plain rgb().
  if (!probe) { probe = document.createElement("span"); probe.style.display = "none"; document.body.appendChild(probe); }
  probe.style.color = `var(${name})`;
  return getComputedStyle(probe).color;
}

export function statePill(state) {
  return `<span class="pill pill-${state}"><i></i>${esc(t(`state.${state}`))}</span>`;
}

// ------------------------------------------------------------ range
export function makeRange(initialKey = prefs.defaultRange) {
  return { key: initialKey, since: null, until: null };
}

export function resolveRange(r) {
  if (r.key === "custom" && r.since && r.until) return { since: r.since, until: r.until };
  const until = Date.now();
  return { since: until - rangeHours(r.key) * 3600e3, until };
}

function toLocalInput(ms) {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function rangeControl(range, onChange) {
  const wrap = h("div", { class: "range" });
  const seg = h("div", { class: "seg", role: "tablist" });
  [...RANGES.map(r => r.key), "custom"].forEach(key => {
    seg.appendChild(h("button", {
      class: range.key === key ? "on" : "", role: "tab", "aria-selected": range.key === key,
      onclick: () => {
        if (key === "custom") {
          const w = resolveRange(range);
          range.key = "custom"; range.since = w.since; range.until = w.until;
        } else { range.key = key; }
        onChange(); 
      },
    }, t(`range.${key}`)));
  });
  wrap.appendChild(seg);
  if (range.key === "custom") {
    const w = resolveRange(range);
    const from = h("input", { type: "datetime-local", value: toLocalInput(w.since) });
    const to = h("input", { type: "datetime-local", value: toLocalInput(w.until) });
    wrap.appendChild(h("div", { class: "custom-range" },
      h("label", {}, t("range.from"), from), h("label", {}, t("range.to"), to),
      h("button", { class: "btn btn-sm btn-accent", onclick: () => {
        const a = new Date(from.value).getTime(), b = new Date(to.value).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && a < b) { range.since = a; range.until = b; onChange(); }
      } }, t("range.apply"))));
  }
  return wrap;
}

export function rangeLabel(range) {
  if (range.key === "custom") {
    const w = resolveRange(range);
    return `${fmtDateTime(w.since)} → ${fmtDateTime(w.until)}`;
  }
  return t("range.last", { n: t(`range.${range.key}`) });
}

// ------------------------------------------------------- history data
export function seriesFrom(points) {
  const accent = cssVar("--accent"), accent2 = cssVar("--accent-2");
  const heat = cssVar("--heat"), heat2 = cssVar("--heat-2");
  const pick = (nz, key) => points.map(p => {
    const n = (p.nozzles || []).find(z => Number(z.nozzle_id) === nz) || {};
    return { t: p.t, v: n[`${key}_avg`], lo: n[`${key}_min`], hi: n[`${key}_max`] };
  });
  const s = [
    { id: "p1", label: `${t("pressure")} · ${t("nozzle")} ${pad2(1)}`, color: accent, axis: "left", unit: prefs.pUnit, points: pick(1, "pressure"), band: true, fill: true },
    { id: "t1", label: `${t("temperature")} · ${t("nozzle")} ${pad2(1)}`, color: heat, axis: "right", unit: prefs.tUnit, points: pick(1, "temperature"), band: true },
  ];
  if (prefs.secondNozzle) {
    s.splice(1, 0, { id: "p2", label: `${t("pressure")} · ${t("nozzle")} ${pad2(2)}`, color: accent2, axis: "left", unit: prefs.pUnit, points: pick(2, "pressure"), dashed: true });
    s.push({ id: "t2", label: `${t("temperature")} · ${t("nozzle")} ${pad2(2)}`, color: heat2, axis: "right", unit: prefs.tUnit, points: pick(2, "temperature"), dashed: true });
  }
  return s.map(x => ({ ...x, points: x.points.filter(p => p.v !== null && p.v !== undefined) }));
}

export function stats(series) {
  const v = series.points.map(p => p.v).filter(Number.isFinite);
  if (!v.length) return { min: null, avg: null, max: null };
  return { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length };
}

// ------------------------------------------------------ history panel
/**
 * Mounts a chart card for one station. Returns { update(stationId) , refresh() }.
 */
export function historyPanel(host, { stationId, range, height = 340, onData, compact = false }) {
  const state = { stationId, data: null, hidden: new Set(["p2", "t2"]), seq: 0 };
  host.innerHTML = "";
  const head = h("div", { class: "card-head" });
  const legend = h("div", { class: "legend" });
  const chartBox = h("div", { class: "chart-box" });
  const statsRow = h("div", { class: "stat-strip" });
  const foot = h("div", { class: "chart-foot" });
  host.append(head, legend, chartBox, statsRow, foot);

  function drawHead() {
    head.innerHTML = "";
    const st = stationState(state.stationId);
    head.append(
      h("div", { class: "title-block" },
        h("p", { class: "eyebrow" }, `${t("chart.title")} · ${rangeLabel(range)}`),
        h("h2", { html: `<span class="st-no">${pad2(state.stationId)}</span>${esc(stationName(state.stationId))} <span class="hp-state">${statePill(st)}</span>` })),
      rangeControl(range, () => { drawHead(); load(); }));
  }

  function draw() {
    const w = resolveRange(range);
    const pts = state.data?.points || [];
    const series = seriesFrom(pts);
    legend.innerHTML = "";
    series.forEach(s => {
      legend.appendChild(h("button", {
        class: `legend-item${state.hidden.has(s.id) ? " off" : ""}`,
        onclick: () => { state.hidden.has(s.id) ? state.hidden.delete(s.id) : state.hidden.add(s.id); draw(); },
      }, h("i", { class: s.dashed ? "dashed" : "", style: { background: s.color, color: s.color } }), s.label));
    });
    const shown = series.filter(s => !state.hidden.has(s.id));
    if (!pts.length) {
      chartBox.innerHTML = `<div class="chart-empty" style="height:${height}px">${icon("activity", 28)}<b>${esc(t("chart.empty"))}</b><small>${esc(rangeLabel(range))}</small></div>`;
    } else {
      renderChart(chartBox, { since: w.since, until: w.until, series: shown, height });
    }
    const p1 = stats(series.find(s => s.id === "p1") || { points: [] });
    const t1 = stats(series.find(s => s.id === "t1") || { points: [] });
    const faults = pts.filter(p => (p.faulted_channel_count || 0) > 0).length;
    const last = pts.at(-1);
    const cell = (label, value, unit, cls = "") => h("div", { class: `stat ${cls}` }, h("span", {}, label), h("b", {}, value, unit ? h("small", {}, ` ${unit}`) : null));
    statsRow.innerHTML = "";
    statsRow.append(
      h("div", { class: "stat-group" }, h("span", { class: "stat-title", html: `${icon("gauge", 15)} ${esc(t("pressure"))}` }),
        cell(t("stat.min"), num(p1.min, 2), prefs.pUnit), cell(t("stat.avg"), num(p1.avg, 2), prefs.pUnit, "em"), cell(t("stat.max"), num(p1.max, 2), prefs.pUnit)),
      h("div", { class: "stat-group heat" }, h("span", { class: "stat-title", html: `${icon("thermo", 15)} ${esc(t("temperature"))}` }),
        cell(t("stat.min"), num(t1.min, 1), prefs.tUnit), cell(t("stat.avg"), num(t1.avg, 1), prefs.tUnit, "em"), cell(t("stat.max"), num(t1.max, 1), prefs.tUnit)),
      h("div", { class: "stat-group plain" },
        cell(t("stat.cycles"), int(state.data?.total_points ?? pts.length)),
        cell(t("stat.faults"), int(faults), null, faults ? "warn" : ""),
        cell(t("stat.lastCycle"), last ? ago(last.t) : "—")));
    foot.innerHTML = "";
    if (pts.some(p => p.time_source === "pc")) foot.appendChild(h("span", { class: "note", html: `${icon("info", 14)} ${esc(t("chart.pcTime"))}` }));
    if (state.data?.downsampled) foot.appendChild(h("span", { class: "note", html: `${icon("info", 14)} ${esc(t("chart.downsampled"))}` }));
    onData?.(state.data);
  }

  async function load() {
    const seq = ++state.seq;
    const w = resolveRange(range);
    if (!state.data) chartBox.innerHTML = `<div class="chart-empty loading" style="height:${height}px"><span class="spinner"></span>${esc(t("chart.loading"))}</div>`;
    try {
      const data = await api.history(state.stationId, w.since, w.until);
      if (seq !== state.seq) return;
      state.data = data;
    } catch {
      if (seq !== state.seq) return;
      state.data = { points: [], total_points: 0 };
    }
    draw();
  }

  const ro = new ResizeObserver(() => { if (state.data) draw(); });
  ro.observe(chartBox);
  drawHead(); load();
  return {
    update(id) { state.stationId = id; state.data = null; drawHead(); load(); },
    refresh() { load(); },
    redrawHead: drawHead,
    syncState() { const el = head.querySelector(".hp-state"); if (el) el.innerHTML = statePill(stationState(state.stationId)); },
    destroy() { ro.disconnect(); },
  };
}

// ---------------------------------------------------- live detail card
export function liveDetail(stationId) {
  const s = stationLive(stationId);
  const st = stationState(stationId);
  const nozzles = s?.nozzles?.length ? s.nozzles : [{ nozzle_id: 1 }, { nozzle_id: 2 }];
  const rows = nozzles.filter(n => prefs.secondNozzle || Number(n.nozzle_id) === 1).map(n => {
    const cs = st === "offline" ? "offline" : (n.channel_state === "out_of_range" ? "attention" : n.channel_state === "valid" ? "healthy" : n.channel_state ? "unconfigured" : "offline");
    return `<div class="nz">
      <div class="nz-head"><b>${esc(t("nozzle"))} ${pad2(n.nozzle_id ?? 1)}</b>${statePill(cs)}</div>
      <div class="nz-grid">
        <div class="nz-cell"><span>${icon("gauge", 14)} ${esc(t("pressure"))}</span><b>${num(n.converted_pressure, 2)}<small> ${esc(prefs.pUnit)}</small></b><em>${esc(t("raw"))} ${num(n.raw_pressure_voltage, 3)} V</em></div>
        <div class="nz-cell heat"><span>${icon("thermo", 14)} ${esc(t("temperature"))}</span><b>${num(n.converted_temperature, 1)}<small> ${esc(prefs.tUnit)}</small></b><em>${esc(t("raw"))} ${num(n.raw_temperature_voltage, 3)} V</em></div>
      </div></div>`;
  }).join("");
  return `<div class="card-head"><div class="title-block"><p class="eyebrow">${esc(t("detail.live"))}</p><h3>${esc(stationName(stationId))}</h3></div><span class="big-no">${pad2(stationId)}</span></div>${rows}`;
}
