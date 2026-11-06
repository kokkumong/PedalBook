import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalog, catalogDiff } from '../scripts/catalog/normalize.mjs';
const row = { Brand: 'Example', Name: 'Drive', Width: 2.5, Height: 4.5, Image: 'example-drive.png' };
test('catalog IDs survive reorder, new rows and dimension corrections; inches convert to mm', () => {
  const a = normalizeCatalog([row], 'pedals')[0];
  const b = normalizeCatalog([{ ...row, Name: 'Other' }, { ...row, Width: 3 }], 'pedals')[1];
  assert.equal(a.id, b.id); assert.equal(a.widthMm, 63.5); assert.equal(a.heightMm, 114.3);
  assert.notEqual(normalizeCatalog([row], 'boards')[0].id, a.id);
  assert.equal(catalogDiff([a], [b]).changed, 1);
  assert.deepEqual(catalogDiff([a], []), { added: 0, removed: 1, changed: 0 });
});
test('all rows stay represented, including missing image extension and same-name variants', () => {
  const rows = normalizeCatalog([row, { ...row, Image: 'other' }], 'pedals');
  assert.equal(rows.length, 2); assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(normalizeCatalog([{ ...row, Image: 'boss-ds1.png' }], 'pedals')[0].id, 'boss-ds1');
});
test('invalid upstream units, paths, duplicate identities or shapes fail the entire normalization', () => {
  for (const bad of [{ ...row, Width: -1 }, { ...row, Width: '3' }, { ...row, Height: NaN }, { ...row, Image: '../private.png' }, { ...row, Image: 'https://elsewhere/a.png' }]) assert.throws(() => normalizeCatalog([row, bad], 'pedals'));
  assert.throws(() => normalizeCatalog([row, row], 'pedals')); assert.throws(() => normalizeCatalog({}, 'boards'));
});
