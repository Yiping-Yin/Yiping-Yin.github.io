import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../portfolio-assets/playback-lifecycle.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
function fixture(initiallyHidden = false) {
  assert.equal(typeof api.pauseWhenHidden, 'function', 'lifecycle pause helper must exist');
  const doc = new EventTarget(), win = new EventTarget();
  doc.hidden = initiallyHidden;
  let calls = 0;
  const dispose = api.pauseWhenHidden(() => { calls += 1; }, { document: doc, window: win });
  return { doc, win, dispose, calls: () => calls, hide() { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }, show() { doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); } };
}
test('a visible page is not paused at attachment', () => { const f = fixture(); assert.equal(f.calls(), 0); f.dispose(); });
test('entering the background pauses playback', () => { const f = fixture(); f.hide(); assert.equal(f.calls(), 1); f.dispose(); });
test('returning to the foreground does not resume playback', () => { const f = fixture(); f.hide(); f.show(); assert.equal(f.calls(), 1); f.dispose(); });
test('pagehide also pauses before a page can enter the back-forward cache', () => { const f = fixture(); f.win.dispatchEvent(new Event('pagehide')); assert.equal(f.calls(), 1); f.dispose(); });
test('an initially hidden document pauses immediately', () => { const f = fixture(true); assert.equal(f.calls(), 1); f.dispose(); });
test('cleanup removes both listeners and can be repeated', () => { const f = fixture(); f.dispose(); f.dispose(); f.hide(); f.win.dispatchEvent(new Event('pagehide')); assert.equal(f.calls(), 0); });
test('a remount has one active listener, not accumulated listeners', () => { const f = fixture(); f.dispose(); let calls = 0; const dispose = api.pauseWhenHidden(() => calls++, { document: f.doc, window: f.win }); f.hide(); assert.equal(f.calls(), 0); assert.equal(calls, 1); dispose(); });
