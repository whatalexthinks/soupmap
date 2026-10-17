import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShortlist, shortlistHash, SHORTLIST_HASH_LIMIT } from '../src/shortlist.ts';

const valid = new Set(['afuri-ebisu', 'ichiran-nakasu']);
test('shortlist links round trip only chosen IDs and deduplicate', () => {
  assert.deepEqual(parseShortlist(shortlistHash(['afuri-ebisu', 'afuri-ebisu']), valid),
    { ids: ['afuri-ebisu'], missing: 0, error: null });
  assert.equal(parseShortlist('#afuri-ebisu', valid), null);
});
test('deleted IDs are counted without hiding available shops', () => {
  assert.deepEqual(parseShortlist('#shortlist=v1&id=gone&id=afuri-ebisu&id=gone', valid),
    { ids: ['afuri-ebisu'], missing: 1, error: null });
  assert.deepEqual(parseShortlist('#shortlist=v1&id=gone', valid)?.ids, []);
});
test('invalid, empty, unsupported and excessive links fail explicitly', () => {
  for (const hash of [
    '#shortlist=v2&id=afuri-ebisu', '#shortlist=v1', '#shortlist=v1&id=',
    '#shortlist=v1&id=%E0%A4%A', '#shortlist=v1&id=%3Cscript%3E',
    '#shortlist=v1&shortlist=v1&id=afuri-ebisu',
    '#shortlist=v1' + '&id=afuri-ebisu'.repeat(21),
    '#shortlist=v1&id=' + 'a'.repeat(SHORTLIST_HASH_LIMIT),
  ]) {
    const result = parseShortlist(hash, valid);
    assert.ok(result?.error, hash.slice(0, 80));
    assert.deepEqual(result.ids, []);
  }
  assert.throws(() => shortlistHash([]));
  assert.throws(() => shortlistHash(Array(21).fill('afuri-ebisu')));
  assert.throws(() => shortlistHash(['not a slug']));
});
test('boundary size is accepted and a 200-character ID stays bounded', () => {
  const ids = Array.from({length:20}, (_, i) => `shop-${i}-${'a'.repeat(180)}`);
  assert.equal(parseShortlist(shortlistHash(ids), new Set(ids))?.ids.length, 20);
});
