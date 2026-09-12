// Link the three resolutions using the observations in a replay snapshot only.
// All intraday labels use the source's New York local session clock.
const KEYS = ['year', 'month', 'day'];
const CLOSE_MINUTE = 16 * 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function dateOf(row) {
  return typeof row?.label === 'string' && /^\d{4}-\d{2}-\d{2}(?:$| )/.test(row.label) ? row.label.slice(0, 10) : null;
}

function minuteOf(label) {
  if (typeof label !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(label)) return null;
  const hour = Number(label.slice(11, 13)), minute = Number(label.slice(14, 16));
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function interval(key, row) {
  const start = minuteOf(row?.label);
  if (start === null) return null;
  const scheduledEnd = Math.min(start + (key === 'month' ? 60 : 5), CLOSE_MINUTE);
  const observedEnd = dateOf({ label: row.endLabel }) === dateOf(row) ? minuteOf(row.endLabel) : null;
  const end = observedEnd === null ? scheduledEnd : Math.min(scheduledEnd, observedEnd);
  return end > start ? { start, end } : null;
}

const matching = (rows, predicate) => rows.flatMap((row, index) => predicate(row) ? [index] : []);
const last = indices => indices.length ? indices[indices.length - 1] : null;
const group = (indices, active = last(indices)) => Object.freeze({ indices: Object.freeze(indices), active });
const readableDate = session => `${Number(session.slice(8))} ${MONTHS[Number(session.slice(5, 7)) - 1]} ${session.slice(0, 4)}`;

/**
 * Default focus links the current daily bar, all observed hours of its session,
 * and only the five-minute bars inside its current hour. A year selection shows
 * the whole selected session; a month/day selection focuses one observed hour.
 * `indices` and `active` refer to snapshot.windows, never the full data archive.
 * Missing finer history is returned as unavailable, with no synthetic records.
 */
export function focusFrame(snapshot, selection) {
  const windows = Object.fromEntries(KEYS.map(key => [key, Array.isArray(snapshot?.windows?.[key]) ? snapshot.windows[key] : []]));
  const valid = candidate => candidate && KEYS.includes(candidate.key)
    && Number.isInteger(candidate.index) && candidate.index >= 0
    && dateOf(windows[candidate.key][candidate.index])
    && (candidate.key === 'year' || interval(candidate.key, windows[candidate.key][candidate.index]));
  let selected = valid(selection) ? { key: selection.key, index: selection.index } : null;
  if (!selected) {
    // Prefer the finest current observation when a reduced snapshot has no
    // current hourly record; never silently select a different historical day.
    const currentSession = dateOf(snapshot?.current?.day) || dateOf(windows.day.at(-1))
      || dateOf(snapshot?.current?.month) || dateOf(windows.month.at(-1)) || dateOf(windows.year.at(-1));
    for (const key of ['month', 'day', 'year']) {
      const pen = { key, index: snapshot?.pens?.[key] };
      const index = valid(pen) && dateOf(windows[key][pen.index]) === currentSession
        ? pen.index : last(matching(windows[key], row => dateOf(row) === currentSession));
      const candidate = { key, index };
      if (valid(candidate)) { selected = candidate; break; }
    }
  }
  if (!selected) return Object.freeze({
    year: group([]), month: group([]), day: group([]), session: null,
    hourLabel: null, hourSpan: null, wholeSession: false, selection: null,
    unavailable: Object.freeze({ year: true, month: true, day: true }),
    description: 'No observed market data is available in this replay snapshot.',
  });

  const row = windows[selected.key][selected.index], session = dateOf(row);
  const yearIndices = matching(windows.year, candidate => dateOf(candidate) === session);
  const monthIndices = matching(windows.month, candidate => dateOf(candidate) === session);
  let hourIndex = selected.key === 'month' ? selected.index : null;
  if (selected.key === 'day') {
    const bar = interval('day', row);
    hourIndex = monthIndices.find(index => {
      const hour = interval('month', windows.month[index]);
      return hour && bar.start >= hour.start && bar.start < hour.end && bar.end <= hour.end;
    }) ?? null;
  }
  const hour = hourIndex === null ? null : interval('month', windows.month[hourIndex]);
  const dayIndices = matching(windows.day, candidate => {
    if (dateOf(candidate) !== session) return false;
    if (selected.key === 'year') return true;
    if (!hour) return selected.key === 'day' && candidate === row;
    const bar = interval('day', candidate);
    // A five-minute bar starting at 10:30 belongs to the following hour, while
    // the 10:25 bar ending at 10:30 belongs to the preceding hour.
    return bar && bar.start >= hour.start && bar.start < hour.end && bar.end <= hour.end;
  });
  const yearGroup = group(yearIndices, selected.key === 'year' ? selected.index : last(yearIndices));
  const monthGroup = group(monthIndices, hourIndex ?? last(monthIndices));
  const dayGroup = group(dayIndices, selected.key === 'day' ? selected.index : last(dayIndices));
  const unavailable = Object.freeze({ year: !yearIndices.length, month: !monthIndices.length, day: !dayIndices.length });
  const hourSpan = hour ? `${clock(hour.start)}–${clock(hour.end)}` : null;
  const parts = [`${readableDate(session)}: ${yearIndices.length ? 'daily bar' : 'daily history unavailable'}`];
  parts.push(monthIndices.length ? `linked to ${monthIndices.length} observed hourly ${monthIndices.length === 1 ? 'bar' : 'bars'}.` : 'with no hourly history available.');
  if (dayIndices.length) {
    parts.push(`${hourSpan ? `${hourSpan} ET contains` : 'The session contains'} ${dayIndices.length} observed five-minute ${dayIndices.length === 1 ? 'bar' : 'bars'}.`);
  } else parts.push('Five-minute history is unavailable for this selection.');
  if (snapshot?.asOf) parts.push(`Historical replay through ${snapshot.asOf} ET.`);
  return Object.freeze({
    year: yearGroup, month: monthGroup, day: dayGroup, session,
    hourLabel: hourIndex === null ? null : windows.month[hourIndex].label,
    hourSpan, wholeSession: selected.key === 'year', selection: Object.freeze(selected),
    unavailable, description: parts.join(' '),
  });
}
