import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const url = new URL('../portfolio-assets/chart-ticks.mjs', import.meta.url);
async function ticks() {
  assert.ok(existsSync(url), 'Responsive time tick selector must exist');
  return (await import(url.href)).timeTickIndices;
}
test('narrow plot uses only first and last completed minutes', async () => {
  const f = await ticks(); assert.deepEqual(f(390, 140), [0, 389]);
});
test('phone plot uses three evenly spaced time labels', async () => {
  const f = await ticks(); assert.deepEqual(f(390, 220), [0, 195, 389]);
});
test('desktop preserves four endpoint-inclusive labels', async () => {
  const f = await ticks(); assert.deepEqual(f(390, 900), [0, 130, 259, 389]);
});
test('tick density is monotone and indices are unique across supported widths', async () => {
  const f = await ticks(); let count = 0;
  for (let w = 100; w <= 1000; w++) {
    const r=f(390,w); assert.ok(r.length>=count); count=r.length;
    assert.equal(r[0],0); assert.equal(r.at(-1),389);
    assert.equal(new Set(r).size,r.length);
    for(let i=1;i<r.length;i++) assert.ok((r[i]-r[i-1])/389*w>=80);
  }
});
test('short paths never duplicate labels', async () => {
  const f=await ticks(); assert.deepEqual(f(2,900),[0,1]); assert.deepEqual(f(3,900),[0,1,2]);
});
test('invalid dimensions and paths are rejected', async () => {
  const f=await ticks();
  for(const [n,w] of [[1,200],[3.5,200],[390,NaN],[390,-1],[NaN,300]]) assert.throws(()=>f(n,w));
});
