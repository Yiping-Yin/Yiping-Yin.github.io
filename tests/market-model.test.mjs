import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../assets/market-model.mjs';
import series, { meta } from '../assets/market-data.mjs';
const { TAU, GLYPH_RATIO, DEFAULT_APERTURE, DEFAULT_SLOTS, DEFAULT_PEN, TIMING, EASE } = model;
const { ringPosition, seriesBounds, priceLevel, heightPerPoint, candleMetrics, volumeBar, weekStarts } = model;
const { windowOf, isVisible, clampOffset, slotOf, inWindow } = model;
const { penAzimuth, drumAngle, offsetFromAngle, slotFromLocal, detentTarget, dragAngle } = model;
const { beatPhase, depthFade, retarget, tweenValue, cubicBezier } = model;
const { formatPrice, formatReturn, captionLines } = model;

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
  const h = heightPerPoint(b, 1.2);
  const up = candleMetrics(rows[0], b, 1.2);   // close 104 > open 100
  assert.equal(up.colour, '#73E27F');
  near(up.body.height, h * 4);                 // |open - close|
  near(up.body.width, 0.04 * 1.2);
  near(up.wick.height, h * 15);                // high - low
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

test('cubicBezier reproduces the CSS ease-in and ease-out curves', () => {
  near(cubicBezier(0.42, 0, 1, 1)(0.5), 0.3153, 1e-3);
  near(cubicBezier(0, 0, 0.58, 1)(0.5), 0.6847, 1e-3);
  near(cubicBezier(0.37, 0, 0.17, 1)(0), 0);
  near(cubicBezier(0.37, 0, 0.17, 1)(1), 1);
  near(EASE.easeIn(0.5), 0.3153, 1e-3);
});

test('the glyph ratio and the default aperture are the values the dial is drawn from', () => {
  assert.equal(GLYPH_RATIO, 8.7);
  assert.equal(DEFAULT_APERTURE, 3);
});

test('heightPerPoint is GLYPH_RATIO times the position scale of one price point', () => {
  const b = seriesBounds(rows);                // minLow 90, maxLow 98
  const positionPerPoint = 1.5 * 1.2 / (b.maxLow - b.minLow);
  assert.equal(heightPerPoint(b, 1.2) / positionPerPoint, 8.7);
  const real = seriesBounds(series);           // the shipped 110-session series
  assert.equal(heightPerPoint(real, 1.2) / (1.5 * 1.2 / (real.maxLow - real.minLow)), 8.7);
  near(heightPerPoint(real, 1.2), 0.011344291271560307, 1e-15);
});

test('market-data exports the provenance meta the caption is built from', () => {
  assert.deepEqual(meta, {
    symbol: '^GSPC',
    name: 'S&P 500',
    interval: 'daily',
    source: 'Yahoo Finance daily history',
    capturedAt: '2026-09-06'
  });
});

test('weekStarts marks the first row and every row that opens a new Monday-based UTC week', () => {
  // Tue, Wed, Thu, then the Monday after: two weeks, so two blades.
  assert.deepEqual(weekStarts(rows), [0, 3]);
});

test('weekStarts finds 23 weeks in the shipped series, with the holiday-shortened gaps intact', () => {
  const starts = weekStarts(series);
  assert.equal(starts.length, 23);
  assert.deepEqual(starts.slice(0, 3), [0, 3, 8]);
  assert.equal(starts[0], 0);
  // ascending, and every start is a session that follows a week boundary
  for (let i = 1; i < starts.length; i += 1) assert.ok(starts[i] > starts[i - 1]);
  assert.ok(starts.every((i) => Number.isInteger(i) && i < series.length));
});

test('windowOf holds slots - aperture sessions, the last of them under the pen', () => {
  assert.deepEqual(windowOf(0, 110, 55, 3), { first: 0, last: 51, count: 52 });
  assert.deepEqual(windowOf(57, 110, 55, 3), { first: 57, last: 108, count: 52 });
  assert.deepEqual(windowOf(58, 110, 55, 3), { first: 58, last: 109, count: 52 });
});

test('isVisible admits exactly the closed range [first, last] of the window', () => {
  assert.equal(isVisible(0, 0, 55, 3), true);
  assert.equal(isVisible(0, 51, 55, 3), true);
  assert.equal(isVisible(0, 52, 55, 3), false);   // in the aperture
  assert.equal(isVisible(58, 57, 55, 3), false);  // fallen off the back
  assert.equal(isVisible(58, 58, 55, 3), true);
  assert.equal(isVisible(58, 109, 55, 3), true);
});

test('clampOffset stops the drum at the end of the record instead of rewinding', () => {
  assert.equal(clampOffset(0, 110, 55, 3), 0);
  assert.equal(clampOffset(-4, 110, 55, 3), 0);
  assert.equal(clampOffset(57, 110, 55, 3), 57);
  assert.equal(clampOffset(58, 110, 55, 3), 58);
  assert.equal(clampOffset(59, 110, 55, 3), 58);  // the last window is 58..109
});

test('slotOf wraps an index onto the 55 slots of the drum', () => {
  assert.equal(slotOf(0, 55), 0);
  assert.equal(slotOf(54, 55), 54);
  assert.equal(slotOf(55, 55), 0);
  assert.equal(slotOf(109, 55), 54);
});

test('penAzimuth snaps the camera azimuth to the nearest of the 55 detents', () => {
  const step = TAU / 55;
  near(penAzimuth(13, 4, 55), -3 * step, 1e-12);   // camera (13, 8, 4) → 3 slots clockwise
  assert.equal(penAzimuth(13, 4, 55) / step, -3);
  near(penAzimuth(1, 0, 55), 0);                   // straight at the camera: no snap needed
  near(penAzimuth(0, -1, 55), 14 * step, 1e-12);   // a quarter turn, snapped
  assert.equal(DEFAULT_SLOTS, 55);
  assert.equal(DEFAULT_PEN, penAzimuth(13, 4, 55));
});

test('drumAngle puts the last index of the window under the pen and steps one slot per session', () => {
  const step = TAU / 55;
  near(drumAngle(0, 55, DEFAULT_PEN, 3), DEFAULT_PEN - TAU * 51 / 55, 1e-15);
  for (const o of [0, 1, 20, 57]) {
    near(drumAngle(o + 1) - drumAngle(o), -step, 1e-12);            // defaults: 55 slots, aperture 3
    near(drumAngle(o + 1, 55, DEFAULT_PEN, 3) - drumAngle(o, 55, DEFAULT_PEN, 3), -step, 1e-12);
  }
});

test('offsetFromAngle inverts drumAngle over the whole travel of the drum', () => {
  for (let o = 0; o <= 58; o += 1) {
    assert.equal(offsetFromAngle(drumAngle(o)), o);
    assert.equal(offsetFromAngle(drumAngle(o, 55, DEFAULT_PEN, 3), 55, DEFAULT_PEN, 3), o);
  }
  // a third of a slot either way still reads as the same offset
  const step = TAU / 55;
  assert.equal(offsetFromAngle(drumAngle(30) + step / 3), 30);
  assert.equal(offsetFromAngle(drumAngle(30) - step / 3), 30);
  // past the ends it keeps counting; the caller clamps
  assert.equal(offsetFromAngle(drumAngle(58) - step), 59);
  assert.equal(offsetFromAngle(drumAngle(0) + step), -1);
});

test('slotFromLocal reads a slot from a point in the drum frame, wrapping negatives', () => {
  assert.equal(slotFromLocal(1, 0, 55), 0);
  assert.equal(slotFromLocal(0, -1, 55), 14);   // atan2(1, 0) = π/2 → 13.75 → 14
  assert.equal(slotFromLocal(0, 1, 55), 41);    // the mirror: -13.75 → -14 → 41
  assert.equal(slotFromLocal(-1, 0, 55), 28);   // half a turn → 27.5 → 28
  assert.equal(slotFromLocal(7.2, 0, 55), 0);   // radius does not matter
});

test('detentTarget snaps a dragged angle to the nearest whole slot off the pen', () => {
  const step = TAU / 55;
  near(detentTarget(DEFAULT_PEN - 10 * step + 0.3 * step, 55, DEFAULT_PEN), DEFAULT_PEN - 10 * step, 1e-12);
  near(detentTarget(DEFAULT_PEN - 10 * step - 0.3 * step, 55, DEFAULT_PEN), DEFAULT_PEN - 10 * step, 1e-12);
  near(detentTarget(DEFAULT_PEN - 10 * step + 0.6 * step, 55, DEFAULT_PEN), DEFAULT_PEN - 9 * step, 1e-12);
  near(detentTarget(DEFAULT_PEN, 55, DEFAULT_PEN), DEFAULT_PEN, 1e-12);
  near(detentTarget(DEFAULT_PEN + 1.2 * step, 55, DEFAULT_PEN), DEFAULT_PEN + step, 1e-12);  // k may be negative
});

test('dragAngle is position-based: a fraction of the canvas width times the gain', () => {
  assert.equal(dragAngle(100, 680), 2.4 * 100 / 680);
  assert.equal(dragAngle(-100, 680), -2.4 * 100 / 680);
  assert.equal(dragAngle(0, 680), 0);
  assert.equal(dragAngle(100, 680, 1.2), 1.2 * 100 / 680);
});

test('TIMING pins the desktop and mobile beats the renderer schedules against', () => {
  assert.deepEqual(TIMING.desktop, { period: 1.20, step: 0.42, printStart: 0.44, printEnd: 0.74, dissolve: 0.50 });
  assert.deepEqual(TIMING.mobile, { period: 1.60, step: 0.52, printStart: 0.54, printEnd: 0.84, dissolve: 0.50 });
});

test('beatPhase walks a desktop beat: turn, print, rest, done', () => {
  const t = TIMING.desktop;
  assert.deepEqual(beatPhase(0, t), { stepU: 0, printU: 0, resting: false, done: false });
  assert.deepEqual(beatPhase(0.42, t), { stepU: 1, printU: 0, resting: false, done: false });
  assert.deepEqual(beatPhase(0.74, t), { stepU: 1, printU: 1, resting: true, done: false });
  assert.deepEqual(beatPhase(1.20, t), { stepU: 1, printU: 1, resting: true, done: true });
});

test('beatPhase reports the two progressions independently inside the beat', () => {
  const t = TIMING.desktop;
  const a = beatPhase(0.21, t);
  near(a.stepU, 0.5);
  assert.equal(a.printU, 0);                     // the print has not started
  const b = beatPhase(0.59, t);
  assert.equal(b.stepU, 1);                      // the turn is already done
  near(b.printU, 0.5, 1e-9);
  assert.equal(b.resting, false);
  const c = beatPhase(2.5, t);                   // a throttled tab woke up late
  assert.deepEqual(c, { stepU: 1, printU: 1, resting: true, done: true });
});

test('depthFade runs a smoothstep from the near edge to the far edge of the ring', () => {
  assert.equal(depthFade(-4, -4, 6, 0.3), 0);
  near(depthFade(6, -4, 6, 0.3), 0.3);
  near(depthFade(1, -4, 6, 0.3), 0.15);          // midpoint of a smoothstep is half
  near(depthFade(-1.5, -4, 6, 0.3), 0.3 * (0.25 * 0.25 * (3 - 2 * 0.25)));
  assert.equal(depthFade(-40, -4, 6, 0.3), 0);   // clamped outside the band
  near(depthFade(40, -4, 6, 0.3), 0.3);
});

test('retarget starts a tween from wherever the value is now, after an optional delay', () => {
  const tween = retarget(0.4, 1, 0.3, EASE.easeOut, 0.05, 10);
  assert.deepEqual(tween, { from: 0.4, to: 1, start: 10.05, duration: 0.3, ease: EASE.easeOut });
});

test('tweenValue holds `from` before the start, eases across, and holds `to` after the end', () => {
  const tween = retarget(0.4, 1, 0.3, EASE.easeOut, 0.05, 10);
  assert.equal(tweenValue(tween, 9.5), 0.4);              // before the delay is up
  assert.equal(tweenValue(tween, 10.05), 0.4);            // exactly at the start
  near(tweenValue(tween, 10.20), 0.4 + 0.6 * EASE.easeOut(0.5), 1e-12);
  assert.equal(tweenValue(tween, 10.35), 1);              // exactly at the end
  assert.equal(tweenValue(tween, 99), 1);                 // long after
});

test('tweenValue treats a zero-length tween as an immediate jump', () => {
  const tween = retarget(0, 1, 0, EASE.linear, 0, 5);
  assert.equal(tweenValue(tween, 4), 0);
  assert.equal(tweenValue(tween, 5), 1);
});

test('formatPrice prints two decimals and no thousands separator', () => {
  assert.equal(formatPrice(7718.6), '7718.60');
  assert.equal(formatPrice(7750.19), '7750.19');
  assert.equal(formatPrice(6395.88), '6395.88');
  assert.equal(formatPrice(1234.5), '1234.50');
});

test('formatReturn signs the session return with a real minus sign, or says nothing', () => {
  assert.equal(formatReturn(series.at(-1).close, series.at(-2).close), '−0.38 %');
  assert.equal(formatReturn(series.at(-1).close, series.at(-2).close).charCodeAt(0), 0x2212);
  assert.equal(formatReturn(101, 100), '+1.00 %');
  assert.equal(formatReturn(99, 100), '−1.00 %');
  assert.equal(formatReturn(100, 100), '+0.00 %');
  assert.equal(formatReturn(7718.6, undefined), '');   // the first row has no predecessor
});

test('captionLines prints the terminal state of the hero, every figure from the data', () => {
  assert.deepEqual(captionLines(meta, series, 55, 3, GLYPH_RATIO, 109), [
    'S&P 500 · daily · 2026-03-31 → 2026-09-04 · 52 of 110 sessions · captured 2026-09-06 · not live',
    '2026-09-04 · O 7750.19 · H 7750.19 · L 7706.12 · C 7718.60 · −0.38 % · ×8.7 vertical'
  ]);
});

test('captionLines follows the pen to any session, and drops the return on the first row', () => {
  const [first, second] = captionLines(meta, series, 55, 3, GLYPH_RATIO, 0);
  assert.equal(first, 'S&P 500 · daily · 2026-03-31 → 2026-09-04 · 52 of 110 sessions · captured 2026-09-06 · not live');
  assert.equal(second, '2026-03-31 · O 6395.88 · H 6539.05 · L 6395.88 · C 6528.52 · ×8.7 vertical');
  const mobile = captionLines(meta, series, 55, 2, GLYPH_RATIO, 51);
  assert.ok(mobile[0].includes('53 of 110 sessions'));   // a smaller aperture shows one more session
  assert.ok(mobile[1].startsWith(series[51].label + ' · O '));
});
