// Pure scene model for the hero: three arcs of one instant. No DOM and no
// three.js here, so `node --test tests/` can exercise it.

export const TAU = Math.PI * 2;

// The pen's bearing: the far point of the disc, the top of the box. Bearings
// follow atan2(-z, x), so slot k of an arc sits at (r cos θ, -r sin θ).
export const PEN = Math.PI / 2;

// Empty slots kept ahead of the pen on every arc: the seam where the oldest
// bar and the newest never touch, and the room the readouts sit in.
export const SEAM = 3;

// The three arcs, outer to inner. `radius` is in world units; the disc's
// outer arc is the size the camera frames to.
export const ARCS = [
  { key: 'year', name: '1 YEAR', unit: 'days', radius: 7.2 },
  { key: 'month', name: '1 MONTH', unit: 'hours', radius: 5.9 },
  { key: 'day', name: '1 DAY', unit: '5 min', radius: 4.6 }
];

// One beat, in seconds; the day arc steps one 5-minute bar per beat, the month
// arc one hourly bar every 12, the year arc one session every 78.
export const TIMING = { beat: 0.6, hourBars: 12, sessionBars: 78, print: 0.26, rest: 2.4 };

const dayMs = 86400000;
const utcDay = (label) => Date.UTC(+label.slice(0, 4), +label.slice(5, 7) - 1, +label.slice(8, 10)) / dayMs;

// The year arc is calendar time: one slot per day of the trailing year, so
// weekends and holidays stay empty and a week reads as five marks and a gap.
export function calendarSlots(rows) {
  const first = utcDay(rows[0].label), last = utcDay(rows[rows.length - 1].label);
  return { slots: (last - first + 1) + SEAM, slotOf: (i) => utcDay(rows[i].label) - first };
}

// The month arc is trading time: the bars of a session run together, one empty
// slot between sessions. Every session here has `perSession` bars.
export function sessionSlots(rows, perSession = 7) {
  const sessions = Math.ceil(rows.length / perSession);
  return { slots: sessions * (perSession + 1) + SEAM, slotOf: (i) => Math.floor(i / perSession) * (perSession + 1) + (i % perSession) + 1 };
}

// The day arc: 5-minute bars, one empty slot at each hour boundary after the
// first, so the session reads as hours.
export function intradaySlots(rows, perHour = 12) {
  const hours = Math.ceil(rows.length / perHour);
  return { slots: rows.length + (hours - 1) + SEAM, slotOf: (i) => i + Math.floor(i / perHour) };
}

// Bearing of a slot when `penSlot` sits under the pen: older slots clockwise.
export function bearingAt(slot, penSlot, slots, pen = PEN) {
  return pen - (penSlot - slot) * TAU / slots;
}

// Inverse of bearingAt, to the nearest slot, clamped to the slots on the arc.
export function slotFromBearing(theta, penSlot, slots, pen = PEN) {
  let back = (pen - theta) * slots / TAU;      // slots behind the pen, clockwise
  back = ((back % slots) + slots) % slots;
  if (back > slots - SEAM) back = 0;           // in the seam or a hair past the pen: the pen's slot
  return Math.max(0, Math.round(penSlot - back));
}

export function priceBand(rows) {
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) { if (r.low < lo) lo = r.low; if (r.high > hi) hi = r.high; }
  return { lo, hi };
}

// Height above the plane of a price, on an arc whose band spans `height` units
// above a small floor lift.
export const FLOOR = 0.04;
export function level(price, band, height) {
  return FLOOR + (price - band.lo) / (band.hi - band.lo || 1) * height;
}

// A planted candle: the wick rises from the floor to the high, the body sits at
// its price; both are drawn `glyph` times taller than the band they stand in,
// as imc.com exaggerates its candles. A doji keeps a sliver of body.
export const MIN_BODY = 0.02;
export function candle(row, band, height, glyph) {
  const perUnit = height / (band.hi - band.lo || 1) * glyph;
  const up = row.close >= row.open;
  const y0 = level(Math.min(row.open, row.close), band, height);
  return {
    up,
    body: { y0, y1: y0 + Math.max(Math.abs(row.close - row.open) * perUnit, MIN_BODY) },
    wick: { y0: 0, y1: level(row.low, band, height) + Math.max((row.high - row.low) * perUnit, MIN_BODY) }
  };
}

// How far a bar sinks toward the ground colour: 0 under the pen, `fade` for the
// oldest, on a curve that keeps the newest quarter vivid.
export function ageSink(i, n, fade = 0.72, power = 0.8) {
  const age = n > 1 ? 1 - i / (n - 1) : 0;
  return fade * Math.pow(age, power);
}

// The replay: beat k puts 5-minute bar k under the day arc's pen; the hourly
// bar that contains it is under the month arc's pen, part-way through its hour;
// the session's own daily bar stays under the year arc's pen throughout.
export function replayState(beat, counts) {
  const k = Math.max(0, Math.min(counts.day - 1, Math.floor(beat)));
  const hour = Math.floor(k / TIMING.hourBars);
  return {
    day: { pen: k },
    month: { pen: counts.month - Math.ceil(counts.day / TIMING.hourBars) + hour, fraction: (k % TIMING.hourBars) / TIMING.hourBars },
    year: { pen: counts.year - 1 }
  };
}

// The camera: a long lens at a fixed elevation, far enough that the disc's
// diameter spans most of the width; the disc's centre lands on the bottom edge
// (a small margin above it). On a narrow box the height frames instead.
export const CAMERA = { fov: 15.5, elevation: 50, width: 0.9, height: 0.85, wideAspect: 1.9, margin: 0.03, apron: 0.7 };
export function frameCamera(width, height, rOut, elevation = CAMERA.elevation, fov = CAMERA.fov) {
  const aspect = width / height;
  const t = Math.tan(fov / 2 * Math.PI / 180);
  const diameter = 2 * (rOut + CAMERA.apron);
  let distance = diameter / (CAMERA.width * 2 * t * aspect);
  const el = elevation * Math.PI / 180;
  // a box too narrow to show the whole diameter frames by height instead: the
  // pen and the top of the arcs fill it and the sides crop
  const byHeight = (rOut + CAMERA.apron) * Math.sin(el) / (CAMERA.height * 2 * t);
  if (aspect < CAMERA.wideAspect) distance = byHeight;
  const m = CAMERA.margin;
  const lookZ = (1 - m) * distance * t / (Math.sin(el) + (1 - m) * t * Math.cos(el));
  return { distance, fov, lookZ, margin: m, elevation };
}

// Which arc a radius falls on, within half a band of its centreline.
export function pickArc(radius, radii, halfBand) {
  for (let i = 0; i < radii.length; i += 1) if (Math.abs(radius - radii[i]) <= halfBand) return i;
  return -1;
}

const DOT = ' · ';
const pad = (n) => String(n).padStart(2, '0');
function plusMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

// The span a bar covers, as the readout prints it.
export const SESSION_CLOSE = '16:00';
export function barSpan(key, row) {
  if (key === 'year') return row.label;
  const start = row.label.slice(11);
  const end = plusMinutes(start, key === 'month' ? 60 : 5);
  return `${start}–${end > SESSION_CLOSE ? SESSION_CLOSE : end}`;
}

export function formatPrice(n) { return n.toFixed(2); }

export function formatReturn(close, prevClose) {
  if (!(prevClose > 0) || !Number.isFinite(prevClose) || !Number.isFinite(close)) return '';
  const percent = (close / prevClose - 1) * 100;
  const magnitude = Math.abs(percent).toFixed(2);
  const sign = percent < 0 && magnitude !== '0.00' ? '−' : '+';
  return `${sign}${magnitude} %`;
}

// The two caption lines, derived entirely from the data file.
export function captionLines(meta, windows, key, index) {
  const line1 = [meta.name, meta.session, 'a year of days', 'a month of hours', 'a day of 5-minute bars', `captured ${meta.capturedAt}`, 'not live'].join(DOT);
  const rows = windows[key];
  const row = rows[index], previous = rows[index - 1];
  const line2 = [barSpan(key, row), `O ${formatPrice(row.open)}`, `H ${formatPrice(row.high)}`, `L ${formatPrice(row.low)}`, `C ${formatPrice(row.close)}`].join(DOT)
    + (previous ? DOT + formatReturn(row.close, previous.close) : '');
  return [line1, line2];
}

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

// CSS-style cubic Bézier easing, as the ring used.
export function cubicBezier(x1, y1, x2, y2) {
  if (x1 === y1 && x2 === y2) return (t) => t;
  const a = (p1, p2) => 1 - 3 * p2 + 3 * p1, b = (p1, p2) => 3 * p2 - 6 * p1, c = (p1) => 3 * p1;
  const at = (t, p1, p2) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t, p1, p2) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) { const s = slope(t, x1, x2); if (s === 0) break; t -= (at(t, x1, x2) - x) / s; }
    if (!(t >= 0 && t <= 1) || Math.abs(at(t, x1, x2) - x) > 1e-6) {
      let lo = 0, hi = 1; t = x;
      for (let i = 0; i < 48; i += 1) { const cx = at(t, x1, x2); if (Math.abs(cx - x) < 1e-7) break; if (cx < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    }
    return at(t, y1, y2);
  };
}
export const EASE = { easeOut: cubicBezier(0, 0, 0.58, 1), easeInOut: cubicBezier(0.42, 0, 0.58, 1), camera: cubicBezier(0.37, 0, 0.17, 1) };

// Pointer parallax, as the ring had it: a lean of 2° in azimuth and 1° in
// elevation, approached with a quarter-second exponential.
export const PARALLAX = { azimuth: 2 * Math.PI / 180, elevation: Math.PI / 180, tau: 0.25 };
const clampUnit = (u) => (u < -1 ? -1 : u > 1 ? 1 : u);
export function pointerNormal(clientX, clientY, box) {
  if (!box || !(box.width > 0) || !(box.height > 0)) return { nx: 0, ny: 0 };
  return { nx: clampUnit(2 * (clientX - box.left) / box.width - 1), ny: clampUnit(1 - 2 * (clientY - box.top) / box.height) };
}
export function damp(current, target, dt, tau) {
  if (dt <= 0) return current;
  if (!(tau > 0) || !Number.isFinite(dt)) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
export { clamp01 };
