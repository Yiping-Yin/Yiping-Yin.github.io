// Pure scene model for the hero visual: geometry, timing and easing rules.
// No DOM and no three.js here, so `node --test tests/` can exercise it.

export const TAU = Math.PI * 2;

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

// Half the rows are on the ring at once; the price scale is bounded by the
// lows only (so the tallest candles overshoot the band slightly).
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

export function candleMetrics(row, bounds, scale) {
  const up = row.close > row.open;
  return {
    up,
    colour: up ? COLOURS.up : COLOURS.down,
    body: {
      y: priceLevel(Math.min(row.open, row.close), bounds, scale),
      height: 0.02 * Math.abs(row.open - row.close) * scale,
      width: 0.04 * scale
    },
    wick: {
      y: priceLevel(row.low, bounds, scale),
      height: 0.02 * (row.high - row.low) * scale,
      diameter: 0.01 * scale
    }
  };
}

export function volumeBar(row, bounds, scale) {
  const unit = (row.volume - bounds.minVolume) / (bounds.maxVolume - bounds.minVolume);
  return { height: 0.4 * scale * (unit * 4 + 1), width: 0.01 * scale, depth: 0.03 * scale };
}

// The visible window is `slots` consecutive indices starting at the ticker
// offset, wrapping around the end of the series.
export function inWindow(offset, total, slots, index) {
  const start = ((offset % total) + total) % total;
  const end = (start + slots) % total;
  return start < end ? index >= start && index < end : index >= start || index < end;
}

// Decides what a slot should do on a ticker change. Returns the tween to
// start, a bookkeeping instruction, or null when nothing changes.
export function slotTransition(state, visible, index) {
  if (state.animating) return null;
  if (visible && state.p < 1) {
    return state.firstPass
      ? { target: 1, delay: index * 3 / 100, duration: 0.3, ease: 'easeOut' }
      : { target: 1, delay: 2.8, duration: 0.8, ease: 'easeOut' };
  }
  if (!visible && state.p > 0) return { target: 0, delay: 0, duration: 1.2, ease: 'easeIn' };
  if (!visible) return { clearFirstPass: true };
  return null;
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

// One frame of the ring's spin. Idle: settle toward 0.1 rad/s in the last
// drag direction (clockwise from above by default). Dragging: follow the
// pointer's offset from a drag origin that keeps chasing the pointer.
export function spinStep(state, { dt, dragging, pointerX }) {
  if (dt > 0.1) return { rotate: 0, state };
  const originX = state.originX + (pointerX - state.originX) * 0.2;
  if (dragging) {
    const delta = pointerX - state.originX;
    return { rotate: 0.3 * delta, state: { speed: Math.abs(delta), dir: delta >= 0 ? 1 : -1, originX } };
  }
  const speed = state.speed + (0.1 * dt - state.speed) * 0.03;
  return { rotate: speed * state.dir, state: { speed, dir: state.dir, originX } };
}
