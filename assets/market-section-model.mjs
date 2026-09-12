import { selectionView, layoutRecords } from './market-scale-model.mjs';

/** Display windows for a local magnification, not literal clock-face duration. */
export const SECTION_WINDOWS = Object.freeze({
  hours: Object.freeze({ startAngle: 1.64, endAngle: 0.70 }),
  minutes: Object.freeze({ startAngle: 1.56, endAngle: 0.62 }),
});

/**
 * A local temporal section of one observed daily bar. Selecting a day chooses
 * that day's last observed hour; selecting an hour or five-minute bar preserves
 * its existing parent relationship. Missing child history stays empty.
 *
 * Layout positions are magnifications: the same 0.94-radian display span shows
 * the session's hours and, separately, one hour's minutes. This angular width
 * does not claim to be the literal fraction of a day or clock cycle. Within
 * each window, intervals preserve their actual local-time durations and gaps.
 * Scheduled domains remain fixed while replay's observed end advances, so an
 * unfinished hour exposes only its completed prefix. A final half-hour gets
 * its own full magnified window while retaining its actual 30-minute domain.
 *
 * Indices always address the snapshot's observed normalized archive prefix.
 * `selection` retains the initial resolved selection; `effectiveSelection`
 * identifies the chosen hour after resolving an explicit daily selection.
 */
export function sectionView(snapshot, selection = null) {
  const initial = selectionView(snapshot, selection);
  let view = initial;
  if (initial.wholeSession && initial.hourRows.length) {
    view = selectionView(snapshot, {
      key: 'month', index: initial.hourRows.at(-1).archiveIndex,
    });
  }
  const hours = layoutRecords(view.hourRows, {
    key: 'month', domain: view.coarseSpan, ...SECTION_WINDOWS.hours,
  });
  const minutes = layoutRecords(view.minuteRows, {
    key: 'day', domain: view.fineSpan, ...SECTION_WINDOWS.minutes,
  });
  const selectedHour = hours.find(item => item.archiveIndex === view.selectedHourIndex) || null;
  const selectedMinute = view.selectedMinuteIndex === null
    ? null : minutes.find(item => item.archiveIndex === view.selectedMinuteIndex) || null;
  return Object.freeze({
    rootRow: view.rootRow, rootIndex: view.rootIndex, root: view.root,
    session: view.session, hours, minutes,
    hourRows: view.hourRows, minuteRows: view.minuteRows,
    selectedHourIndex: view.selectedHourIndex, selectedMinuteIndex: view.selectedMinuteIndex,
    selectedHour, selectedMinute,
    coarseSpan: view.coarseSpan, fineSpan: view.fineSpan,
    span: view.fineSpan || view.coarseSpan,
    selection: initial.selection, effectiveSelection: view.selection,
    focus: view.focus, unavailable: view.unavailable,
    windows: SECTION_WINDOWS,
    description: `${view.description} The hour and five-minute sections are local magnifications; their display angles do not represent literal clock durations.`,
  });
}
