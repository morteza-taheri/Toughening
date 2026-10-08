// Dependency-free SVG time-series chart (dual axis, min–max band, crosshair).
import { num, fmtTime, fmtShortDate, esc } from "./core.js";

const NS = "http://www.w3.org/2000/svg";
const STEPS = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map(m => m * 60000);

function niceRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const span = max - min, pad = span * 0.12;
  return [min - pad, max + pad];
}

function ticks(min, max, n = 5) {
  const raw = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return { values: out, step };
}

function decimalsFor(step) { return step >= 1 ? 0 : step >= 0.1 ? 1 : 2; }

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function segments(points, maxGap) {
  const segs = []; let cur = [];
  points.forEach((p, i) => {
    if (!Number.isFinite(p.v)) { if (cur.length) segs.push(cur); cur = []; return; }
    if (cur.length && p.t - points[i - 1].t > maxGap) { segs.push(cur); cur = []; }
    cur.push(p);
  });
  if (cur.length) segs.push(cur);
  return segs;
}

function medianGap(points) {
  const g = [];
  for (let i = 1; i < points.length; i++) g.push(points[i].t - points[i - 1].t);
  g.sort((a, b) => a - b);
  return g.length ? g[Math.floor(g.length / 2)] : Infinity;
}

/**
 * opts: { since, until, series: [{label, color, axis, unit, points:[{t,v,lo,hi}]}],
 *         leftLabel, rightLabel, height }
 */
export function renderChart(host, opts) {
  host.innerHTML = "";
  host.classList.add("chart-host");
  host.setAttribute("dir", "ltr");
  const W = Math.max(320, host.clientWidth || 800);
  const H = opts.height || 340;
  const m = { l: 56, r: 56, t: 18, b: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "chart-svg" });
  host.appendChild(svg);

  const x = tv => m.l + ((tv - opts.since) / (opts.until - opts.since)) * iw;
  const axes = {};
  for (const side of ["left", "right"]) {
    const vals = opts.series.filter(s => s.axis === side).flatMap(s =>
      s.points.flatMap(p => [p.v, p.lo, p.hi]).filter(Number.isFinite));
    if (!vals.length) continue;
    const [lo, hi] = niceRange(Math.min(...vals), Math.max(...vals));
    const tk = ticks(lo, hi);
    axes[side] = { lo, hi, tk, y: v => m.t + ih - ((v - lo) / (hi - lo)) * ih };
  }

  // grid + y ticks
  const g = el("g", { class: "chart-grid" });
  svg.appendChild(g);
  const primary = axes.left || axes.right;
  if (primary) {
    primary.tk.values.forEach(v => {
      const yy = primary.y(v);
      if (yy < m.t - 1 || yy > m.t + ih + 1) return;
      g.appendChild(el("line", { x1: m.l, x2: m.l + iw, y1: yy, y2: yy }));
    });
  }
  for (const side of ["left", "right"]) {
    const a = axes[side]; if (!a) continue;
    const d = decimalsFor(a.tk.step);
    a.tk.values.forEach(v => {
      const yy = a.y(v);
      if (yy < m.t - 1 || yy > m.t + ih + 1) return;
      const tx = el("text", { x: side === "left" ? m.l - 10 : m.l + iw + 10, y: yy + 4,
        class: `tick tick-${side}`, "text-anchor": side === "left" ? "end" : "start" });
      tx.textContent = num(v, d); g.appendChild(tx);
    });
  }
  // x ticks
  const span = opts.until - opts.since;
  const step = STEPS.find(s => span / s <= Math.max(3, Math.floor(iw / 110))) || STEPS.at(-1);
  const tz = new Date().getTimezoneOffset() * 60000;
  for (let tv = Math.ceil((opts.since - tz) / step) * step + tz; tv <= opts.until; tv += step) {
    const xx = x(tv);
    g.appendChild(el("line", { x1: xx, x2: xx, y1: m.t, y2: m.t + ih, class: "vgrid" }));
    const tx = el("text", { x: xx, y: H - 10, class: "tick", "text-anchor": "middle" });
    tx.textContent = step >= 1440 * 60000 ? fmtShortDate(tv) : fmtTime(tv, false);
    g.appendChild(tx);
  }
  g.appendChild(el("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih, class: "baseline" }));

  // series
  const defs = el("defs", {}); svg.appendChild(defs);
  opts.series.forEach((s, si) => {
    const a = axes[s.axis]; if (!a || !s.points.length) return;
    const gap = Math.max(medianGap(s.points) * 3.5, 60000);
    const segs = segments(s.points, gap);
    const gid = `fill-${si}-${Math.random().toString(36).slice(2, 7)}`;
    const lg = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(el("stop", { offset: "0", "stop-color": s.color, "stop-opacity": s.fill ? 0.28 : 0 }));
    lg.appendChild(el("stop", { offset: "1", "stop-color": s.color, "stop-opacity": 0 }));
    defs.appendChild(lg);
    segs.forEach(seg => {
      const band = seg.filter(p => Number.isFinite(p.lo) && Number.isFinite(p.hi));
      if (s.band && band.length > 1) {
        const top = band.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${a.y(p.hi).toFixed(1)}`).join("");
        const bot = band.slice().reverse().map(p => `L${x(p.t).toFixed(1)},${a.y(p.lo).toFixed(1)}`).join("");
        svg.appendChild(el("path", { d: `${top}${bot}Z`, fill: s.color, "fill-opacity": 0.09, class: "band" }));
      }
      const line = seg.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${a.y(p.v).toFixed(1)}`).join("");
      if (s.fill && seg.length > 1) {
        svg.appendChild(el("path", {
          d: `${line}L${x(seg.at(-1).t).toFixed(1)},${m.t + ih}L${x(seg[0].t).toFixed(1)},${m.t + ih}Z`,
          fill: `url(#${gid})` }));
      }
      svg.appendChild(el("path", { d: line, stroke: s.color, class: `line${s.dashed ? " dashed" : ""}` }));
      if (seg.length < 40) seg.forEach(p => svg.appendChild(el("circle", {
        cx: x(p.t), cy: a.y(p.v), r: 2.6, fill: s.color, class: "dot" })));
    });
  });

  // crosshair + tooltip
  const cross = el("line", { y1: m.t, y2: m.t + ih, class: "cross", visibility: "hidden" });
  svg.appendChild(cross);
  const marks = opts.series.map(s => { const c = el("circle", { r: 4.5, fill: s.color, class: "mark", visibility: "hidden" }); svg.appendChild(c); return c; });
  const tip = document.createElement("div");
  tip.className = "chart-tip"; host.appendChild(tip);
  const allT = [...new Set(opts.series.flatMap(s => s.points.map(p => p.t)))].sort((a, b) => a - b);

  svg.addEventListener("pointermove", ev => {
    if (!allT.length) return;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    if (px < m.l || px > m.l + iw) { hide(); return; }
    const tv = opts.since + ((px - m.l) / iw) * span;
    let best = allT[0];
    for (const c of allT) if (Math.abs(c - tv) < Math.abs(best - tv)) best = c;
    const xx = x(best);
    cross.setAttribute("x1", xx); cross.setAttribute("x2", xx); cross.setAttribute("visibility", "visible");
    let rows = "";
    opts.series.forEach((s, i) => {
      const p = s.points.find(q => q.t === best); const a = axes[s.axis];
      if (!p || !Number.isFinite(p.v) || !a) { marks[i].setAttribute("visibility", "hidden"); return; }
      marks[i].setAttribute("cx", xx); marks[i].setAttribute("cy", a.y(p.v)); marks[i].setAttribute("visibility", "visible");
      const range = Number.isFinite(p.lo) ? `<small>${num(p.lo, 2)} – ${num(p.hi, 2)}</small>` : "";
      rows += `<div class="tip-row"><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${num(p.v, 2)} ${esc(s.unit || "")}</b>${range}</div>`;
    });
    tip.innerHTML = `<div class="tip-time">${fmtShortDate(best)} · ${fmtTime(best)}</div>${rows}`;
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    const left = (xx / W) * host.clientWidth;
    tip.style.left = `${Math.min(Math.max(8, left + 14 + tw > host.clientWidth ? left - tw - 14 : left + 14), host.clientWidth - tw - 8)}px`;
    tip.style.top = `${m.t + 6}px`;
  });
  function hide() { cross.setAttribute("visibility", "hidden"); marks.forEach(c => c.setAttribute("visibility", "hidden")); tip.style.display = "none"; }
  svg.addEventListener("pointerleave", hide);
  return { width: W };
}

export function sparkline(values, { w = 160, h = 34, color = "currentColor" } = {}) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return `<svg class="spark" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" x2="${w}" y1="${h - 2}" y2="${h - 2}" class="spark-empty"/></svg>`;
  const lo = Math.min(...v), hi = Math.max(...v), d = hi - lo || 1;
  const pts = v.map((val, i) => [(i / (v.length - 1)) * w, h - 3 - ((val - lo) / d) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return `<svg class="spark" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${line}L${w},${h}L0,${h}Z" fill="${color}" fill-opacity=".12"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
