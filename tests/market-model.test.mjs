import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../assets/market-model.mjs';
const { ringPosition, seriesBounds, priceLevel, candleMetrics, volumeBar, inWindow, slotTransition, cubicBezier, EASE, spinStep } = model;

const near = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} ≈ ${expected}`);

const rows = [
  { label: '2026-03-31', open: 100, high: 110, low: 95, close: 104, volume: 1_000 },
  { label: '2026-04-01', open: 104, high: 106, low: 90, close: 98, volume: 3_000 },
  { label: '2026-04-02', open: 98, high: 120, low: 97, close: 99, volume: 2_000 },
  { label: '2026-04-06', open: 99, high: 101, low: 98, close: 99, volume: 1_500 }
];

test('ringPosition puts slot 0 on +x and walks counter-clockwise seen from above (z = -r sin t)', () => {
  const p0 = ringPosition(7.2, 8, 0);
  near(p0.x, 7.2); near(p0.y, 0); near(p0.z, 0);
  const p2 = ringPosition(7.2, 8, 2); // quarter turn
  near(p2.x, 0); near(p2.z, -7.2);
});

test('seriesBounds uses half the rows as ring slots and takes the price ceiling from low, not high', () => {
  const b = seriesBounds(rows);
  assert.equal(b.total, 4);
  assert.equal(b.slots, 2);
  assert.equal(b.minLow, 90);
  assert.equal(b.maxLow, 98);
  assert.equal(b.minVolume, 1_000);
  assert.equal(b.maxVolume, 3_000);
});

test('priceLevel maps minLow to 1.3·scale and maxLow to 2.8·scale', () => {
  const b = seriesBounds(rows);
  near(priceLevel(90, b, 1.2), 1.3 * 1.2);
  near(priceLevel(98, b, 1.2), 2.8 * 1.2);
});

test('candleMetrics sizes wick and body from the price spans and colours by close vs open', () => {
  const b = seriesBounds(rows);
  const up = candleMetrics(rows[0], b, 1.2);   // close 104 > open 100
  assert.equal(up.colour, '#73E27F');
  near(up.body.height, 0.02 * 4 * 1.2);
  near(up.body.width, 0.04 * 1.2);
  near(up.wick.height, 0.02 * 15 * 1.2);
  near(up.wick.diameter, 0.01 * 1.2);
  near(up.body.y, priceLevel(100, b, 1.2));    // min(open, close)
  near(up.wick.y, priceLevel(95, b, 1.2));     // low
  const down = candleMetrics(rows[1], b, 1.2);  // close 98 < open 104
  assert.equal(down.colour, '#DC7A88');
  near(down.body.y, priceLevel(98, b, 1.2));
});

test('volumeBar height runs from 0.4·scale at the minimum volume to 2.0·scale at the maximum', () => {
  const b = seriesBounds(rows);
  near(volumeBar(rows[0], b, 1.2).height, 0.4 * 1.2);
  near(volumeBar(rows[1], b, 1.2).height, 2.0 * 1.2);
  near(volumeBar(rows[0], b, 1.2).width, 0.01 * 1.2);
  near(volumeBar(rows[0], b, 1.2).depth, 0.03 * 1.2);
});

test('inWindow admits the run of `slots` indices starting at the offset, wrapping past the end', () => {
  assert.equal(inWindow(0, 110, 55, 54), true);
  assert.equal(inWindow(0, 110, 55, 55), false);
  assert.equal(inWindow(100, 110, 55, 105), true);
  assert.equal(inWindow(100, 110, 55, 3), true);   // 100..109 then 0..44
  assert.equal(inWindow(100, 110, 55, 50), false);
  assert.equal(inWindow(110, 110, 55, 0), true);   // offset wraps modulo total
});

test('slotTransition staggers the very first entry by 0.03 s per index over 0.3 s', () => {
  const t = slotTransition({ p: 0, animating: false, firstPass: true }, true, 7);
  assert.deepEqual(t, { target: 1, delay: 0.21, duration: 0.3, ease: 'easeOut' });
});

test('slotTransition re-enters after 2.8 s over 0.8 s once the first pass is spent', () => {
  const t = slotTransition({ p: 0, animating: false, firstPass: false }, true, 7);
  assert.deepEqual(t, { target: 1, delay: 2.8, duration: 0.8, ease: 'easeOut' });
});

test('slotTransition fades a leaving slot out over 1.2 s with ease-in', () => {
  const t = slotTransition({ p: 1, animating: false, firstPass: false }, false, 7);
  assert.deepEqual(t, { target: 0, delay: 0, duration: 1.2, ease: 'easeIn' });
});

test('slotTransition ignores ticks while a tween is running and idles when nothing changes', () => {
  assert.equal(slotTransition({ p: 0.4, animating: true, firstPass: false }, false, 7), null);
  assert.equal(slotTransition({ p: 1, animating: false, firstPass: false }, true, 7), null);
});

test('slotTransition spends the first pass of an index that sits idle outside the window', () => {
  const t = slotTransition({ p: 0, animating: false, firstPass: true }, false, 60);
  assert.deepEqual(t, { clearFirstPass: true });
});

test('cubicBezier reproduces the CSS ease-in and ease-out curves', () => {
  near(cubicBezier(0.42, 0, 1, 1)(0.5), 0.3153, 1e-3);
  near(cubicBezier(0, 0, 0.58, 1)(0.5), 0.6847, 1e-3);
  near(cubicBezier(0.37, 0, 0.17, 1)(0), 0);
  near(cubicBezier(0.37, 0, 0.17, 1)(1), 1);
  near(EASE.easeIn(0.5), 0.3153, 1e-3);
});

test('spinStep ramps the idle spin from rest toward 0.1 rad/s clockwise seen from above', () => {
  const s0 = { speed: 0, dir: -1, originX: 0 };
  const r = spinStep(s0, { dt: 1 / 60, dragging: false, pointerX: 0 });
  near(r.state.speed, 0.03 * 0.1 / 60);
  near(r.rotate, -0.03 * 0.1 / 60);
});

test('spinStep follows the pointer while dragging and chases the drag origin', () => {
  const s0 = { speed: 0, dir: -1, originX: 0.2 };
  const r = spinStep(s0, { dt: 1 / 60, dragging: true, pointerX: 0.5 });
  near(r.rotate, 0.3 * 0.3);
  assert.equal(r.state.dir, 1);
  near(r.state.speed, 0.3);
  near(r.state.originX, 0.2 + (0.5 - 0.2) * 0.2);
});

test('spinStep skips a frame whose delta exceeds 0.1 s', () => {
  const s0 = { speed: 0.05, dir: -1, originX: 0 };
  const r = spinStep(s0, { dt: 0.5, dragging: false, pointerX: 0 });
  assert.equal(r.rotate, 0);
  assert.deepEqual(r.state, s0);
});
