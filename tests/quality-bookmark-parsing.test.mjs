import test from 'node:test';
import assert from 'node:assert/strict';
import {replayLink, readReplayMoment} from '../portfolio-assets/quality-model.mjs';

const entry = {
  published: true,
  marketKind: 'historical',
  result: {
    runId: 'a'.repeat(64),
    datasetChecksum: 'b'.repeat(64),
    equity: [{equity: 100}, {equity: 100}, {equity: 100}]
  }
};
const link = replayLink('https://example.test', entry, 0);

// A second fragment query separator must never hide a contradictory suffix.
for (const suffix of ['?minute=2', '?run=' + 'c'.repeat(64), '?tape=' + 'c'.repeat(64), '?', '??minute=2']) {
  test(`reject a second fragment query separator: ${suffix}`, () => {
    assert.deepEqual(readReplayMoment(link + suffix, entry), {status:'invalid'});
  });
}
test('reject a separator inserted before the bookmark fields', () => {
  const broken = link.replace('&tape=', '?tape=');
  assert.deepEqual(readReplayMoment(broken, entry), {status:'invalid'});
});
test('the page query and the single fragment query remain valid together', () => {
  assert.deepEqual(readReplayMoment(link, entry), {status:'valid', cursor:0});
});
test('an encoded question mark is data rather than a fragment separator', () => {
  assert.deepEqual(readReplayMoment(link + '&note=%3F', entry), {status:'valid', cursor:0});
});
test('ordinary legacy replay links still leave the remembered cursor alone', () => {
  const legacy = `https://example.test/training.html?market=historical#/market?view=replay&run=${entry.result.runId}`;
  assert.deepEqual(readReplayMoment(legacy, entry), {status:'absent'});
});
