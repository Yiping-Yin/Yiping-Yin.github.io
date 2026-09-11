// Pure scene model for the hero visual: geometry, timing and easing rules.
// No DOM and no three.js here, so `node --test tests/` can exercise it.

export const TAU = Math.PI * 2;

// The price band the ring stands in, and the floor it starts from, in scale
// units. Every session is placed by its price, so a rising market lifts the
// ring as it goes round — the climb imc.com's hero reads as. How much of that
// climb you see is the span: at imc.com's 1.5 the sessions in view here spread
// 0.63 units, where their own data spread 1.05, so this band is widened until
// ours reads at least as far (1.13). The ring is 1.8x taller in view for it;
// POSITION_BASE is what keeps that growth centred, holding unit 0.815 — the
// middle of the last window, near enough — at the height it had at 1.5, so the
// still and the reduced-motion view stay the composition they were drawn as.
export const POSITION_SPAN = 2.7;
export const POSITION_BASE = 0.322;   // = (0.815·1.5 + 1.3) − 0.815·POSITION_SPAN

// A candle's height per price point, in the same scale units: 8.7 × the 1.5
// band the first build used, then 1.3 × again once the hero moved into a square
// box — at the size imc.com draws its glyphs the 1.0 figure read as a miniature.
export const HEIGHT_SPAN = 16.965;

// How much taller a glyph is drawn than the band it stands in, to a tenth:
// what the caption prints as `×6.3 vertical`.
export const GLYPH_RATIO = Math.round(HEIGHT_SPAN / POSITION_SPAN * 10) / 10;

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
  return (unit * POSITION_SPAN + POSITION_BASE) * scale;
}

// World units per price point for candle *heights* — HEIGHT_SPAN·scale over the
// low band, which is GLYPH_RATIO times the POSITION_SPAN a price point buys.
export function heightPerPoint(bounds, scale) {
  return HEIGHT_SPAN * scale / (bounds.maxLow - bounds.minLow);
}

// Glyph widths in scale units. imc.com's are 0.04 and 0.01; ours are 1.45 ×
// that, the factor that matched their reference screenshot glyph for glyph in
// the square box (the box ratio alone would give about 1.25).
export const CANDLE_WIDTH = 0.058;
export const WICK_DIAMETER = 0.0145;

export function candleMetrics(row, bounds, scale) {
  const up = row.close > row.open;
  const perPoint = heightPerPoint(bounds, scale);
  return {
    up,
    colour: up ? COLOURS.up : COLOURS.down,
    body: {
      y: priceLevel(Math.min(row.open, row.close), bounds, scale),
      height: perPoint * Math.abs(row.open - row.close),
      width: CANDLE_WIDTH * scale
    },
    wick: {
      y: priceLevel(row.low, bounds, scale),
      height: perPoint * (row.high - row.low),
      diameter: WICK_DIAMETER * scale
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

// Bar sizes in scale units: imc.com's 0.4 / 0.01 / 0.03, drawn 1.5 × taller and
// 1.6 × wider, again matched by eye to the reference rather than derived.
export const BAR_UNIT = 0.6;
export const BAR_WIDTH = 0.016;
export const BAR_DEPTH = 0.048;

export function volumeBar(row, bounds, scale) {
  const unit = (row.volume - bounds.minVolume) / (bounds.maxVolume - bounds.minVolume);
  return { height: BAR_UNIT * scale * (unit * 4 + 1), width: BAR_WIDTH * scale, depth: BAR_DEPTH * scale };
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

// Hover hysteresis in slots: once a slot is picked it keeps the pointer until
// the pointer is this far past the boundary, so the hover cannot flicker while
// the camera drifts across a slot edge.
export const HOVER_STICK = 0.15;

// The slot a fractional slot position `k` (from atan2, see slotFromLocal) picks
// out, given the slot the pointer is already on. Inside the hysteresis band the
// current slot keeps it; outside, `k` rounds to its own slot. Wrapping is done
// on the difference, so the band works across the seam at slot 0 too.
export function stickySlot(k, current, slots, band = HOVER_STICK) {
  if (current !== null && current !== undefined) {
    const delta = k - current;
    const wrapped = delta - Math.round(delta / slots) * slots;
    if (Math.abs(wrapped) <= 0.5 + band) return current;
  }
  return ((Math.round(k) % slots) + slots) % slots;
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

// The drifting viewpoint. The eye never leaves the sphere the composition was
// designed on: it swings a slow 14° either side of the design azimuth and
// leans a couple more degrees toward the pointer. Both are angles about the
// look-at point, so the distance, the framing and the pen all hold still.
export const SWAY = { amplitude: 14 * Math.PI / 180, period: 48 };

// Pointer parallax: a lean of 2° in azimuth and 1° in elevation, reached with
// a quarter-second exponential. There is no velocity state, so it never
// overshoots however coarse or fine the frames are.
export const PARALLAX = { azimuth: 2 * Math.PI / 180, elevation: Math.PI / 180, tau: 0.25 };

// How far the view may drift before the depth fade is worth rewriting. Half a
// degree of azimuth moves an instance colour by less than one level, so the
// rewrite cannot be seen as a step.
export const DEPTH_REWRITE = { azimuth: 0.5 * Math.PI / 180, elevation: 0.25 * Math.PI / 180 };

// Width of the fade band a date label crosses as it turns away from the camera,
// in units of the facing dot product. A hard threshold would make labels blink
// on and off as the viewpoint drifts.
export const LABEL_FACING_BAND = 0.12;

// Where the sway has carried the camera azimuth at `t` seconds on the sway
// clock. An odd function through the origin, so t = 0 is the design frame the
// still, the share card and the fallback image were all rendered from.
export function swayAngle(t, amplitude = SWAY.amplitude, period = SWAY.period) {
  return amplitude * Math.sin(TAU * t / period);
}

const clampUnit = (u) => (u < -1 ? -1 : u > 1 ? 1 : u);

// Pointer position inside the hero box as (-1, -1) bottom left to (1, 1) top
// right, clamped so a pointer that has slid off the box still reads as a corner.
// A box with no extent (not laid out yet) reads as centred.
export function pointerNormal(clientX, clientY, box) {
  if (!box || !(box.width > 0) || !(box.height > 0)) return { nx: 0, ny: 0 };
  return {
    nx: clampUnit(2 * (clientX - box.left) / box.width - 1),
    ny: clampUnit(1 - 2 * (clientY - box.top) / box.height)
  };
}

// The view offset the pointer is asking for. This is only ever a target: the
// view reaches it through `damp`, never in one frame.
export function parallaxTarget(nx, ny, maxAz = PARALLAX.azimuth, maxEl = PARALLAX.elevation) {
  return {
    az: clampUnit(Number.isFinite(nx) ? nx : 0) * maxAz,
    el: clampUnit(Number.isFinite(ny) ? ny : 0) * maxEl
  };
}

// First-order approach to a target over `dt` seconds with time constant `tau`.
// The blend is exp-based rather than a fixed fraction, so the curve is the same
// at 30, 60 or 144 fps; there is no velocity term, so it cannot overshoot.
export function damp(current, target, dt, tau) {
  if (dt <= 0) return current;
  if (!(tau > 0) || !Number.isFinite(dt)) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

// The eye, moved around the look-at point by two angles. The vector from the
// look-at point to the eye is read as (distance, azimuth, elevation), the two
// offsets are added, and it is put back: the distance and the look-at point are
// untouched, so a zero offset returns the design eye to the last bit and the
// dolly keeps its own job. Azimuth follows the model's convention, atan2(-z, x).
export function cameraPose(baseEye, lookAt, azimuthOffset = 0, elevationOffset = 0) {
  const vx = baseEye[0] - lookAt[0];
  const vy = baseEye[1] - lookAt[1];
  const vz = baseEye[2] - lookAt[2];
  const distance = Math.hypot(vx, vy, vz);
  const azimuth = Math.atan2(-vz, vx) + azimuthOffset;
  const elevation = Math.atan2(vy, Math.hypot(vx, vz)) + elevationOffset;
  const flat = distance * Math.cos(elevation);
  return {
    eye: [
      lookAt[0] + flat * Math.cos(azimuth),
      lookAt[1] + distance * Math.sin(elevation),
      lookAt[2] - flat * Math.sin(azimuth)
    ],
    azimuth,
    elevation,
    distance
  };
}

// How much of a date label to draw, from the dot product of its plane normal
// with the direction to the camera. A smoothstep across LABEL_FACING_BAND, so a
// label fades as the drifting viewpoint turns it away rather than blinking off
// at a threshold. The renderer multiplies this into the label's alpha.
export function facingWeight(dot, threshold = 0.30, band = LABEL_FACING_BAND) {
  const u = clamp01((dot - threshold) / band);
  return u * u * (3 - 2 * u);
}
