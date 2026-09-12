import { year as sourceYear } from './market-arcs-data.mjs';
import { sectionView } from './market-section-model.mjs';
import { layoutRecords } from './market-scale-model.mjs';

const TAU = Math.PI * 2;
const DAY_MS = 86_400_000;
const localMinute = label => Number(label.slice(11, 13)) * 60 + Number(label.slice(14, 16));

function calendarDay(label) {
  const timestamp = Date.parse(`${label}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== label) throw new TypeError('Daily labels must be valid YYYY-MM-DD dates');
  return timestamp / DAY_MS;
}

// Read the source's date boundaries only, never its prices. The fixed inclusive
// calendar window does not rescale during rewind or a shortened replay prefix.
const firstDay = calendarDay(sourceYear[0].label);
const lastDay = calendarDay(sourceYear.at(-1).label);
const endDay = lastDay + 1;
const annualDomain = Object.freeze({
  startDate: sourceYear[0].label, endDate: sourceYear.at(-1).label,
  endExclusiveDate: new Date(endDay * DAY_MS).toISOString().slice(0, 10),
  calendarDays: endDay - firstDay,
});

function annualLayout(rows) {
  const ordered = rows.map((row, archiveIndex) => ({ row, archiveIndex, day: calendarDay(row.label) }))
    .sort((a, b) => a.day - b.day);
  if (ordered.some((item, i) => item.day < firstDay || item.day >= endDay || (i && item.day === ordered[i - 1].day))) {
    throw new RangeError('Daily observations must have unique dates inside the source calendar window');
  }
  const angleAt = day => (day - firstDay) / annualDomain.calendarDays * TAU;
  return Object.freeze(ordered.map(({ row, archiveIndex, day }, index) => {
    const previousClose = index ? ordered[index - 1].row.close : null;
    const returnValue = Number.isFinite(previousClose) && previousClose !== 0 && Number.isFinite(row.close)
      ? row.close / previousClose - 1 : null;
    return Object.freeze({
      row: Object.freeze({ ...row }), archiveIndex,
      startAngle: angleAt(day), endAngle: angleAt(day + 1), angle: angleAt(day + 0.5),
      returnValue,
    });
  }));
}

function sharedPriceBand(section) {
  // A current-session daily row is derived by replay from observed fine bars;
  // historical daily rows already precede the replay timestamp. They therefore
  // supply the same observed day's price scale to both finer representations.
  const rows = section.rootRow ? [section.rootRow] : [...section.hourRows, ...section.minuteRows];
  if (!rows.length) return null;
  const low = Math.min(...rows.map(row => row.low)), high = Math.max(...rows.map(row => row.high));
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return null;
  return Object.freeze({ low, high, min: low, max: high, range: high - low });
}

/**
 * One observed market session interpreted at calendar, day and hour scales.
 * Daily dates fill a fixed source calendar circle, with weekend slots empty.
 * returnValue is a decimal close-to-previous-observed-trading-close return,
 * never open-to-close; the first daily record has no known prior return.
 *
 * Hour angles use a literal 24-hour domain. A full 09:30–16:00 session spans
 * 390 / 1440 of a turn (97.5 degrees), and partial hours stop at observed ends.
 *
 * Fine points describe completed five-minute CLOSE observations: `minute` is
 * each bar's observed end clock time, `startMinute` its start. elapsedFraction
 * uses the selected hour's scheduled span, including the final 30-minute hour.
 * Consecutive segments are explicitly separated at missing observations; a
 * renderer should connect a point only when connectFromPrevious is true.
 * No raw price or child history is read outside the supplied replay snapshot.
 */
export function cycleView(snapshot, selection = null) {
  const section = sectionView(snapshot, selection);
  const annual = annualLayout(snapshot?.windows?.year || []);
  const hours = layoutRecords(section.hourRows, {
    key: 'month', domain: { start: 0, end: 1440 }, startAngle: 0, endAngle: TAU,
  });
  const selectedHour = hours.find(item => item.archiveIndex === section.selectedHourIndex) || null;
  let previousEnd = null, segmentIndex = -1;
  const hourSpan = section.fineSpan;
  const minuteRows = selectedHour && hourSpan ? section.minuteRows : [];
  const minutes = Object.freeze([...minuteRows].sort((a, b) => a.label.localeCompare(b.label)).map(row => {
    const startMinute = localMinute(row.label);
    const minute = row.endLabel ? localMinute(row.endLabel) : Math.min(startMinute + 5, 960);
    const connectFromPrevious = previousEnd !== null && startMinute === previousEnd;
    if (!connectFromPrevious) segmentIndex++;
    previousEnd = minute;
    const elapsedFraction = (minute - hourSpan.start) / hourSpan.duration;
    if (!Number.isFinite(elapsedFraction) || elapsedFraction < 0 || elapsedFraction > 1) throw new RangeError('Fine observation must lie inside its selected hour');
    return Object.freeze({
      row, archiveIndex: row.archiveIndex, startMinute, minute,
      elapsedFraction, close: row.close, segmentIndex, connectFromPrevious,
    });
  }));
  return Object.freeze({
    annual, annualDomain, session: section.session, hours, minutes,
    rootRow: section.rootRow, rootIndex: section.rootIndex,
    selectedHour, selectedHourIndex: section.selectedHourIndex,
    selectedMinuteIndex: section.selectedMinuteIndex,
    priceBand: sharedPriceBand(section), daySpan: section.coarseSpan, hourSpan,
    unavailable: Object.freeze({ ...section.unavailable, month: !hours.length, day: !minutes.length }),
    focus: section.focus,
    description: `${section.focus.description} Annual positions follow calendar dates. Intraday angle follows a 24-hour day; the regular 09:30–16:00 session occupies 97.5 degrees. Fine points mark observed five-minute closes within the selected hour, with gaps left unconnected.`,
  });
}
