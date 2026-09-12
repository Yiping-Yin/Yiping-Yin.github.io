import { test } from 'node:test';
import assert from 'node:assert/strict';
import { year, month, day, meta } from '../assets/market-arcs-data.mjs';
import { createReplayModel, replayFrame, observedSpan } from '../assets/market-arcs-replay.mjs';

const source = { year, month, day };
const aggregate = rows => ({
  open: rows[0].open, high: Math.max(...rows.map(row => row.high)), low: Math.min(...rows.map(row => row.low)),
  close: rows.at(-1).close, volume: rows.reduce((sum, row) => sum + row.volume, 0),
});
const fields = ['open', 'high', 'low', 'close', 'volume'];
const values = row => fields.map(key => row[key]);
const minute = label => +label.slice(11, 13) * 60 + +label.slice(14, 16);
const padded = n => String(n).padStart(2, '0');
const endOf = row => `${row.label.slice(0, 10)} ${padded(Math.floor((minute(row.label) + 5) / 60))}:${padded((minute(row.label) + 5) % 60)}`;

test('every one of 78 prefixes shares the selected completed-bar close and exact observed OHLCV', () => {
  const model = createReplayModel(source, meta);
  assert.equal(day.length, 78);
  for (let index = 0; index < day.length; index++) {
    const frame = replayFrame(model, index), prefix = day.slice(0, index + 1);
    const bucket = Math.floor((minute(day[index].label) - 570) / 60);
    const hourPrefix = prefix.filter(row => Math.floor((minute(row.label) - 570) / 60) === bucket);
    assert.equal(frame.index, index);
    assert.equal(frame.asOf, endOf(day[index]));
    assert.equal(frame.asOfTime, frame.asOf.slice(11));
    assert.deepEqual(values(frame.current.year), values(aggregate(prefix)));
    assert.deepEqual(values(frame.current.month), values(aggregate(hourPrefix)));
    assert.deepEqual(values(frame.current.day), values(day[index]));
    for (const key of ['year', 'month', 'day']) {
      assert.equal(frame.current[key], frame.windows[key].at(-1));
      assert.equal(frame.current[key].close, day[index].close);
      assert.equal(frame.current[key].endLabel, frame.asOf);
      assert.equal(model.windows[key][frame.pens[key]].label, frame.current[key].label);
      for (const row of frame.windows[key]) {
        if (row.label.slice(0, 10) === meta.session) assert.ok(row.endLabel <= frame.asOf);
      }
    }
    assert.equal(frame.current.year.observedCount, index + 1);
    assert.equal(frame.current.month.observedCount, hourPrefix.length);
    assert.equal(frame.current.year.complete, index === day.length - 1);
  }
});

test('the opening frame has no completed-hour or final daily values, and rewind is repeatable', () => {
  const model = createReplayModel(source, meta);
  const first = replayFrame(model, 0);
  assert.deepEqual(values(first.current.year), values(day[0]));
  assert.deepEqual(values(first.current.month), values(day[0]));
  assert.equal(first.current.month.close, 7591.46);
  assert.equal(first.current.month.high, 7597.09);
  assert.equal(first.current.month.complete, false);
  assert.equal(first.current.year.complete, false);
  assert.equal(observedSpan('month', first.current.month), '09:30–09:35');
  assert.notEqual(first.current.month.close, month.find(row => row.label === `${meta.session} 09:30`).close);
  replayFrame(model, 77);
  assert.deepEqual(replayFrame(model, 0), first);
});

test('session-anchored hours switch after twelve actual five-minute intervals', () => {
  const model = createReplayModel(source, meta);
  const before = replayFrame(model, 11), after = replayFrame(model, 12);
  assert.equal(before.current.month.label, `${meta.session} 09:30`);
  assert.equal(before.current.month.endLabel, `${meta.session} 10:30`);
  assert.equal(before.current.month.complete, true);
  assert.equal(after.current.month.label, `${meta.session} 10:30`);
  assert.equal(after.current.month.endLabel, `${meta.session} 10:35`);
  assert.equal(after.current.month.complete, false);
  assert.equal(after.current.month.observedCount, 1);
  assert.equal(after.pens.month, before.pens.month + 1);
  assert.deepEqual(values(after.windows.month.at(-2)), values(before.current.month));
});

test('the final half-hour is six bars and the normalized daily close agrees with both finer windows', () => {
  const model = createReplayModel(source, meta), frame = replayFrame(model, 77);
  assert.equal(frame.current.month.label, `${meta.session} 15:30`);
  assert.equal(frame.current.month.endLabel, `${meta.session} 16:00`);
  assert.equal(frame.current.month.expectedCount, 6);
  assert.equal(frame.current.month.observedCount, 6);
  assert.equal(frame.current.month.complete, true);
  assert.equal(frame.current.year.expectedCount, 78);
  assert.equal(frame.current.year.complete, true);
  assert.equal(frame.current.year.close, 7592.30);
  assert.equal(year.at(-1).close, 7591.70);
  assert.equal(observedSpan('month', frame.current.month), '15:30–16:00');
  assert.deepEqual(frame.windows, model.windows);
});

test('raw data and historical records stay unchanged; model and frames are frozen snapshots', () => {
  const input = structuredClone(source), metadata = { ...meta }, original = structuredClone(input);
  const model = createReplayModel(input, metadata);
  const historicalYear = original.year.filter(row => row.label < meta.session);
  const historicalMonth = original.month.filter(row => row.label.slice(0, 10) < meta.session);
  assert.deepEqual(input, original);
  assert.deepEqual(model.windows.year.slice(0, historicalYear.length), historicalYear);
  assert.deepEqual(model.windows.month.slice(0, historicalMonth.length), historicalMonth);
  input.day[0].close = 1; input.year[0].open = 2; metadata.session = '2000-01-01';
  const frame = replayFrame(model, 0);
  assert.equal(frame.current.day.close, original.day[0].close);
  assert.equal(frame.windows.year[0].open, original.year[0].open);
  for (const value of [model, model.windows, model.windows.day, model.windows.day[0], frame, frame.windows, frame.current, frame.pens]) assert.ok(Object.isFrozen(value));
});

test('missing bars cannot move hours by array index or fabricate an empty hour', () => {
  // Remove the opening bar, one more early bar, and the entire 10:30 hour.
  const sparseDay = day.filter((row, index) => index !== 0 && index !== 2 && !(index >= 12 && index < 24));
  const model = createReplayModel({ ...source, day: sparseDay }, meta);
  const firstHourLast = sparseDay.findIndex(row => row.label.endsWith('10:25'));
  const before = replayFrame(model, firstHourLast), after = replayFrame(model, firstHourLast + 1);
  assert.equal(before.current.month.label, `${meta.session} 09:30`);
  assert.equal(before.current.month.expectedCount, 12);
  assert.equal(before.current.month.observedCount, 10);
  assert.equal(before.current.month.missingCount, 2);
  assert.equal(before.current.month.complete, false);
  assert.equal(before.current.month.partialStart, true);
  assert.equal(after.current.month.label, `${meta.session} 11:30`);
  assert.equal(after.current.month.observedCount, 1);
  assert.equal(after.current.month.endLabel, `${meta.session} 11:35`);
  assert.equal(after.pens.month, before.pens.month + 1);
  assert.ok(!model.windows.month.some(row => row.label === `${meta.session} 10:30`));
  assert.deepEqual(model.windows.day.map(row => row.label), sparseDay.map(row => row.label));
  const end = replayFrame(model, sparseDay.length - 1);
  assert.equal(end.current.year.complete, false);
  assert.equal(end.current.year.observedCount, 64);
  assert.equal(end.current.year.missingCount, 14);
  assert.deepEqual(values(end.current.year), values(aggregate(sparseDay)));
});

test('spans for unchanged historical rows remain complete and partial derived spans end at observation cutoff', () => {
  assert.equal(observedSpan('year', year[0]), '2025-09-10');
  assert.equal(observedSpan('month', { ...month[0], label: '2026-08-10 15:30' }), '15:30–16:00');
  assert.equal(observedSpan('day', day[0]), '09:30–09:35');
  const frame = replayFrame(createReplayModel(source, meta), 72);
  assert.equal(observedSpan('year', frame.current.year), meta.session);
  assert.equal(observedSpan('month', frame.current.month), '15:30–15:35');
});

test('invalid data is rejected, and noninteger replay beats conservatively select completed bars', () => {
  const model = createReplayModel(source, meta);
  assert.equal(replayFrame(model, 0.99).index, 0);
  assert.equal(replayFrame(model, -1).index, 0);
  assert.equal(replayFrame(model, 100).index, 77);
  assert.throws(() => replayFrame(model, NaN), /finite/);
  assert.throws(() => createReplayModel({ ...source, day: [] }, meta), /5-minute/);
  assert.throws(() => createReplayModel({ ...source, day: [day[1], day[0]] }, meta), /increasing/);
  assert.throws(() => createReplayModel({ ...source, day: [{ ...day[0], label: `${meta.session} 09:31` }] }, meta), /5-minute/);
  assert.throws(() => createReplayModel({ ...source, day: [{ ...day[0], label: `${meta.session} 16:00` }] }, meta), /session/);
  assert.throws(() => createReplayModel({ ...source, day: [{ ...day[0], high: 1 }] }, meta), /OHLC/);
  assert.throws(() => createReplayModel({ ...source, year: [...year, { ...year.at(-1), label: '2026-09-11' }] }, meta), /after/);
});
