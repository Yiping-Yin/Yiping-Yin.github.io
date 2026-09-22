/** Pause on background/navigation; never restart without an explicit action.
 * The returned cleanup belongs to the calling component's effect lifecycle.
 */
export function pauseWhenHidden(pause, environment = globalThis) {
  const doc = environment.document;
  const win = environment.window;
  const onVisibility = () => { if (doc.hidden) pause(); };
  const onPageHide = () => pause();
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  onVisibility();
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
  };
}
