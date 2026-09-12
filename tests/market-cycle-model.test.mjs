import { test } from 'node:test';
import assert from 'node:assert/strict';
import { year, month, day, meta } from '../assets/market-arcs-data.mjs';
import { createReplayModel, replayFrame } from '../assets/market-arcs-replay.mjs';
import { cycleView } from '../assets/market-cycle-model.mjs';

const TAU = Math.PI * 2;
const model = createReplayModel({ year, month, day }, meta);
const frame = beat => replayFrame(model, beat);
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);

test('annual returns compare consecutive observed trading closes and first return stays unavailable', () => {
  const snapshot = frame(77), view = cycleView(snapshot);
  assert.equal(view.annual[0].returnValue, null);
  for (let i = 1; i < view.annual.length; i++) {
    approx(view.annual[i].returnValue, snapshot.windows.year[i].close / snapshot.windows.year[i - 1].close - 1);
    assert.equal(view.annual[i].archiveIndex, i);
  }
  const reversed = cycleView({ ...snapshot, windows: { ...snapshot.windows, year: [...snapshot.windows.year].reverse() } });
  assert.deepEqual(reversed.annual.map(item => item.row.label), view.annual.map(item => item.row.label));
  assert.equal(reversed.annual[0].archiveIndex, snapshot.windows.year.length - 1);
});

test('annual angular domain remains fixed across rewind and preserves weekend calendar gaps', () => {
  const open = cycleView(frame(0)), close = cycleView(frame(77));
  assert.equal(close.annualDomain.startDate, year[0].label);
  assert.equal(close.annualDomain.endDate, year.at(-1).label);
  assert.equal(close.annualDomain.calendarDays, 366);
  approx(close.annual[0].startAngle, 0);
  approx(close.annual.at(-1).endAngle, TAU);
  assert.deepEqual(open.annual.map(({ startAngle, endAngle, angle }) => [startAngle, endAngle, angle]), close.annual.map(({ startAngle, endAngle, angle }) => [startAngle, endAngle, angle]));
  const friday = close.annual.find(item => item.row.label === '2025-09-12');
  const monday = close.annual.find(item => item.row.label === '2025-09-15');
  const slotWidth = friday.endAngle - friday.startAngle;
  approx(monday.startAngle - friday.endAngle, 2 * slotWidth);
  const shortened = cycleView({ ...frame(77), windows: { year: frame(77).windows.year.slice(0, 10), month: [], day: [] } });
  approx(shortened.annual[0].startAngle, close.annual[0].startAngle);
  approx(shortened.annual.at(-1).endAngle, close.annual[9].endAngle);
});

test('hours occupy only the 09:30–16:00 sector of a real 24-hour circular domain', () => {
  const view = cycleView(frame(77));
  approx(view.hours[0].startAngle, 570 / 1440 * TAU);
  approx(view.hours.at(-1).endAngle, 960 / 1440 * TAU);
  approx((view.hours.at(-1).endAngle - view.hours[0].startAngle) / TAU * 360, 97.5);
  approx((view.hours[0].endAngle - view.hours[0].startAngle) / TAU * 360, 15);
  approx((view.hours.at(-1).endAngle - view.hours.at(-1).startAngle) / TAU * 360, 7.5);
  assert.equal(view.daySpan.label, '09:30–16:00');
  assert.equal(view.session, meta.session);
});

test('minute points use completed-bar close times and a fixed actual-hour domain during partial observation', () => {
  const view = cycleView(frame(12));
  assert.equal(view.selectedHour.row.label, `${meta.session} 10:30`);
  assert.equal(view.hourSpan.label, '10:30–11:30');
  assert.equal(view.hourSpan.observedLabel, '10:30–10:35');
  assert.equal(view.minutes.length, 1);
  assert.equal(view.minutes[0].startMinute, 630);
  assert.equal(view.minutes[0].minute, 635);
  approx(view.minutes[0].elapsedFraction, 5 / 60);
  assert.equal(view.minutes[0].close, frame(12).current.day.close);
  assert.equal(view.minutes[0].archiveIndex, 12);
  assert.equal(view.minutes[0].connectFromPrevious, false);
  assert.equal(view.minutes[0].segmentIndex, 0);
  const closing = cycleView(frame(72));
  assert.equal(closing.hourSpan.duration, 30);
  approx(closing.minutes[0].elapsedFraction, 1 / 6);
  const final = cycleView(frame(77));
  assert.equal(final.minutes.length, 6);
  approx(final.minutes.at(-1).elapsedFraction, 1);
  assert.equal(final.minutes.at(-1).minute, 960);
});

test('selecting a day defaults to its last observed hour while explicit minute selection retains its parent', () => {
  const snapshot = frame(24), daily = cycleView(snapshot, { key: 'year', index: snapshot.pens.year });
  assert.equal(daily.selectedHourIndex, snapshot.pens.month);
  assert.equal(daily.rootRow.label, meta.session);
  assert.equal(daily.minutes.length, 1);
  const minute = cycleView(snapshot, { key: 'day', index: 11 });
  assert.equal(minute.selectedMinuteIndex, 11);
  assert.equal(minute.selectedHour.row.label, `${meta.session} 09:30`);
  assert.deepEqual(minute.minutes.map(item => item.archiveIndex), Array.from({ length: 12 }, (_, index) => index));
});

test('all replay prefixes keep current prices observed and share the daily price band between scales', () => {
  for (let beat = 0; beat < 78; beat++) {
    const snapshot = frame(beat), view = cycleView(snapshot);
    assert.equal(view.rootRow.close, snapshot.current.day.close);
    assert.equal(view.selectedHour.row.close, snapshot.current.day.close);
    assert.equal(view.priceBand.low, snapshot.current.year.low);
    assert.equal(view.priceBand.high, snapshot.current.year.high);
    assert.ok(view.hours.every(item => item.row.endLabel <= snapshot.asOf));
    assert.ok(view.minutes.every(item => item.row.endLabel <= snapshot.asOf));
    assert.ok(view.minutes.every(item => item.archiveIndex <= beat));
    assert.ok(view.minutes.every(item => item.elapsedFraction > 0 && item.elapsedFraction <= 1));
    assert.ok(view.hours.every(item => item.row.low >= view.priceBand.low && item.row.high <= view.priceBand.high));
    assert.ok(view.minutes.every(item => item.close >= view.priceBand.low && item.close <= view.priceBand.high));
    const expectedReturn = snapshot.current.year.close / snapshot.windows.year.at(-2).close - 1;
    approx(view.annual.at(-1).returnValue, expectedReturn);
  }
});

test('unavailable historical fine data stays empty and its price scale belongs to the selected date', () => {
  const snapshot = frame(77), historic = cycleView(snapshot, { key: 'month', index: 0 });
  assert.notEqual(historic.session, meta.session);
  assert.equal(historic.hours.length, 7);
  assert.equal(historic.minutes.length, 0);
  assert.equal(historic.unavailable.day, true);
  assert.equal(historic.priceBand.low, historic.rootRow.low);
  assert.equal(historic.priceBand.high, historic.rootRow.high);
  const distant = cycleView(snapshot, { key: 'year', index: 0 });
  assert.equal(distant.hours.length, 0);
  assert.equal(distant.minutes.length, 0);
  assert.equal(distant.selectedHour, null);
});

test('missing fine records start a new segment instead of drawing through a gap', () => {
  const sparse = createReplayModel({ year, month, day: day.filter((_, index) => index !== 74) }, meta);
  const snapshot = replayFrame(sparse, sparse.windows.day.length - 1), view = cycleView(snapshot);
  assert.deepEqual(view.minutes.map(item => item.minute), [935, 940, 950, 955, 960]);
  assert.deepEqual(view.minutes.map(item => item.connectFromPrevious), [false, true, false, true, true]);
  assert.deepEqual(view.minutes.map(item => item.segmentIndex), [0, 0, 1, 1, 1]);
  approx(view.minutes[2].elapsedFraction, 20 / 30);
});

test('empty data stays empty and immutable outputs never modify the input snapshot', () => {
  const snapshot = frame(0), before = structuredClone(snapshot), view = cycleView(snapshot);
  assert.deepEqual(snapshot, before);
  for (const value of [view, view.annual, view.annual[0], view.hours, view.minutes, view.priceBand, view.annualDomain]) assert.ok(Object.isFrozen(value));
  const empty = cycleView({ windows: { year: [], month: [], day: [] } });
  assert.deepEqual(empty.annual, []);
  assert.deepEqual(empty.hours, []);
  assert.deepEqual(empty.minutes, []);
  assert.equal(empty.priceBand, null);
});
