import { focusFrame } from './market-arcs-focus.mjs';

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const DAY_MS = 86_400_000;
const pad = value => String(value).padStart(2, '0');
const clock = value => `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
const ownRows = (rows, indices) => Object.freeze(indices.map(archiveIndex => Object.freeze({ ...rows[archiveIndex], archiveIndex })));

function minute(label) {
  if (typeof label !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(label)) return null;
  const h = Number(label.slice(11, 13)), m = Number(label.slice(14, 16));
  return h < 24 && m < 60 ? h * 60 + m : null;
}

function bounds(row, key) {
  if (key === 'year') {
    const start = Date.parse(`${row.label}T00:00:00Z`) / DAY_MS;
    if (!Number.isFinite(start)) throw new TypeError('Daily rows require a YYYY-MM-DD label');
    return { start, end: start + 1, scheduledEnd: start + 1 };
  }
  const start = minute(row.label);
  if (start === null) throw new TypeError('Intraday rows require a YYYY-MM-DD HH:MM label');
  const scheduledEnd = Math.min(start + (key === 'month' ? 60 : 5), CLOSE);
  const observed = row.endLabel?.slice(0, 10) === row.label.slice(0, 10) ? minute(row.endLabel) : null;
  const end = observed === null ? scheduledEnd : Math.min(scheduledEnd, observed);
  if (end <= start) throw new RangeError('An observation must end after its start');
  return { start, end, scheduledEnd };
}

function span(session, start, end, observedEnd) {
  const observed = Math.max(start, Math.min(end, observedEnd));
  return Object.freeze({
    session, start, end, observedEnd: observed, duration: end - start,
    observedDuration: observed - start,
    startLabel: `${session} ${clock(start)}`, endLabel: `${session} ${clock(end)}`,
    observedEndLabel: `${session} ${clock(observed)}`,
    label: `${clock(start)}–${clock(end)}`,
    observedLabel: `${clock(start)}–${clock(observed)}`,
  });
}

/**
 * Build the selected day's children from the observed replay snapshot only.
 * Archive indices mean indices in snapshot.windows, which is a prefix of the
 * normalized replay archive. No raw or future archive is read by this module.
 *
 * A year selection exposes the whole observed session (wholeSession = true).
 * A month/day selection exposes only the selected hour's five-minute children.
 * The renderer may withhold whole-session minuteRows until an hour is selected.
 * Span start/end are scheduled local-clock minutes; observedEnd stops at the
 * observed prefix. Use the fixed scheduled domain while replaying so geometry
 * does not stretch as new observations arrive.
 */
export function selectionView(snapshot, selection = null) {
  const focus = focusFrame(snapshot, selection);
  const windows = snapshot?.windows || {};
  const rootIndex = focus.year.active;
  const rootRow = rootIndex === null ? null : Object.freeze({ ...windows.year[rootIndex], archiveIndex: rootIndex });
  const hourRows = ownRows(windows.month || [], focus.month.indices);
  const minuteRows = ownRows(windows.day || [], focus.day.indices);
  const selectedHourIndex = focus.hourLabel === null ? null : focus.month.active;
  const selectedHour = selectedHourIndex === null ? null : hourRows.find(row => row.archiveIndex === selectedHourIndex) || null;
  const observedEnds = [...hourRows.map(row => bounds(row, 'month').end), ...minuteRows.map(row => bounds(row, 'day').end)];
  const coarseSpan = focus.session ? span(focus.session, OPEN, CLOSE, observedEnds.length ? Math.max(...observedEnds) : OPEN) : null;
  let fineSpan = focus.wholeSession ? coarseSpan : null;
  if (selectedHour) {
    const hour = bounds(selectedHour, 'month');
    fineSpan = span(focus.session, hour.start, hour.scheduledEnd, hour.end);
  } else if (!fineSpan && minuteRows.length) {
    // An isolated fine observation can remain visible without inventing its
    // missing hourly parent. Use the first/last actually observed bar bounds.
    const first = bounds(minuteRows[0], 'day'), last = bounds(minuteRows.at(-1), 'day');
    fineSpan = span(focus.session, first.start, last.scheduledEnd, last.end);
  }
  return Object.freeze({
    rootRow, rootIndex, root: rootRow ? Object.freeze({ row: rootRow, index: rootIndex }) : null,
    hourRows, minuteRows, coarseSpan, fineSpan, selectedHourIndex, selectedHour,
    selectedMinuteIndex: focus.selection?.key === 'day' ? focus.selection.index : null,
    session: focus.session, wholeSession: focus.wholeSession, selection: focus.selection,
    unavailable: focus.unavailable, description: focus.description, focus,
  });
}

/**
 * Convenience layout for discrete indices without timestamps. Sorts by archive
 * order and returns { archiveIndex, angle }; one record sits at the arc centre.
 * Use layoutRecords for market rows: it preserves gaps and half-hour widths.
 */
export function layoutAcross(indices, startAngle = Math.PI - 0.16, endAngle = 0.16) {
  if (!Array.isArray(indices) || indices.some(index => !Number.isInteger(index) || index < 0)) throw new TypeError('Indices must be nonnegative integers');
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) throw new TypeError('Angles must be finite');
  const ordered = [...new Set(indices)].sort((a, b) => a - b);
  return Object.freeze(ordered.map((archiveIndex, index) => Object.freeze({
    archiveIndex, angle: startAngle + (endAngle - startAngle) * (ordered.length === 1 ? 0.5 : index / (ordered.length - 1)),
  })));
}

/**
 * Timestamp layout with intervals, retaining calendar/weekend and missing-data
 * gaps. Intraday records must all belong to one New York local session; this
 * deliberately avoids converting a local label through the browser timezone.
 *
 * Options: key = year|month|day; domain = { start, end } (a selectionView span
 * can be passed directly); optional startAngle/endAngle. Intraday domain units
 * are local minutes after midnight. Daily units are UTC calendar-day ordinals.
 * Default intraday domain is 09:30–16:00; default daily domain is first date to
 * one day after last date. Pass fineSpan for the selected hour's expansion.
 *
 * angle is the observation's temporal midpoint; startAngle/endAngle encode its
 * observed duration. scheduledEndAngle exposes the full expected interval if
 * a renderer wants to distinguish the completed prefix of a partial hour.
 */
export function layoutRecords(rows, { key = 'month', domain, startAngle = Math.PI - 0.16, endAngle = 0.16 } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Rows must be an array');
  if (!['year', 'month', 'day'].includes(key)) throw new RangeError('Unknown time scale');
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) throw new TypeError('Angles must be finite');
  if (!rows.length) return Object.freeze([]);
  const ordered = rows.map((row, index) => ({ row, archiveIndex: Number.isInteger(row.archiveIndex) ? row.archiveIndex : index, ...bounds(row, key) }))
    .sort((a, b) => a.start - b.start);
  if (key !== 'year' && new Set(rows.map(row => row.label.slice(0, 10))).size !== 1) throw new RangeError('Intraday layout requires a single session');
  if (ordered.some((row, index) => index && row.start <= ordered[index - 1].start)) throw new RangeError('Observation start times must be unique');
  const start = domain?.start ?? (key === 'year' ? ordered[0].start : OPEN);
  const end = domain?.end ?? (key === 'year' ? ordered.at(-1).scheduledEnd : CLOSE);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError('Time domain must be increasing and finite');
  if (ordered.some(row => row.start < start || row.end > end)) throw new RangeError('Observations must fit within the supplied time domain');
  const angleAt = time => startAngle + (endAngle - startAngle) * (time - start) / (end - start);
  return Object.freeze(ordered.map(({ row, archiveIndex, start: observedStart, end: observedEnd, scheduledEnd }) => Object.freeze({
    row, archiveIndex, start: observedStart, end: observedEnd, scheduledEnd,
    angle: angleAt((observedStart + observedEnd) / 2),
    startAngle: angleAt(observedStart), endAngle: angleAt(observedEnd),
    scheduledEndAngle: angleAt(Math.min(scheduledEnd, end)),
    duration: observedEnd - observedStart, domain: Object.freeze({ start, end }),
  })));
}
