/** Keep SVG user units aligned with CSS pixels, including after resizing.
 * Measuring the rendered SVG preserves each existing chart's layout slot.
 */
export function observePlotSize(element, onSize, environment = globalThis) {
  if (!element) return () => {};
  let active = true, previous = '';
  const measure = () => {
    if (!active) return;
    const { width, height } = element.getBoundingClientRect();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
    const size = { width: Math.round(width), height: Math.round(height) };
    const key = `${size.width}:${size.height}`;
    if (key === previous) return;
    previous = key;
    onSize(size);
  };
  measure();
  if (environment.ResizeObserver) {
    const observer = new environment.ResizeObserver(measure);
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }
  environment.window.addEventListener('resize', measure);
  return () => { active = false; environment.window.removeEventListener('resize', measure); };
}
