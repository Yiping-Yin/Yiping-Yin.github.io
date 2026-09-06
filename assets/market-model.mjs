// Pure scene model for the hero visual: geometry, timing and easing rules.
// No DOM and no three.js here, so `node --test tests/` can exercise it.

export const TAU = Math.PI * 2;

// Height of a candle per price point, relative to its position on the price
// band. imc.com draws its glyphs 8.7x taller than the band they stand in;
// keeping the ratio (rather than a fixed 0.02/point) makes the exaggeration a
// declared constant, which is what the caption prints as `×8.7 vertical`.
export const GLYPH_RATIO = 8.7;

// Slots kept empty on the counter-clockwise side of the pen: the erase zone
// the oldest session dissolves into before it can come round again.
export const DEFAULT_APERTURE = 3;

// One slot per session, 55 of them, as on imc.com.
export const DEFAULT_SLOTS = 55;

export const COLOURS = {
  up: '#73E27F',
  down: '#DC7A88',
  accent: '#819CC6',
  blade: '#FFFFFF'
};

// Slot k sits at angle 2πk/N about +y; z is negated so the walk is
// counter-clockwise when seen from above.
export function ringPosition(radius, slots, index) {
  const t = TAU / slots * index;
  return { x: radius * Math.cos(t), y: 0, z: -radius * Math.sin(t) };
}

// Half the rows fit the ring (110 sessions, 55 slots); the price scale is
// bounded by the lows only (so the tallest candles overshoot the band).
export function seriesBounds(rows) {
  let minLow = Infinity, maxLow = -Infinity, minVolume = Infinity, maxVolume = -Infinity;
  for (const row of rows) {
    if (row.low < minLow) minLow = row.low;
    if (row.low > maxLow) maxLow = row.low;
    if (row.volume < minVolume) minVolume = row.volume;
    if (row.volume > maxVolume) maxVolume = row.volume;
  }
  return { total: rows.length, slots: Math.floor(rows.length / 2), minLow, maxLow, minVolume, maxVolume };
}

export function priceLevel(value, bounds, scale) {
  const unit = (value - bounds.minLow) / (bounds.maxLow - bounds.minLow);
  return (unit * 1.5 + 1.3) * scale;
}

// World units per price point for candle *heights*. The position scale is
// 1.5·scale over the low band; heights are that, exaggerated by GLYPH_RATIO.
export function heightPerPoint(bounds, scale) {
  return GLYPH_RATIO * 1.5 * scale / (bounds.maxLow - bounds.minLow);
}

export function candleMetrics(row, bounds, scale) {
  const up = row.close > row.open;
  const perPoint = heightPerPoint(bounds, scale);
  return {
    up,
    colour: up ? COLOURS.up : COLOURS.down,
    body: {
      y: priceLevel(Math.min(row.open, row.close), bounds, scale),
      height: perPoint * Math.abs(row.open - row.close),
      width: 0.04 * scale
    },
    wick: {
      y: priceLevel(row.low, bounds, scale),
      height: perPoint * (row.high - row.low),
      diameter: 0.01 * scale
    }
  };
}

// Index of the Monday-based UTC week a 'YYYY-MM-DD' label falls in. 1970-01-01
// was a Thursday, so shifting the epoch day by 3 puts week boundaries on Monday.
function weekIndex(label) {
  const [year, month, day] = label.split('-').map(Number);
  return Math.floor((Date.UTC(year, month - 1, day) / 86400000 + 3) / 7);
}

// Ascending indices of the sessions that open a week: row 0 plus every row
// whose week differs from its predecessor's. These carry the blades and the
// date labels, so the uneven spacing (holidays) is visible on the ring.
export function weekStarts(rows) {
  const starts = [];
  let previous = null;
  for (let i = 0; i < rows.length; i += 1) {
    const week = weekIndex(rows[i].label);
    if (i === 0 || week !== previous) starts.push(i);
    previous = week;
  }
  return starts;
}

export function volumeBar(row, bounds, scale) {
  const unit = (row.volume - bounds.minVolume) / (bounds.maxVolume - bounds.minVolume);
  return { height: 0.4 * scale * (unit * 4 + 1), width: 0.01 * scale, depth: 0.03 * scale };
}

// The drum shows a contiguous run of sessions: `slots - aperture` of them,
// starting at `offset`, with the last one sitting under the pen. It never
// wraps — walking off the end of the record stops the drum (see clampOffset).
export function windowOf(offset, total, slots, aperture) {
  const count = slots - aperture;
  return { first: offset, last: offset + count - 1, count };
}

export function isVisible(offset, index, slots, aperture) {
  return index >= offset && index <= offset + (slots - aperture) - 1;
}

// Offsets run 0 .. total - (slots - aperture) — 0..58 for 110 sessions in 52
// visible slots. Past the end the drum stops; it does not rewind.
export function clampOffset(offset, total, slots, aperture) {
  return Math.min(Math.max(offset, 0), total - (slots - aperture));
}

// Which of the `slots` places on the drum a series index occupies.
export function slotOf(index, slots) {
  return index % slots;
}

// The pen is a fixed radial line at the point of the ring nearest the camera,
// snapped to a detent so the drum always halts on a tick. Camera (13, 8, 4)
// gives atan2(-4, 13) ≈ -2.62 slots, i.e. 3 slots clockwise of +x.
export function penAzimuth(cx, cz, slots) {
  const step = TAU / slots;
  return Math.round(Math.atan2(-cz, cx) / step) * step;
}

// The pen the hero actually uses, from the camera direction in market-visual.
export const DEFAULT_PEN = penAzimuth(13, 4, DEFAULT_SLOTS);

// Rotation of the drum for a window starting at `offset`: enough to bring the
// window's last index (offset + count - 1) round to the pen.
export function drumAngle(offset, slots = DEFAULT_SLOTS, pen = DEFAULT_PEN, aperture = DEFAULT_APERTURE) {
  return pen - TAU * (offset + (slots - aperture) - 1) / slots;
}

// Inverse of drumAngle, to the nearest session. Dragging can carry the angle
// past either end of the record, so the result may fall outside 0..max and
// the caller clamps it with clampOffset.
export function offsetFromAngle(angle, slots = DEFAULT_SLOTS, pen = DEFAULT_PEN, aperture = DEFAULT_APERTURE) {
  return Math.round((pen - angle) * slots / TAU - (slots - aperture) + 1);
}

// Slot under a point given in the drum's own frame (inner.worldToLocal), the
// inverse of ringPosition's angle. Used for hover and touch picking: one plane
// intersection and an atan2, no per-instance raycast.
export function slotFromLocal(x, z, slots) {
  const step = TAU / slots;
  const k = Math.round(Math.atan2(-z, x) / step);
  return ((k % slots) + slots) % slots;
}

// Nearest resting angle to `angle`: the drum only ever stops on a tick, so a
// released drag settles on pen - k·(TAU/slots) for some integer k.
export function detentTarget(angle, slots = DEFAULT_SLOTS, pen = DEFAULT_PEN) {
  const step = TAU / slots;
  return pen - Math.round((pen - angle) * slots / TAU) * step;
}

// Drag is position-based, not velocity-based: the angle depends only on how
// far the pointer has travelled across the canvas, never on dt.
export function dragAngle(dx, width, gain = 2.4) {
  return gain * dx / width;
}

// Legacy wrapping window of the old continuous ticker, kept so nothing that
// still imports it breaks. The drum uses windowOf/isVisible instead.
export function inWindow(offset, total, slots, index) {
  const start = ((offset % total) + total) % total;
  const end = (start + slots) % total;
  return start < end ? index >= start && index < end : index >= start || index < end;
}

// One beat: the drum turns one slot, the new session prints, then the frame
// rests. Every phase is expressed in seconds from the start of the beat, so
// the renderer can schedule off a timestamp and never off a frame count.
export const TIMING = {
  desktop: { period: 1.20, step: 0.42, printStart: 0.44, printEnd: 0.74, dissolve: 0.50 },
  mobile: { period: 1.60, step: 0.52, printStart: 0.54, printEnd: 0.84, dissolve: 0.50 }
};

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

// Where a beat is at `t` seconds in: how far the turn has got, how far the
// print has got, whether the frame is at rest (nothing to draw) and whether
// the beat is spent (time to start the next one).
export function beatPhase(t, timing) {
  return {
    stepU: clamp01(t / timing.step),
    printU: clamp01((t - timing.printStart) / (timing.printEnd - timing.printStart)),
    resting: t >= timing.printEnd,
    done: t >= timing.period
  };
}

// Far side of the ring recedes into the background colour. Driven by view-space
// z once per step, not per frame, and never applied to the nib.
export function depthFade(viewZ, near, far, strength) {
  const u = clamp01((viewZ - near) / (far - near));
  return strength * u * u * (3 - 2 * u);
}

// A tween aimed at a new target from the value it holds right now, so a slot
// that is half printed keeps its progress instead of snapping. `ease` is a
// function (one of EASE), `delay` and `now` are seconds on the same clock.
export function retarget(from, to, duration, ease, delay, now) {
  return { from, to, start: now + delay, duration, ease };
}

export function tweenValue(tween, now) {
  // End first, so a zero-length tween reads as an immediate jump.
  if (now >= tween.start + tween.duration) return tween.to;
  if (now <= tween.start) return tween.from;
  const u = (now - tween.start) / tween.duration;
  return tween.from + (tween.to - tween.from) * tween.ease(u);
}

// Caption pieces. The separator is a middle dot with hard spaces around it,
// the range arrow is U+2192 and a negative return uses a real minus (U+2212),
// so the two lines line up in a tabular-nums face.
const DOT = ' \u00B7 ';

export function formatPrice(n) {
  return n.toFixed(2);
}

// Session return against the previous close. '' when there is no previous
// close (the first row of the record), so the caller can just concatenate.
export function formatReturn(close, prevClose) {
  if (!(prevClose > 0) || !Number.isFinite(prevClose) || !Number.isFinite(close)) return '';
  const percent = (close / prevClose - 1) * 100;
  const magnitude = Math.abs(percent).toFixed(2);
  const sign = percent < 0 && magnitude !== '0.00' ? '\u2212' : '+';
  return `${sign}${magnitude} %`;
}

// The two caption lines, derived entirely from the data file: what the series
// is and how much of it is on screen, then the session under the pen. Nothing
// here is hand-written, so the caption cannot drift from the rows.
export function captionLines(meta, rows, slots, aperture, ratio, penIndex) {
  const line1 = [
    meta.name,
    meta.interval,
    `${rows[0].label} \u2192 ${rows[rows.length - 1].label}`,
    `${slots - aperture} of ${rows.length} sessions`,
    `captured ${meta.capturedAt}`,
    'not live'
  ].join(DOT);
  const row = rows[penIndex];
  const previous = rows[penIndex - 1];
  const line2 = [
    row.label,
    `O ${formatPrice(row.open)}`,
    `H ${formatPrice(row.high)}`,
    `L ${formatPrice(row.low)}`,
    `C ${formatPrice(row.close)}`
  ].join(DOT)
    + (previous ? DOT + formatReturn(row.close, previous.close) : '')
    + `${DOT}\u00D7${ratio} vertical`;
  return [line1, line2];
}

// CSS-style cubic Bézier easing (Newton steps with a bisection fallback).
export function cubicBezier(x1, y1, x2, y2) {
  if (x1 === y1 && x2 === y2) return (t) => t;
  const a = (p1, p2) => 1 - 3 * p2 + 3 * p1;
  const b = (p1, p2) => 3 * p2 - 6 * p1;
  const c = (p1) => 3 * p1;
  const at = (t, p1, p2) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t, p1, p2) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const s = slope(t, x1, x2);
      if (s === 0) break;
      t -= (at(t, x1, x2) - x) / s;
    }
    if (!(t >= 0 && t <= 1) || Math.abs(at(t, x1, x2) - x) > 1e-6) {
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 48; i += 1) {
        const cx = at(t, x1, x2);
        if (Math.abs(cx - x) < 1e-7) break;
        if (cx < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return at(t, y1, y2);
  };
}

export const EASE = {
  linear: (t) => t,
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
  camera: cubicBezier(0.37, 0, 0.17, 1)
};
