import { test } from 'node:test';
import assert from 'node:assert/strict';
import { year, month, day, meta } from '../assets/market-arcs-data.mjs';
import { createReplayModel, replayFrame } from '../assets/market-arcs-replay.mjs';
import { focusFrame } from '../assets/market-arcs-focus.mjs';

const model = createReplayModel({ year, month, day }, meta);
const frame = beat => replayFrame(model, beat);
const minute = row => Number(row.label.slice(11, 13)) * 60 + Number(row.label.slice(14, 16));
const labels = (snapshot, focus, key) => focus[key].indices.map(index => snapshot.windows[key][index].label);

test('all 78 default focus states use observed rows and link the current daily, hourly and five-minute resolutions', () => {
  for (let beat = 0; beat < day.length; beat++) {
    const snapshot = frame(beat), focus = focusFrame(snapshot);
    assert.equal(focus.session, meta.session);
    assert.equal(focus.year.active, snapshot.pens.year);
    assert.equal(focus.month.active, snapshot.pens.month);
    assert.equal(focus.day.active, snapshot.pens.day);
    assert.equal(focus.hourLabel, snapshot.current.month.label);
    const start = minute(snapshot.current.month);
    const expected = snapshot.windows.day.flatMap((row, index) => minute(row) >= start ? [index] : []);
    assert.deepEqual(focus.day.indices, expected);
    assert.deepEqual(labels(snapshot, focus, 'month'), snapshot.windows.month.filter(row => row.label.startsWith(meta.session)).map(row => row.label));
    for (const key of ['year', 'month', 'day']) {
      assert.ok(focus[key].indices.every(index => index >= 0 && index < snapshot.windows[key].length));
      assert.ok(focus[key].indices.every(index => snapshot.windows[key][index].endLabel <= snapshot.asOf));
    }
    assert.deepEqual(focus.unavailable, { year: false, month: false, day: false });
  }
});

test('the opening prefix exposes only one observed five-minute bar and a partial hourly span', () => {
  const first = frame(0), focus = focusFrame(first);
  assert.equal(focus.hourSpan, '09:30–09:35');
  assert.equal(focus.month.indices.length, 1);
  assert.deepEqual(focus.day.indices, [0]);
  assert.match(focus.description, /1 observed hourly bar/);
  assert.match(focus.description, /09:30–09:35 ET contains 1 observed five-minute bar/);
});

test('half-open hourly membership changes at 10:30 without moving the boundary bar into both groups', () => {
  const snapshot = frame(77);
  const before = focusFrame(snapshot, { key: 'day', index: 11 });
  const after = focusFrame(snapshot, { key: 'day', index: 12 });
  assert.equal(before.hourSpan, '09:30–10:30');
  assert.equal(after.hourSpan, '10:30–11:30');
  assert.deepEqual(before.day.indices, Array.from({ length: 12 }, (_, index) => index));
  assert.deepEqual(after.day.indices, Array.from({ length: 12 }, (_, index) => index + 12));
  assert.equal(before.day.active, 11);
  assert.equal(after.day.active, 12);
  assert.equal(after.month.active, before.month.active + 1);
  assert.deepEqual(before.year.indices, after.year.indices);
});

test('month selection links all observed hours of its date but only five-minute bars within that selected hour', () => {
  const snapshot = frame(24);
  const firstHour = snapshot.windows.month.findIndex(row => row.label === `${meta.session} 09:30`);
  const focus = focusFrame(snapshot, { key: 'month', index: firstHour });
  assert.equal(focus.month.indices.length, 3);
  assert.equal(focus.month.active, firstHour);
  assert.equal(focus.hourSpan, '09:30–10:30');
  assert.equal(focus.day.indices.length, 12);
  assert.equal(focus.day.active, 11);
  assert.equal(focus.year.active, snapshot.pens.year);
});

test('year selection expands to the whole observed session without showing future five-minute bars', () => {
  const snapshot = frame(24), focus = focusFrame(snapshot, { key: 'year', index: snapshot.pens.year });
  assert.equal(focus.wholeSession, true);
  assert.equal(focus.hourLabel, null);
  assert.equal(focus.hourSpan, null);
  assert.equal(focus.month.indices.length, 3);
  assert.equal(focus.day.indices.length, 25);
  assert.equal(focus.day.active, 24);
  assert.match(focus.description, /session contains 25 observed five-minute bars/);
});

test('the closing hour covers 15:30–16:00 and only its six available five-minute bars', () => {
  const snapshot = frame(77), focus = focusFrame(snapshot);
  assert.equal(focus.hourSpan, '15:30–16:00');
  assert.deepEqual(focus.day.indices, [72, 73, 74, 75, 76, 77]);
  const partial = focusFrame(frame(72));
  assert.equal(partial.hourSpan, '15:30–15:35');
  assert.deepEqual(partial.day.indices, [72]);
});

test('historical dates without finer history do not reuse the replay session minute bars', () => {
  const snapshot = frame(77);
  const historicHourIndex = snapshot.windows.month.findIndex(row => row.label < meta.session);
  const historicHour = focusFrame(snapshot, { key: 'month', index: historicHourIndex });
  assert.equal(historicHour.session, snapshot.windows.month[historicHourIndex].label.slice(0, 10));
  assert.equal(historicHour.month.indices.length, 7);
  assert.deepEqual(historicHour.day, { indices: [], active: null });
  assert.equal(historicHour.unavailable.day, true);
  assert.match(historicHour.description, /Five-minute history is unavailable/);
  const distantDay = focusFrame(snapshot, { key: 'year', index: 0 });
  assert.deepEqual(distantDay.year, { indices: [0], active: 0 });
  assert.deepEqual(distantDay.month, { indices: [], active: null });
  assert.deepEqual(distantDay.day, { indices: [], active: null });
  assert.equal(distantDay.unavailable.month, true);
  assert.equal(distantDay.unavailable.day, true);
});

test('missing observations and whole missing hours preserve timestamp membership instead of index-based buckets', () => {
  const sparseDay = day.filter((row, index) => index !== 0 && index !== 2 && !(index >= 12 && index < 24));
  const sparse = createReplayModel({ year, month, day: sparseDay }, meta);
  const snapshot = replayFrame(sparse, sparseDay.length - 1);
  const fineIndex = snapshot.windows.day.findIndex(row => row.label.endsWith('11:30'));
  const focus = focusFrame(snapshot, { key: 'day', index: fineIndex });
  assert.equal(focus.hourLabel, `${meta.session} 11:30`);
  assert.equal(focus.day.active, fineIndex);
  assert.deepEqual(labels(snapshot, focus, 'day'), day.slice(24, 36).map(row => row.label));
  assert.equal(focus.month.indices.length, 6);
  assert.ok(!labels(snapshot, focus, 'month').includes(`${meta.session} 10:30`));
});

test('invalid and no-longer-observed selections fall back to current focus without mutating the snapshot', () => {
  const snapshot = frame(0), before = structuredClone(snapshot), expected = focusFrame(snapshot);
  for (const selection of [null, {}, { key: 'invalid', index: 0 }, { key: 'day', index: -1 }, { key: 'day', index: 1 }, { key: 'month', index: NaN }, { key: 'year', index: 2.2 }]) {
    assert.deepEqual(focusFrame(snapshot, selection), expected);
  }
  assert.deepEqual(snapshot, before);
  for (const item of [expected, expected.year, expected.year.indices, expected.month, expected.day, expected.unavailable, expected.selection]) assert.ok(Object.isFrozen(item));
});

test('an empty snapshot or an isolated finest record does not fabricate parent observations', () => {
  const empty = focusFrame({ windows: { year: [], month: [], day: [] } });
  assert.equal(empty.session, null);
  assert.deepEqual(empty.unavailable, { year: true, month: true, day: true });
  const row = frame(0).current.day;
  const isolated = focusFrame({ windows: { year: [], month: [], day: [row] }, asOf: row.endLabel });
  assert.equal(isolated.session, meta.session);
  assert.equal(isolated.hourLabel, null);
  assert.deepEqual(isolated.day, { indices: [0], active: 0 });
  assert.deepEqual(isolated.unavailable, { year: true, month: true, day: false });
});
