/** Space time labels without resampling the equity paths they describe. */
export function timeTickIndices(length, plotWidth) {
  if (!Number.isSafeInteger(length) || length < 2 || !Number.isFinite(plotWidth) || plotWidth < 0) {
    throw new RangeError('Time ticks require at least two observations and a finite non-negative plot width.');
  }
  // 85 px between anchors leaves breathing room around five-character HH:MM labels.
  const count = Math.min(length, 4, Math.max(2, Math.floor(plotWidth / 85) + 1));
  return Array.from({ length: count }, (_, i) => Math.round(i * (length - 1) / (count - 1)));
}
