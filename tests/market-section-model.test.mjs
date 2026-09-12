import { test } from 'node:test';
import assert from 'node:assert/strict';
import { year, month, day, meta } from '../assets/market-arcs-data.mjs';
import { createReplayModel, replayFrame } from '../assets/market-arcs-replay.mjs';
import { sectionView, SECTION_WINDOWS } from '../assets/market-section-model.mjs';

const model = createReplayModel({ year, month, day }, meta);
const frame = beat => replayFrame(model, beat);
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);
const angularWidth = row => row.startAngle - row.endAngle;

test('selecting a day uses that day’s last observed hour for its local minute section', () => {
  const snapshot = frame(24), view = sectionView(snapshot, { key: 'year', index: snapshot.pens.year });
  assert.equal(view.rootRow.label, meta.session);
  assert.equal(view.rootIndex, snapshot.pens.year);
  assert.equal(view.selection.key, 'year');
  assert.deepEqual(view.effectiveSelection, { key: 'month', index: snapshot.pens.month });
  assert.equal(view.selectedHourIndex, snapshot.pens.month);
  assert.equal(view.selectedHour.row.label, `${meta.session} 11:30`);
  assert.equal(view.hours.length, 3);
  assert.equal(view.minutes.length, 1);
  assert.equal(view.minutes[0].archiveIndex, 24);
  assert.equal(view.fineSpan.label, '11:30–12:30');
  assert.equal(view.fineSpan.observedLabel, '11:30–11:35');
});

test('hour and minute selections retain their true daily and hourly parents', () => {
  const snapshot = frame(77);
  const firstHour = snapshot.windows.month.findIndex(row => row.label === `${meta.session} 09:30`);
  const hourly = sectionView(snapshot, { key: 'month', index: firstHour });
  assert.equal(hourly.rootIndex, snapshot.pens.year);
  assert.equal(hourly.selectedHourIndex, firstHour);
  assert.equal(hourly.minutes.length, 12);
  assert.deepEqual(hourly.minutes.map(row => row.archiveIndex), Array.from({ length: 12 }, (_, index) => index));
  const before = sectionView(snapshot, { key: 'day', index: 11 });
  const after = sectionView(snapshot, { key: 'day', index: 12 });
  assert.equal(before.selectedHourIndex, firstHour);
  assert.equal(after.selectedHourIndex, firstHour + 1);
  assert.equal(after.selectedMinute.archiveIndex, 12);
  assert.equal(after.selectedMinute.row.label, `${meta.session} 10:30`);
  assert.deepEqual(after.minutes.map(row => row.archiveIndex), Array.from({ length: 12 }, (_, index) => index + 12));
});

test('the full session fills the fixed hour window with its half-hour closing interval at true width', () => {
  const view = sectionView(frame(77));
  approx(view.hours[0].startAngle, 1.64);
  approx(view.hours.at(-1).endAngle, 0.70);
  approx(angularWidth(view.hours.at(-1)) / angularWidth(view.hours[0]), 0.5);
  for (let i = 1; i < view.hours.length; i++) assert.ok(view.hours[i].angle < view.hours[i - 1].angle);
});

test('the closing half-hour fills its own local minute window while a partial close uses only the observed fraction', () => {
  const full = sectionView(frame(77));
  assert.equal(full.fineSpan.start, 930);
  assert.equal(full.fineSpan.end, 960);
  assert.equal(full.minutes.length, 6);
  approx(full.minutes[0].startAngle, 1.56);
  approx(full.minutes.at(-1).endAngle, 0.62);
  const partial = sectionView(frame(72));
  assert.equal(partial.minutes.length, 1);
  assert.equal(partial.fineSpan.duration, 30);
  assert.equal(partial.fineSpan.observedDuration, 5);
  approx(angularWidth(partial.minutes[0]) / 0.94, 1 / 6);
  const hour = partial.selectedHour;
  approx(angularWidth(hour) / (hour.startAngle - hour.scheduledEndAngle), 1 / 6);
  assert.match(partial.description, /local magnifications/);
});

test('history without minutes stays empty and a day without hours never borrows another date', () => {
  const snapshot = frame(77);
  const oldSession = snapshot.windows.month[0].label.slice(0, 10);
  const oldIndex = snapshot.windows.year.findIndex(row => row.label === oldSession);
  const historical = sectionView(snapshot, { key: 'year', index: oldIndex });
  assert.equal(historical.session, oldSession);
  assert.equal(historical.hours.length, 7);
  assert.equal(historical.selectedHour.row.label, `${oldSession} 15:30`);
  assert.equal(historical.minutes.length, 0);
  assert.equal(historical.unavailable.day, true);
  assert.match(historical.description, /Five-minute history is unavailable/);
  const distant = sectionView(snapshot, { key: 'year', index: 0 });
  assert.equal(distant.session, snapshot.windows.year[0].label);
  assert.equal(distant.hours.length, 0);
  assert.equal(distant.minutes.length, 0);
  assert.equal(distant.selectedHourIndex, null);
  assert.equal(distant.selectedHour, null);
});

test('all 78 replay prefixes select only observed records and never expose final daily or hourly OHLC early', () => {
  for (let beat = 0; beat < 78; beat++) {
    const snapshot = frame(beat);
    for (const selected of [null, { key: 'year', index: snapshot.pens.year }]) {
      const view = sectionView(snapshot, selected);
      assert.equal(view.rootRow.close, snapshot.current.day.close);
      assert.equal(view.selectedHour.row.close, snapshot.current.day.close);
      assert.equal(view.fineSpan.observedEndLabel, snapshot.asOf);
      assert.equal(view.hours.at(-1).archiveIndex, snapshot.pens.month);
      assert.equal(view.minutes.at(-1).archiveIndex, snapshot.pens.day);
      assert.ok(view.hours.every(item => item.row.endLabel <= snapshot.asOf));
      assert.ok(view.minutes.every(item => item.row.endLabel <= snapshot.asOf));
      assert.ok(view.minutes.every(item => item.archiveIndex <= beat));
      assert.ok(view.hours.every(item => item.startAngle <= 1.64 && item.endAngle >= 0.70 - 1e-12));
      assert.ok(view.minutes.every(item => item.startAngle <= 1.56 && item.endAngle >= 0.62 - 1e-12));
    }
  }
});

test('missing intervals preserve time gaps and do not change the last observed hour’s membership', () => {
  const sparseDay = day.filter((_, index) => index !== 74 && !(index >= 12 && index < 24));
  const sparseModel = createReplayModel({ year, month, day: sparseDay }, meta);
  const snapshot = replayFrame(sparseModel, sparseDay.length - 1);
  const view = sectionView(snapshot, { key: 'year', index: snapshot.pens.year });
  assert.equal(view.hours.length, 6);
  assert.ok(!view.hours.some(item => item.row.label.endsWith('10:30')));
  assert.equal(view.selectedHour.row.label, `${meta.session} 15:30`);
  assert.equal(view.minutes.length, 5);
  const before = view.minutes.find(item => item.row.label.endsWith('15:35'));
  const after = view.minutes.find(item => item.row.label.endsWith('15:45'));
  assert.ok(after.startAngle < before.endAngle);
  approx(before.endAngle - after.startAngle, 0.94 / 6);
});

test('invalid future selections fall back safely and outputs do not mutate input', () => {
  const snapshot = frame(0), before = structuredClone(snapshot);
  assert.deepEqual(sectionView(snapshot, { key: 'day', index: 77 }), sectionView(snapshot));
  assert.deepEqual(snapshot, before);
  const view = sectionView(snapshot);
  for (const value of [view, view.hours, view.hours[0], view.minutes, view.windows, SECTION_WINDOWS.hours]) assert.ok(Object.isFrozen(value));
  const empty = sectionView({ windows: { year: [], month: [], day: [] } });
  assert.equal(empty.rootRow, null);
  assert.deepEqual(empty.hours, []);
  assert.deepEqual(empty.minutes, []);
  assert.equal(empty.span, null);
});
