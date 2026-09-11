import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../assets/market-arcs-model.mjs';
import data, { meta, year, month, day } from '../assets/market-arcs-data.mjs';
const { TAU, PEN, SEAM, ARCS, TIMING } = model;
const { calendarSlots, sessionSlots, intradaySlots, bearingAt, slotFromBearing, priceBand, level, candle, ageSink } = model;
const { replayState, frameCamera, pickArc, formatPrice, formatReturn, captionLines, barSpan } = model;

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('the data module carries three windows that end on the same session', () => {
  assert.equal(meta.session, '2026-09-10');
  assert.equal(year.length, 252); assert.equal(month.length, 147); assert.equal(day.length, 78);
  assert.equal(year[year.length - 1].label, '2026-09-10');
  assert.equal(month[month.length - 1].label, '2026-09-10 15:30');
  assert.equal(day[day.length - 1].label, '2026-09-10 15:55');
  assert.equal(data.year, year);
});

test('calendarSlots puts the newest session at the last calendar day and leaves weekends empty', () => {
  const { slots, slotOf } = calendarSlots(year);
  const newest = slots - SEAM - 1;
  assert.equal(slots, 366 + SEAM, 'the window runs from 2025-09-10 to 2026-09-10 inclusive');
  assert.equal(slotOf(year.length - 1), newest);
  assert.equal(slotOf(0), 0);
  // 2026-09-09 is the day before; 2026-09-04 (Friday) is six days before, 09-07 was Labor Day
  assert.equal(slotOf(year.length - 2), newest - 1);
  const friday = year.findIndex((r) => r.label === '2026-09-04');
  assert.equal(slotOf(friday), newest - 6);
  const all = year.map((_, i) => slotOf(i));
  assert.ok(all.every((s, i) => i === 0 || s > all[i - 1]), 'slots strictly increase with the rows');
  assert.ok(all[0] >= 0);
});

test('sessionSlots groups hourly bars by session with one empty slot between sessions', () => {
  const { slots, slotOf } = sessionSlots(month);
  assert.equal(slots, 21 * 8 + SEAM);
  assert.equal(slotOf(0), 1); assert.equal(slotOf(6), 7); assert.equal(slotOf(7), 9);
  assert.equal(slotOf(month.length - 1), 21 * 8 - 1);
});

test('intradaySlots leaves one empty slot at each hour boundary of the session', () => {
  const { slots, slotOf } = intradaySlots(day);
  assert.equal(slots, 78 + 6 + SEAM);
  assert.equal(slotOf(0), 0); assert.equal(slotOf(11), 11); assert.equal(slotOf(12), 13);
  assert.equal(slotOf(day.length - 1), 77 + 6);
});

test('bearingAt puts the pen slot at PEN and older slots clockwise, and slotFromBearing inverts it', () => {
  near(bearingAt(365, 365, 369), PEN);
  near(bearingAt(364, 365, 369), PEN - TAU / 369);
  for (const s of [0, 17, 200, 365]) assert.equal(slotFromBearing(bearingAt(s, 365, 369), 365, 369), s);
  // a bearing a hair past the pen wraps to the oldest side, never to a negative slot
  assert.equal(slotFromBearing(PEN + 0.01, 365, 369), 365);
});

test('priceBand and level map the window\'s low to the floor lift and its high to the band height', () => {
  const band = priceBand(day);
  assert.equal(band.lo, Math.min(...day.map((r) => r.low)));
  assert.equal(band.hi, Math.max(...day.map((r) => r.high)));
  near(level(band.lo, band, 0.5), 0.04);
  near(level(band.hi, band, 0.5), 0.54);
});

test('candle is planted: the wick rises from the floor, the body sits at its price, heights are exaggerated', () => {
  const band = { lo: 100, hi: 110 };
  const c = candle({ open: 104, high: 106, low: 103, close: 105 }, band, 0.5, 4);
  assert.equal(c.up, true);
  near(c.wick.y0, 0);
  near(c.body.y0, level(104, band, 0.5));
  near(c.body.y1 - c.body.y0, 1 * (0.5 / 10) * 4);
  near(c.wick.y1, level(103, band, 0.5) + 3 * (0.5 / 10) * 4);
  const d = candle({ open: 105, high: 105, low: 105, close: 105 }, band, 0.5, 4);
  assert.equal(d.up, true);
  assert.ok(d.body.y1 - d.body.y0 >= 0.02, 'a doji keeps a visible sliver');
});

test('ageSink is 0 at the pen and rises toward the oldest bar', () => {
  near(ageSink(9, 10), 0);
  near(ageSink(0, 10), 0.72);
  assert.ok(ageSink(5, 10) > 0 && ageSink(5, 10) < 0.72);
  assert.ok(ageSink(3, 10) > ageSink(6, 10));
});

test('replayState walks the day arc one bar per beat and carries the month and year pens with it', () => {
  const s0 = replayState(0, { day: 78, month: 147, year: 252 });
  assert.deepEqual([s0.day.pen, s0.month.pen, s0.year.pen], [0, 140, 251]);
  const s13 = replayState(13, { day: 78, month: 147, year: 252 });
  assert.deepEqual([s13.day.pen, s13.month.pen], [13, 141]);
  near(s13.month.fraction, 1 / 12);
  const end = replayState(77, { day: 78, month: 147, year: 252 });
  assert.deepEqual([end.day.pen, end.month.pen, end.year.pen], [77, 146, 251]);
  assert.equal(end.month.fraction, 0, 'the partial last hour does not creep, so the close sits under the pen');
  near(replayState(71, { day: 78, month: 147, year: 252 }).month.fraction, 11 / 12);
  assert.equal(replayState(500, { day: 78, month: 147, year: 252 }).day.pen, 77, 'the replay stops at the close');
});

test('TIMING pins the beat and the gearing the renderer schedules against', () => {
  assert.equal(TIMING.beat, 0.6);
  assert.equal(TIMING.hourBars, 12);
  assert.equal(TIMING.sessionBars, 78);
});

test('frameCamera fits the disc to the width and lands its centre on the bottom edge', () => {
  const f = frameCamera(1240, 520, 7.2, 50);
  assert.ok(f.distance > 20 && f.distance < 60);
  assert.ok(f.lookZ > 0);
  // the centre projects to ndc y = -1 + margin: check by reprojecting with the same pinhole model
  const el = 50 * Math.PI / 180, t = Math.tan(f.fov / 2 * Math.PI / 180);
  const vy = -f.lookZ * Math.sin(el), vz = f.distance - f.lookZ * Math.cos(el);
  near(vy / (vz * t), -1 + f.margin, 1e-6);
  const narrow = frameCamera(375, 232, 7.2, 50);
  assert.ok(narrow.distance < f.distance, 'a phone frames closer, by height, and crops the sides');
});

test('pickArc chooses the arc whose band the radius falls in, or none', () => {
  const radii = [7.2, 5.9, 4.6];
  assert.equal(pickArc(7.3, radii, 0.45), 0);
  assert.equal(pickArc(5.7, radii, 0.45), 1);
  assert.equal(pickArc(4.4, radii, 0.45), 2);
  assert.equal(pickArc(6.55, radii, 0.45), -1);
  assert.equal(pickArc(9, radii, 0.45), -1);
});

test('barSpan prints the bar\'s start and end for each arc', () => {
  assert.equal(barSpan('year', year[year.length - 1]), '2026-09-10');
  assert.equal(barSpan('month', month[month.length - 1]), '15:30–16:00');
  assert.equal(barSpan('day', day[day.length - 1]), '15:55–16:00');
  assert.equal(barSpan('day', day[0]), '09:30–09:35');
});

test('captionLines prints the source line and the bar under the pen, every figure from the data', () => {
  const [line1, line2] = captionLines(meta, { year, month, day }, 'day', day.length - 1);
  assert.equal(line1, 'S&P 500 · 2026-09-10 · a year of days · a month of hours · a day of 5-minute bars · captured 2026-09-11 · not live');
  const last = day[day.length - 1], prev = day[day.length - 2];
  assert.equal(line2, `15:55–16:00 · O ${last.open.toFixed(2)} · H ${last.high.toFixed(2)} · L ${last.low.toFixed(2)} · C ${last.close.toFixed(2)} · ${formatReturn(last.close, prev.close)}`);
  assert.equal(last.close, 7592.3, 'the session closes at 7592.30');
  const [, first] = captionLines(meta, { year, month, day }, 'day', 0);
  assert.ok(first.startsWith('09:30–09:35 · O '));
  assert.ok(!first.includes('%'), 'the first bar has no previous close to return against');
});

test('formatReturn and formatPrice behave as the ring\'s did', () => {
  assert.equal(formatPrice(7591.7), '7591.70');
  assert.equal(formatReturn(101, 100), '+1.00 %');
  assert.equal(formatReturn(99, 100), '−1.00 %');
  assert.equal(formatReturn(100, 0), '');
});

test('index.html ships the terminal caption the data produces', async () => {
  const fs = await import('node:fs/promises');
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  const [line1] = captionLines(meta, { year, month, day }, 'day', day.length - 1);
  assert.ok(html.includes(line1.replace(/&/g, '&amp;')), 'the source line is in index.html');
});
