import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const path = new URL('../portfolio-assets/source-export.mjs', import.meta.url);
const api = existsSync(path) ? await import(path) : null;
function ready() { assert.ok(api, 'source-export.mjs must implement the export contract'); return api; }
function environment(failure) {
  const events = []; let blob;
  const anchor = { click() { events.push('click'); if (failure === 'click') throw Error('blocked'); }, remove() { events.push('remove'); } };
  const env = {
    Blob,
    URL: { createObjectURL(b) { if (failure === 'url') throw Error('unsupported'); blob = b; return 'blob:unit-test'; }, revokeObjectURL(url) { events.push('revoke:' + url); } },
    document: { createElement() { return anchor; }, body: { appendChild(a) { assert.equal(a, anchor); events.push('append'); } } },
    setTimeout(callback, delay) { assert.ok(delay >= 1000); events.push('timer'); env.cleanup = callback; }
  };
  return { env, events, anchor, get blob() { return blob; } };
}
test('exports the exact UTF-8 source including blank lines and final newline', async () => {
  const a = ready(), f = environment(), source = '# 中文 π\n\ndef on_bar(history, account, state):\n    return None\n';
  a.downloadPythonSource(source, 'hold', f.env);
  assert.equal(await f.blob.text(), source);
  assert.equal(f.anchor.download, 'pbook-hold.py');
  assert.equal(f.blob.type, 'text/x-python;charset=utf-8');
  assert.deepEqual(f.events, ['append','click','remove','timer']);
  f.env.cleanup(); assert.equal(f.events.at(-1), 'revoke:blob:unit-test');
});
test('does not silently add a newline or replace an empty current draft', async () => {
  const a = ready();
  for (const source of ['', 'return None', '\n\n', 'x = 1\r\n']) {
    const f=environment(); a.downloadPythonSource(source,'trend',f.env); assert.equal(await f.blob.text(),source);
  }
});
test('rejects unavailable source rather than exporting a fallback', () => {
  const a=ready(); for (const value of [undefined,null,1,{}]) assert.throws(()=>a.downloadPythonSource(value,'trend',environment().env),TypeError);
});
test('sanitizes generated filenames', () => {
  const a=ready(); assert.equal(a.sourceFilename('../a/b? c'),'pbook-a-b-c.py'); assert.equal(a.sourceFilename(''),'pbook-strategy.py');
});
test('cleans up and reports blocked downloads', () => {
  const a=ready(), f=environment('click'); assert.throws(()=>a.downloadPythonSource('x','hold',f.env),/blocked/);
  assert.deepEqual(f.events,['append','click','remove','revoke:blob:unit-test']);
});
test('reports unavailable Blob URL support without touching the document', () => {
  const a=ready(), f=environment('url'); assert.throws(()=>a.downloadPythonSource('x','hold',f.env),/unsupported/); assert.deepEqual(f.events,[]);
});
