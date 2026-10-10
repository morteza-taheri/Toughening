// Live state (from /ws/gui) and read-API helpers.
import { prefs } from "./core.js";

export const STATION_IDS = Array.from({ length: 16 }, (_, i) => i + 1);

export const live = {
  ws: "connecting",      // connecting | connected | disconnected  (browser <-> PC)
  last: null,            // last live_state payload
  lastAt: 0,             // PC time the last live_state arrived
  messages: 0,
  device: null,          // /api/device/status snapshot (ESP32 <-> PC link)
};

const subs = new Set();
export function onLive(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { subs.forEach(fn => { try { fn(live); } catch (e) { console.error(e); } }); }

export function isStale() {
  return !live.lastAt || Date.now() - live.lastAt > prefs.staleSec * 1000;
}

// Combined link state shown everywhere in the console. Before this fix the
// console only knew whether ITS OWN socket to the PC was open, so it showed
// "connected" while the ESP32 was actually offline.
export function linkState() {
  if (live.ws !== "connected") return live.ws;
  if (live.device && !live.device.connected) return "nodevice";
  return isStale() ? "stale" : "connected";
}

async function pollDevice() {
  try {
    const r = await fetch("/api/device/status", { cache: "no-store" });
    if (r.ok) { live.device = await r.json(); emit(); }
  } catch { /* server unreachable: live.ws reports it */ }
}
pollDevice();
setInterval(pollDevice, 3000);

export function stationLive(id) {
  const s = live.last?.stations?.find(x => Number(x.station_id) === id);
  return s || null;
}

export function stationState(id) {
  const s = stationLive(id);
  if (!s || isStale()) return "offline";
  const ns = Array.isArray(s.nozzles) ? s.nozzles : [];
  if (!ns.length) return "offline";
  if (ns.some(n => n.channel_state === "out_of_range")) return "attention";
  if (ns.every(n => n.channel_state === "unconfigured")) return "unconfigured";
  return "healthy";
}

let reconnectMs = 1000;
export function connectLive() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let sock;
  try { sock = new WebSocket(`${proto}://${location.host}/ws/gui`); }
  catch { live.ws = "disconnected"; emit(); return; }
  live.ws = "connecting"; emit();
  sock.onopen = () => { live.ws = "connected"; reconnectMs = 1000; emit(); };
  sock.onmessage = ev => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "live_state") {
        live.last = m.payload || m;
        live.lastAt = Date.now();
        live.messages += 1;
        emit();
      }
    } catch { /* ignore malformed frame */ }
  };
  sock.onclose = () => {
    live.ws = "disconnected"; emit();
    setTimeout(connectLive, reconnectMs);
    reconnectMs = Math.min(reconnectMs * 2, 15000);
  };
}

// Re-render "stale" transitions even when no frame arrives.
setInterval(emit, 2000);

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function windowQS(since, until) {
  return `since=${Math.round(since)}&until=${Math.round(until)}`;
}

export const api = {
  health: () => getJSON("/health"),
  device: () => getJSON("/api/device/status"),
  overview: (since, until) => getJSON(`/api/stations/overview?${windowQS(since, until)}`),
  history: (id, since, until) => getJSON(`/api/stations/${id}/history?${windowQS(since, until)}`),
  events: (since, until, types) =>
    getJSON(`/api/events?${windowQS(since, until)}${types?.length ? `&types=${types.join(",")}` : ""}&limit=2000`),
  summary: (since, until) => getJSON(`/api/summary?${windowQS(since, until)}`),
  exportJSON: () => getJSON("/api/export/json"),
};
