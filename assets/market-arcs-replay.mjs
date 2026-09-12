// Observed 5-minute bars drive all three replay resolutions. The archived raw
// daily/hourly values are replaced only for the selected session, never edited.
const OPEN_MINUTE = 570;
const CLOSE_MINUTE = 960;
const INTERVAL_MINUTES = 5;
const pad = value => String(value).padStart(2, '0');
const clockLabel = minute => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

function validDate(label) {
  if (typeof label !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(label)) throw new TypeError('Session date must be YYYY-MM-DD');
  const timestamp = Date.parse(`${label}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== label) throw new RangeError('Invalid calendar date');
  return label;
}

function minuteOf(label) {
  if (typeof label !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(label)) throw new TypeError('Intraday label must be YYYY-MM-DD HH:MM');
  validDate(label.slice(0, 10));
  const hour = Number(label.slice(11, 13)), minute = Number(label.slice(14, 16));
  if (hour > 23 || minute > 59) throw new RangeError('Invalid local clock time');
  return hour * 60 + minute;
}

function copyRows(rows, key, session) {
  if (!Array.isArray(rows)) throw new TypeError(`${key} must be an array`);
  if (key === 'day' && rows.length === 0) throw new RangeError('At least one observed 5-minute bar is required');
  let previous = '';
  return Object.freeze(rows.map(row => {
    if (!row || typeof row !== 'object') throw new TypeError('Invalid OHLC row');
    const date = key === 'year' ? validDate(row.label) : validDate(row.label?.slice(0, 10));
    const minute = key === 'year' ? null : minuteOf(row.label);
    if (row.label <= previous) throw new RangeError(`${key} observations must be strictly increasing`);
    previous = row.label;
    if (date > session) throw new RangeError('Source windows cannot contain observations after the replay session');
    if (key === 'day') {
      if (date !== session || minute < OPEN_MINUTE || minute >= CLOSE_MINUTE) throw new RangeError('5-minute observation is outside the replay session');
      if ((minute - OPEN_MINUTE) % INTERVAL_MINUTES !== 0) throw new RangeError('Observation must be aligned to a 5-minute bar');
    }
    for (const name of ['open', 'high', 'low', 'close', 'volume']) {
      if (!Number.isFinite(row[name])) throw new TypeError(`${name} must be finite`);
    }
    if (row.low > Math.min(row.open, row.close) || row.high < Math.max(row.open, row.close)) throw new RangeError('OHLC endpoints must lie between low and high');
    if (row.volume < 0) throw new RangeError('volume must be nonnegative');
    return Object.freeze({ ...row });
  }));
}

function appendObserved(previous, row, label, startMinute, endMinute) {
  const observedCount = (previous?.observedCount || 0) + 1;
  const observedEndMinute = minuteOf(row.label) + INTERVAL_MINUTES;
  const volume = (previous?.volume || 0) + row.volume;
  if (!Number.isFinite(volume)) throw new RangeError('Aggregate volume must be finite');
  const expectedCount = (endMinute - startMinute) / INTERVAL_MINUTES;
  const elapsedCount = (observedEndMinute - startMinute) / INTERVAL_MINUTES;
  const sourceStartLabel = previous?.sourceStartLabel || row.label;
  return Object.freeze({
    label, open: previous ? previous.open : row.open,
    high: previous ? Math.max(previous.high, row.high) : row.high,
    low: previous ? Math.min(previous.low, row.low) : row.low,
    close: row.close, volume, endLabel: row.endLabel,
    complete: observedEndMinute === endMinute && observedCount === expectedCount,
    observedCount, expectedCount, missingCount: elapsedCount - observedCount,
    sourceStartLabel, partialStart: minuteOf(sourceStartLabel) > startMinute,
    startMinute, endMinute, observedEndMinute,
  });
}

/**
 * Labels are New York local session times; no array-index assumptions are used
 * to identify hours. Empty source periods have no fabricated OHLC record.
 */
export function createReplayModel(input, meta) {
  if (!input || typeof input !== 'object' || !meta || typeof meta !== 'object') throw new TypeError('Windows and session metadata are required');
  const session = validDate(meta.session);
  const rawYear = copyRows(input.year, 'year', session);
  const rawMonth = copyRows(input.month, 'month', session);
  const rawDay = copyRows(input.day, 'day', session);
  const historicalYear = Object.freeze(rawYear.filter(row => row.label < session));
  const historicalMonth = Object.freeze(rawMonth.filter(row => row.label.slice(0, 10) < session));
  const day = Object.freeze(rawDay.map(row => Object.freeze({
    ...row, endLabel: `${session} ${clockLabel(minuteOf(row.label) + INTERVAL_MINUTES)}`, complete: true,
  })));
  const dayPrefixes = [], hourPrefixes = [], hourRows = [], hourPositions = [];
  let cumulativeDay = null, cumulativeHour = null, currentStart = null;
  for (const row of day) {
    const minute = minuteOf(row.label);
    const hourStart = OPEN_MINUTE + Math.floor((minute - OPEN_MINUTE) / 60) * 60;
    const hourEnd = Math.min(hourStart + 60, CLOSE_MINUTE);
    if (hourStart !== currentStart) {
      currentStart = hourStart;
      cumulativeHour = null;
      hourRows.push(null);
    }
    cumulativeDay = appendObserved(cumulativeDay, row, session, OPEN_MINUTE, CLOSE_MINUTE);
    cumulativeHour = appendObserved(cumulativeHour, row, `${session} ${clockLabel(hourStart)}`, hourStart, hourEnd);
    dayPrefixes.push(cumulativeDay);
    hourPrefixes.push(cumulativeHour);
    hourRows[hourRows.length - 1] = cumulativeHour;
    hourPositions.push(hourRows.length - 1);
  }
  const windows = Object.freeze({
    year: Object.freeze([...historicalYear, dayPrefixes.at(-1)]),
    month: Object.freeze([...historicalMonth, ...hourRows]),
    day,
  });
  return Object.freeze({
    windows, meta: Object.freeze({ ...meta }), session,
    openMinute: OPEN_MINUTE, closeMinute: CLOSE_MINUTE, intervalMinutes: INTERVAL_MINUTES,
    historicalYear, historicalMonth, dayPrefixes: Object.freeze(dayPrefixes),
    hourPrefixes: Object.freeze(hourPrefixes), hourRows: Object.freeze(hourRows), hourPositions: Object.freeze(hourPositions),
    timestampConvention: 'completed-bar-start',
  });
}

/** Fractional beats select the last complete bar, matching the replay clock. */
export function replayFrame(model, beat = model.windows.day.length - 1) {
  if (!Number.isFinite(beat)) throw new TypeError('Replay beat must be finite');
  const index = Math.max(0, Math.min(model.windows.day.length - 1, Math.floor(beat)));
  const hourPosition = model.hourPositions[index];
  const current = Object.freeze({ year: model.dayPrefixes[index], month: model.hourPrefixes[index], day: model.windows.day[index] });
  const windows = Object.freeze({
    year: Object.freeze([...model.historicalYear, current.year]),
    month: Object.freeze([...model.historicalMonth, ...model.hourRows.slice(0, hourPosition), current.month]),
    day: Object.freeze(model.windows.day.slice(0, index + 1)),
  });
  const pens = Object.freeze({ year: model.historicalYear.length, month: model.historicalMonth.length + hourPosition, day: index });
  return Object.freeze({ index, asOf: current.day.endLabel, asOfTime: current.day.endLabel.slice(11), windows, pens, current });
}

/** Historical source rows use full spans; derived rows stop at their observed end. */
export function observedSpan(key, row) {
  if (key === 'year') return row.label;
  if (key !== 'month' && key !== 'day') throw new RangeError('Unknown replay window');
  const start = minuteOf(row.label);
  const end = row.endLabel ? minuteOf(row.endLabel) : Math.min(start + (key === 'month' ? 60 : INTERVAL_MINUTES), CLOSE_MINUTE);
  return `${clockLabel(start)}–${clockLabel(end)}`;
}
