import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../assets/market-model.mjs';
import series, { meta } from '../assets/market-data.mjs';
const { TAU, GLYPH_RATIO, POSITION_SPAN, POSITION_BASE, HEIGHT_SPAN, DEFAULT_APERTURE, DEFAULT_SLOTS, DEFAULT_PEN, TIMING, EASE } = model;
const { ringPosition, seriesBounds, priceLevel, heightPerPoint, candleMetrics, volumeBar, weekStarts } = model;
const { windowOf, isVisible, clampOffset, slotOf, inWindow } = model;
const { penAzimuth, drumAngle, offsetFromAngle, slotFromLocal, detentTarget, dragAngle } = model;
const { beatPhase, depthFade, retarget, tweenValue, cubicBezier } = model;
const { formatPrice, formatReturn, captionLines } = model;
const { SWAY, PARALLAX, DEPTH_REWRITE, LABEL_FACING_BAND, HOVER_STICK } = model;
const { swayAngle, pointerNormal, parallaxTarget, damp, cameraPose, facingWeight, stickySlot } = model;

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

test('priceLevel spreads the low band over POSITION_SPAN, starting at POSITION_BASE', () => {
  const b = seriesBounds(rows);
  near(priceLevel(90, b, 1.2), POSITION_BASE * 1.2);
  near(priceLevel(98, b, 1.2), (POSITION_BASE + POSITION_SPAN) * 1.2);
  near(priceLevel(94, b, 1.2), (POSITION_BASE + POSITION_SPAN / 2) * 1.2);
});

test('the widened band holds the middle of the last window where the 1.5 band had it', () => {
  // POSITION_BASE exists to keep the frame the still is composed as: the
  // middle of the terminal window sat at unit 0.815 of the low band.
  const unit = 0.815;
  near((unit * POSITION_SPAN + POSITION_BASE) * 1.2, (unit * 1.5 + 1.3) * 1.2, 1e-9);
});

test('the shipped series climbs across the sessions on show', () => {
  const b = seriesBounds(series);
  const shown = series.slice(58).map((row) => priceLevel(row.low, b, 1.2));
  const climb = Math.max(...shown) - Math.min(...shown);
  // 1.05 is what imc.com's own data spreads over its ring; ours is matched to it.
  assert.ok(climb > 1.0 && climb < 1.25, `climb ${climb}`);
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
  assert.equal(GLYPH_RATIO, 4.8);
  assert.equal(DEFAULT_APERTURE, 3);
});

test('heightPerPoint is HEIGHT_SPAN over the low band, and GLYPH_RATIO reports it', () => {
  const b = seriesBounds(rows);                // minLow 90, maxLow 98
  const positionPerPoint = POSITION_SPAN * 1.2 / (b.maxLow - b.minLow);
  near(heightPerPoint(b, 1.2) / positionPerPoint, HEIGHT_SPAN / POSITION_SPAN, 1e-12);
  near(GLYPH_RATIO, HEIGHT_SPAN / POSITION_SPAN, 0.05);   // the caption rounds to a tenth
  const real = seriesBounds(series);           // the shipped 110-session series
  near(heightPerPoint(real, 1.2), 0.011344291271560307, 1e-15);
});

test('widening the band leaves the glyphs the size the first build drew them', () => {
  // HEIGHT_SPAN is 8.7 × the 1.5 band the hero first shipped with, so a candle
  // is exactly as tall as it was before the sessions were spread apart.
  const real = seriesBounds(series);
  near(heightPerPoint(real, 1.2), 8.7 * 1.5 * 1.2 / (real.maxLow - real.minLow), 1e-9);
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
    '2026-09-04 · O 7750.19 · H 7750.19 · L 7706.12 · C 7718.60 · −0.38 % · ×4.8 vertical'
  ]);
});

test('captionLines follows the pen to any session, and drops the return on the first row', () => {
  const [first, second] = captionLines(meta, series, 55, 3, GLYPH_RATIO, 0);
  assert.equal(first, 'S&P 500 · daily · 2026-03-31 → 2026-09-04 · 52 of 110 sessions · captured 2026-09-06 · not live');
  assert.equal(second, '2026-03-31 · O 6395.88 · H 6539.05 · L 6395.88 · C 6528.52 · ×4.8 vertical');
  const mobile = captionLines(meta, series, 55, 2, GLYPH_RATIO, 51);
  assert.ok(mobile[0].includes('53 of 110 sessions'));   // a smaller aperture shows one more session
  assert.ok(mobile[1].startsWith(series[51].label + ' · O '));
});

test('index.html ships the terminal caption and slider text that captionLines and the data produce', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/&amp;/g, '&');
  const { default: series, meta } = await import('../assets/market-data.mjs');
  const [line1, line2] = captionLines(meta, series, 55, 3, GLYPH_RATIO, series.length - 1);
  const source = html.match(/<span class="market-caption-source">([^<]*)<\/span>/);
  const session = html.match(/<span class="market-caption-session">(.*?)<\/span><\/figcaption>/s);
  assert.ok(source && session, 'both caption spans present');
  assert.equal(source[1], line1);
  assert.equal(session[1].replace(/<[^>]+>/g, ''), line2);
  const last = series[series.length - 1];
  const valuetext = `${last.label}, O ${formatPrice(last.open)}, H ${formatPrice(last.high)}, L ${formatPrice(last.low)}, C ${formatPrice(last.close)}`;
  assert.ok(/<canvas id="market-canvas" aria-hidden="true"><\/canvas>/.test(html), 'the canvas is inert until the module applies the slider role');
  assert.ok(!html.includes('aria-valuetext='), 'no slider text is shipped for a slider that may never run');
  assert.equal(valuetext.slice(0, 10), last.label);
});

test('easing curves that drive the step and the dolly keep their shape', () => {
  near(EASE.easeInOut(0.25), 0.1292, 1e-3);
  near(EASE.easeInOut(0.5), 0.5, 1e-9);
  near(EASE.easeInOut(0.75), 0.8708, 1e-3);
  near(EASE.camera(0.5), 0.7979, 1e-3);
});

test('detentTarget snaps relative to the pen even when the pen is off the tick grid', () => {
  const step = TAU / 55;
  const p = DEFAULT_PEN + 0.31 * step;
  near(detentTarget(p + 0.4 * step, 55, p), p, 1e-12);
  near(detentTarget(p + 0.6 * step, 55, p), p + step, 1e-12);
});

test('formatReturn never prints a signed zero and stays silent for a degenerate previous close', () => {
  assert.equal(formatReturn(7718.40, 7718.60), '+0.00 %');
  assert.equal(formatReturn(7718.60, 0), '');
  assert.equal(formatReturn(7718.60, Infinity), '');
  assert.equal(formatReturn(7700, 7750), '\u22120.65 %');
});

test('a doji keeps the down colour and a zero body height that the renderer floors', () => {
  const b = seriesBounds(rows);
  const doji = candleMetrics({ label: '2026-04-07', open: 99, high: 101, low: 98, close: 99, volume: 1_500 }, b, 1.2);
  assert.equal(doji.colour, '#DC7A88');
  assert.equal(doji.body.height, 0);
});

test('depthFade works with the renderer\'s view-space band where near is larger than far', () => {
  near(depthFade(-6.9, -6.9, -19.8, 0.3), 0);
  near(depthFade(-19.8, -6.9, -19.8, 0.3), 0.3);
  near(depthFade(-13.35, -6.9, -19.8, 0.3), 0.15);
  near(depthFade(-3, -6.9, -19.8, 0.3), 0);
  near(depthFade(-25, -6.9, -19.8, 0.3), 0.3);
});

test('the drift constants are the angles and the time constant the viewpoint is specified in', () => {
  near(SWAY.amplitude, 0.24434609527920614);
  near(SWAY.amplitude, 14 * Math.PI / 180, 0);           // 14° each way
  assert.equal(SWAY.period, 48);
  near(PARALLAX.azimuth, 0.03490658503988659);
  near(PARALLAX.azimuth, 2 * Math.PI / 180, 0);
  near(PARALLAX.elevation, 0.017453292519943295);
  near(PARALLAX.elevation, Math.PI / 180, 0);
  assert.equal(PARALLAX.tau, 0.25);
  near(DEPTH_REWRITE.azimuth, 0.5 * Math.PI / 180, 0);
  near(DEPTH_REWRITE.elevation, 0.25 * Math.PI / 180, 0);
  assert.equal(LABEL_FACING_BAND, 0.12);
  assert.equal(HOVER_STICK, 0.15);
});

test('swayAngle is the 48 s sine the camera azimuth rides, 14° either way', () => {
  const A = SWAY.amplitude, P = SWAY.period;
  assert.equal(swayAngle(0), 0);                        // t = 0 is the design frame
  near(swayAngle(P / 4), A, 1e-12);
  near(swayAngle(P / 2), 0, 1e-12);
  near(swayAngle(3 * P / 4), -A, 1e-12);
  near(swayAngle(P / 8), A * Math.SQRT1_2, 1e-12);
  near(swayAngle(P / 8), 0.172779, 5e-7);               // the spec table quotes six decimals
  near(swayAngle(3.3), 0.102298, 5e-7);                 // first beat of a first visit: 5.861°
  near(swayAngle(1.1), 0.035062, 5e-7);                 // first beat of a return visit: 2.009°
  near(swayAngle(-12), -A, 1e-12);                      // odd, though the sway clock never runs back
  near((swayAngle(1e-4) - 0) / 1e-4, 0.031985, 1e-6);   // peak angular speed A·ω, 1.833°/s
  near(swayAngle(3, 2, 12), 2, 1e-12);                  // amplitude and period are overridable
});

test('sway plus parallax keeps the camera within 16° of the design azimuth, so the pen stays in front', () => {
  const limit = 16 * Math.PI / 180;
  for (let i = 0; i <= 960; i += 1) {
    const t = i / 10;                                   // [0, 96] s, two full periods
    const off = Math.abs(swayAngle(t)) + PARALLAX.azimuth;
    assert.ok(off <= limit, `t = ${t}: ${off} > ${limit}`);
  }
});

const heroBox = { left: 100, top: 50, width: 680, height: 460 };

test('pointerNormal maps the hero box to [-1, 1] with y up, and clamps outside it', () => {
  assert.deepEqual(pointerNormal(100, 50, heroBox), { nx: -1, ny: 1 });      // top left
  assert.deepEqual(pointerNormal(780, 510, heroBox), { nx: 1, ny: -1 });     // bottom right
  assert.deepEqual(pointerNormal(440, 280, heroBox), { nx: 0, ny: 0 });      // centre
  assert.deepEqual(pointerNormal(900, 280, heroBox), { nx: 1, ny: 0 });      // off to the right
  assert.deepEqual(pointerNormal(440, -400, heroBox), { nx: 0, ny: 1 });     // off the top
  const quarter = pointerNormal(270, 165, heroBox);
  near(quarter.nx, -0.5); near(quarter.ny, 0.5);
  // A box that has not been laid out yet cannot be normalised against.
  assert.deepEqual(pointerNormal(440, 280, { left: 0, top: 0, width: 0, height: 460 }), { nx: 0, ny: 0 });
  assert.deepEqual(pointerNormal(440, 280, { left: 0, top: 0, width: 680, height: 0 }), { nx: 0, ny: 0 });
});

test('parallaxTarget scales the clamped pointer to 2° of azimuth and 1° of elevation', () => {
  assert.deepEqual(parallaxTarget(0, 0), { az: 0, el: 0 });
  const tr = parallaxTarget(1, 1);
  near(tr.az, 0.034907, 5e-7); near(tr.el, 0.017453, 5e-7);   // six decimals in the spec table
  near(tr.az, PARALLAX.azimuth, 0); near(tr.el, PARALLAX.elevation, 0);
  const bl = parallaxTarget(-1, -1);
  near(bl.az, -PARALLAX.azimuth, 0); near(bl.el, -PARALLAX.elevation, 0);
  const br = parallaxTarget(1, -1);
  near(br.az, PARALLAX.azimuth, 0); near(br.el, -PARALLAX.elevation, 0);
  const out = parallaxTarget(2, -3);                          // clamped, not scaled past the limit
  near(out.az, PARALLAX.azimuth, 0); near(out.el, -PARALLAX.elevation, 0);
  const half = parallaxTarget(NaN, 0.5);                      // a non-finite axis reads as centred
  assert.equal(half.az, 0);
  near(half.el, 0.008727, 5e-7);
  near(half.el, PARALLAX.elevation / 2);
  const wide = parallaxTarget(1, 1, 0.1, 0.05);               // the limits are overridable
  near(wide.az, 0.1); near(wide.el, 0.05);
});

test('damp is the frame-rate independent exponential the parallax rides in on', () => {
  near(damp(0, 1, 0.25, 0.25), 0.632121, 5e-7);        // one time constant
  near(damp(0, 1, 0.25, 0.25), 1 - Math.exp(-1));
  near(damp(0, 1, 0.75, 0.25), 0.950213, 5e-7);        // 3τ is 95 % of the way there
  assert.ok(damp(0, 1, 0.75, 0.25) >= 0.95);
  near(damp(0, 1, 1 / 60, 0.25), 0.064493, 5e-7);      // the blend a 60 fps frame applies
  // Three short frames land where one long frame does: dt never changes the curve.
  let stepped = 0;
  for (let i = 0; i < 3; i += 1) stepped = damp(stepped, 1, 0.25, 0.25);
  near(stepped, damp(0, 1, 0.75, 0.25), 1e-12);
  assert.equal(damp(5, 5, 0.1, 0.25), 5);              // already there
  assert.equal(damp(0, 1, 0, 0.25), 0);                // a zero-length frame moves nothing
  assert.equal(damp(0, 1, -1, 0.25), 0);               // nor does a clock that went backwards
  near(damp(0, 1, 10, 0.25), 1);                       // 40τ has arrived
  assert.equal(damp(0, 1, 0.1, 0), 1);                 // no time constant: snap
  assert.equal(damp(0, 1, NaN, 0.25), 1);              // a broken dt snaps rather than poisoning the state
});

test('damp never overshoots, at any frame length or in either direction', () => {
  // Once the exponential has fully decayed the result is the target to within a
  // rounding step of it (a - (a - b)·1 is not bit-exact); the spec allows 1e-9
  // there, and the real bound is an ulp, so hold the interval to 1e-12.
  const slack = 1e-12;
  const between = (v, a, b) => v >= Math.min(a, b) - slack && v <= Math.max(a, b) + slack;
  for (const dt of [0, 1e-6, 1 / 240, 1 / 60, 0.1, 0.5, 3, 1e4]) {
    assert.ok(between(damp(0.2, 0.8, dt, 0.25), 0.2, 0.8), `rising, dt = ${dt}`);
    assert.ok(between(damp(0.8, 0.2, dt, 0.25), 0.2, 0.8), `falling, dt = ${dt}`);
    const signed = damp(-PARALLAX.azimuth, PARALLAX.azimuth, dt, PARALLAX.tau);
    assert.ok(between(signed, -PARALLAX.azimuth, PARALLAX.azimuth), `signed, dt = ${dt}`);
    // Monotone: it only ever moves toward the target.
    assert.ok(damp(0.2, 0.8, dt, 0.25) >= 0.2 - slack && damp(0.8, 0.2, dt, 0.25) <= 0.8 + slack);
  }
});

const DESIGN_EYE = [13, 8, 4];
const DESIGN_LOOK = [0, -0.5, 0];
const deg = (d) => d * Math.PI / 180;
const nearEye = (pose, expected, eps) => {
  near(pose.eye[0], expected[0], eps);
  near(pose.eye[1], expected[1], eps);
  near(pose.eye[2], expected[2], eps);
};

test('cameraPose offsets the design eye in azimuth and elevation without moving it off its sphere', () => {
  const base = cameraPose(DESIGN_EYE, DESIGN_LOOK, 0, 0);
  nearEye(base, DESIGN_EYE, 1e-12);                     // no offset: the frame today ships
  near(base.azimuth, -0.298499, 5e-7);                  // −17.103°, six decimals in the spec table
  near(base.elevation, 0.558551, 5e-7);                 // 32.003°
  near(base.distance, 16.039015, 5e-7);
  near(base.distance, Math.sqrt(257.25));               // |(13, 8.5, 4)|
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, Math.PI / 2, 0), [4, 8, -13], 1e-12);
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, deg(14), 0), [13.581532, 8, 0.736198], 5e-7);
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, deg(-14), 0), [11.646, 8, 7.026], 1e-3);
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, deg(2), deg(1)), [12.986457, 8.236084, 3.504679], 5e-7);
  // Straight overhead and dead level. The spec quotes the elevation offset to
  // six decimals, so the residual tilt is ~5e-7 rad and moves the eye ~1e-5.
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, 0, Math.PI / 2 - 0.558551), [0, 15.539015, 0], 1e-5);
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, 0, -0.558551), [15.329754, -0.5, 4.716847], 1e-5);
  // Exactly, with the elevation the pose itself reports rather than the printed one.
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, 0, Math.PI / 2 - base.elevation),
    [0, DESIGN_LOOK[1] + base.distance, 0], 1e-9);
  nearEye(cameraPose(DESIGN_EYE, DESIGN_LOOK, 0, -base.elevation),
    [base.distance * Math.cos(base.azimuth), -0.5, -base.distance * Math.sin(base.azimuth)], 1e-9);
});

test('cameraPose holds the distance and adds the azimuth offset, for every offset the drift can reach', () => {
  const base = cameraPose(DESIGN_EYE, DESIGN_LOOK, 0, 0);
  const reach = SWAY.amplitude + PARALLAX.azimuth;
  for (let i = 0; i <= 200; i += 1) {
    const az = -reach + 2 * reach * i / 200;
    const el = -PARALLAX.elevation + 2 * PARALLAX.elevation * i / 200;
    const pose = cameraPose(DESIGN_EYE, DESIGN_LOOK, az, el);
    const radius = Math.hypot(pose.eye[0] - DESIGN_LOOK[0], pose.eye[1] - DESIGN_LOOK[1], pose.eye[2] - DESIGN_LOOK[2]);
    near(radius, base.distance);
    near(radius, 16.039015, 5e-7);
    near(pose.azimuth, base.azimuth + az, 1e-12);
    near(pose.elevation, base.elevation + el, 1e-12);
    near(pose.distance, base.distance, 0);
  }
});

test('cameraPose is the identity on the dolly start, so the arrival is the composition it always was', () => {
  const far = DESIGN_EYE.map((v) => v * 17.4 / 15.78);
  nearEye(cameraPose(far, DESIGN_LOOK, 0, 0), far, 1e-12);
  const exact = DESIGN_EYE.map((v) => v * 17.4 / Math.hypot(...DESIGN_EYE));
  nearEye(cameraPose(exact, DESIGN_LOOK, 0, 0), exact, 1e-12);
  near(cameraPose(exact, DESIGN_LOOK, 0, 0).distance, Math.hypot(exact[0], exact[1] + 0.5, exact[2]));
});

test('facingWeight smoothsteps a label across the facing band instead of blinking it on', () => {
  assert.equal(facingWeight(0.30), 0);                  // the old hard threshold, now the band's floor
  assert.equal(facingWeight(0.42), 1);                  // threshold + band
  near(facingWeight(0.36), 0.5);                        // the middle of a smoothstep is a half
  near(facingWeight(0.33), 0.15625);                    // u = 0.25 → 0.25²(3 − 0.5)
  assert.equal(facingWeight(0), 0);                     // edge on
  assert.equal(facingWeight(1), 1);                     // square on
  assert.equal(facingWeight(-1), 0);                    // facing away
  assert.equal(facingWeight(0.29), 0);                  // clamped below, not negative
  // Monotone and inside [0, 1] across and beyond the band.
  let previous = -1;
  for (let i = 0; i <= 100; i += 1) {
    const w = facingWeight(0.25 + 0.25 * i / 100);
    assert.ok(w >= 0 && w <= 1);
    assert.ok(w >= previous);
    previous = w;
  }
  // The four labels the terminal frame shows all clear the band, so the
  // reduced-motion still frame keeps exactly the labels it has today.
  for (const dot of [0.746, 0.833, 0.711, 0.453]) assert.equal(facingWeight(dot), 1);
  // The threshold and the band are overridable.
  near(facingWeight(0.5, 0.4, 0.2), 0.5);
  assert.equal(facingWeight(0.5, 0.5, 0.2), 0);
});

test('stickySlot holds the slot it has until the pointer is a sixth of a slot past the boundary', () => {
  assert.equal(stickySlot(3.6, 3, 55), 3);              // 0.60 inside the 0.65 band: held
  assert.equal(stickySlot(3.66, 3, 55), 4);             // 0.66 past it: let go
  assert.equal(stickySlot(2.36, 3, 55), 3);
  assert.equal(stickySlot(2.34, 3, 55), 2);
  assert.equal(stickySlot(54.6, 0, 55), 0);             // the band wraps round the ring
  assert.equal(stickySlot(-0.5, 54, 55), 54);           // and wraps the other way
  assert.equal(stickySlot(0.4, 54, 55), 0);             // 1.4 slots round the ring: not held
  assert.equal(stickySlot(0.7, null, 55), 1);           // nothing hovered yet: nearest slot
  assert.equal(stickySlot(-0.3, null, 55), 0);
  assert.equal(stickySlot(-0.6, null, 55), 54);
  assert.equal(stickySlot(54.7, null, 55), 0);          // wrapped past the end of the ring
  assert.ok(Object.is(stickySlot(-0.3, null, 55), 0));  // +0, so the slot indexes an array
  assert.equal(stickySlot(3.6, undefined, 55), 4);      // no current slot, however it is spelled
  assert.equal(stickySlot(3.9, 3, 55, 0.5), 3);         // the band is overridable
  assert.equal(stickySlot(3.6, 3, 55, 0), 4);           // and a zero band is just rounding
});

test('stickySlot with no current slot is exactly slotFromLocal, over a hundred angles', () => {
  const step = TAU / 55;
  for (let i = 0; i < 100; i += 1) {
    const k = i * 0.37;                                 // a fractional slot, deterministic
    const angle = k * step;                             // the angle ringPosition would place it at
    const x = 7.2 * Math.cos(angle);
    const z = -7.2 * Math.sin(angle);                   // ringPosition negates z
    assert.equal(stickySlot(k, null, 55), slotFromLocal(x, z, 55), `k = ${k}`);
  }
});
