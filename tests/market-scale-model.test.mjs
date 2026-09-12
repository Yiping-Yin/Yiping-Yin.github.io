import { test } from 'node:test';
import assert from 'node:assert/strict';
import { year, month, day, meta } from '../assets/market-arcs-data.mjs';
import { createReplayModel, replayFrame } from '../assets/market-arcs-replay.mjs';
import { selectionView, layoutAcross, layoutRecords } from '../assets/market-scale-model.mjs';

const model = createReplayModel({ year, month, day }, meta);
const frame = beat => replayFrame(model, beat);
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);

test('a selected daily observation exposes only its actual session children and stable archive indices', () => {
  const snapshot = frame(77), view = selectionView(snapshot, { key: 'year', index: snapshot.pens.year });
  assert.equal(view.rootRow.label, meta.session);
  assert.equal(view.rootIndex, snapshot.pens.year);
  assert.equal(view.root.row, view.rootRow);
  assert.equal(view.wholeSession, true);
  assert.equal(view.selectedHourIndex, null);
  assert.equal(view.hourRows.length, 7);
  assert.equal(view.minuteRows.length, 78);
  for (const row of view.hourRows) assert.equal(row.label, snapshot.windows.month[row.archiveIndex].label);
  for (const row of view.minuteRows) assert.equal(row.label, snapshot.windows.day[row.archiveIndex].label);
  assert.equal(view.coarseSpan.label, '09:30–16:00');
  assert.equal(view.fineSpan, view.coarseSpan);
});

test('selecting an hour exposes its five-minute children and retains the daily parent', () => {
  const snapshot = frame(77);
  const index = snapshot.windows.month.findIndex(row => row.label === `${meta.session} 10:30`);
  const view = selectionView(snapshot, { key: 'month', index });
  assert.equal(view.rootRow.label, meta.session);
  assert.equal(view.selectedHourIndex, index);
  assert.equal(view.hourRows.length, 7);
  assert.equal(view.minuteRows.length, 12);
  assert.deepEqual(view.minuteRows.map(row => row.archiveIndex), Array.from({ length: 12 }, (_, i) => i + 12));
  assert.equal(view.fineSpan.label, '10:30–11:30');
  assert.equal(view.fineSpan.duration, 60);
  const boundary = selectionView(snapshot, { key: 'day', index: 12 });
  assert.equal(boundary.selectedHourIndex, index);
  assert.equal(boundary.selectedMinuteIndex, 12);
});

test('the last half-hour has six children and half the angular width of a complete hour', () => {
  const view = selectionView(frame(77));
  assert.equal(view.fineSpan.label, '15:30–16:00');
  assert.equal(view.fineSpan.duration, 30);
  assert.equal(view.minuteRows.length, 6);
  const hours = layoutRecords(view.hourRows, { domain: view.coarseSpan });
  const fullWidth = Math.abs(hours[0].endAngle - hours[0].startAngle);
  const halfWidth = Math.abs(hours.at(-1).endAngle - hours.at(-1).startAngle);
  approx(halfWidth / fullWidth, 0.5);
  const minutes = layoutRecords(view.minuteRows, { key: 'day', domain: view.fineSpan });
  approx(minutes[0].startAngle, Math.PI - 0.16);
  approx(minutes.at(-1).endAngle, 0.16);
});

test('historical selections keep missing finer history empty', () => {
  const snapshot = frame(77);
  const firstHistoricHour = snapshot.windows.month.findIndex(row => row.label < meta.session);
  const historical = selectionView(snapshot, { key: 'month', index: firstHistoricHour });
  assert.equal(historical.hourRows.length, 7);
  assert.equal(historical.minuteRows.length, 0);
  assert.equal(historical.unavailable.day, true);
  assert.match(historical.description, /Five-minute history is unavailable/);
  assert.notEqual(historical.rootRow.label, meta.session);
  const distant = selectionView(snapshot, { key: 'year', index: 0 });
  assert.equal(distant.hourRows.length, 0);
  assert.equal(distant.minuteRows.length, 0);
  assert.equal(distant.unavailable.month, true);
  assert.equal(distant.coarseSpan.observedDuration, 0);
});

test('all replay prefixes hide future records and retain a fixed scheduled geometry domain', () => {
  for (let beat = 0; beat < 78; beat++) {
    const snapshot = frame(beat), view = selectionView(snapshot);
    assert.equal(view.rootRow.close, snapshot.current.day.close);
    assert.equal(view.coarseSpan.start, 570);
    assert.equal(view.coarseSpan.end, 960);
    assert.equal(view.coarseSpan.observedEndLabel, snapshot.asOf);
    assert.equal(view.fineSpan.observedEndLabel, snapshot.asOf);
    assert.ok(view.hourRows.every(row => row.endLabel <= snapshot.asOf));
    assert.ok(view.minuteRows.every(row => row.endLabel <= snapshot.asOf));
    assert.ok(view.minuteRows.every(row => row.archiveIndex <= beat));
    const hours = layoutRecords(view.hourRows, { domain: view.coarseSpan });
    const last = hours.at(-1);
    assert.ok(last.end <= view.coarseSpan.observedEnd);
    assert.ok(last.scheduledEndAngle <= last.endAngle);
  }
  const partial = selectionView(frame(72));
  assert.equal(partial.fineSpan.label, '15:30–16:00');
  assert.equal(partial.fineSpan.observedLabel, '15:30–15:35');
  assert.equal(partial.minuteRows.length, 1);
  const fine = layoutRecords(partial.minuteRows, { key: 'day', domain: partial.fineSpan });
  approx((fine[0].startAngle - fine[0].endAngle) / (Math.PI - 0.32), 1 / 6);
});

test('actual timestamp layout preserves missing bars, chronological order, and monotone angles', () => {
  const view = selectionView(frame(77), { key: 'year', index: frame(77).pens.year });
  const sparse = view.minuteRows.filter(row => row.archiveIndex !== 1 && row.archiveIndex !== 2);
  const layout = layoutRecords([...sparse].reverse(), { key: 'day', domain: view.coarseSpan });
  assert.deepEqual(layout.map(row => row.archiveIndex), sparse.map(row => row.archiveIndex));
  for (let i = 1; i < layout.length; i++) assert.ok(layout[i].angle < layout[i - 1].angle);
  approx(layout[0].angle - layout[1].angle, 3 * (layout[1].angle - layout[2].angle));
  const calendar = layoutRecords(year.slice(0, 4), { key: 'year' });
  approx(calendar[2].angle - calendar[3].angle, 3 * (calendar[0].angle - calendar[1].angle));
});

test('layoutAcross gives ordered unique discrete indices, including singleton and empty cases', () => {
  const layout = layoutAcross([9, 3, 5, 3]);
  assert.deepEqual(layout.map(row => row.archiveIndex), [3, 5, 9]);
  assert.ok(layout[0].angle > layout[1].angle && layout[1].angle > layout[2].angle);
  approx(layout[0].angle, Math.PI - 0.16);
  approx(layout.at(-1).angle, 0.16);
  approx(layoutAcross([17])[0].angle, Math.PI / 2);
  assert.deepEqual(layoutAcross([]), []);
});

test('selection does not mutate its snapshot and invalid future selections fall back to current data', () => {
  const snapshot = frame(0), before = structuredClone(snapshot);
  const expected = selectionView(snapshot);
  assert.deepEqual(selectionView(snapshot, { key: 'day', index: 77 }), expected);
  assert.deepEqual(snapshot, before);
  assert.ok(Object.isFrozen(expected));
  assert.ok(Object.isFrozen(expected.rootRow));
  assert.ok(Object.isFrozen(expected.hourRows[0]));
  assert.ok(Object.isFrozen(expected.fineSpan));
  const empty = selectionView({ windows: { year: [], month: [], day: [] } });
  assert.equal(empty.root, null);
  assert.equal(empty.coarseSpan, null);
  assert.deepEqual(empty.hourRows, []);
  assert.deepEqual(empty.minuteRows, []);
});

test('ambiguous or invalid time layouts fail instead of silently conflating sessions', () => {
  assert.throws(() => layoutRecords(month.slice(0, 8)), /single session/);
  assert.throws(() => layoutRecords([day[0], day[0]], { key: 'day' }), /unique/);
  assert.throws(() => layoutRecords([day[0]], { key: 'day', domain: { start: 600, end: 660 } }), /fit within/);
  assert.throws(() => layoutAcross([-1]), /nonnegative integers/);
});
