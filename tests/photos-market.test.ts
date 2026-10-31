import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CATALOG } from '../src/domain/catalog.ts';
import { parseBoard, sampleBoard } from '../src/domain/board.ts';
import { containImage, PEDAL_PHOTOS, pedalPhoto } from '../src/domain/photos.ts';
import { defaultMuleQuery, muleSearchUrl } from '../src/domain/market.ts';

test('bundled photograph is the unmodified verified blueSky V2 source', () => {
  const bytes = readFileSync(new URL('../public/images/pedals/strymon-bluesky-v2.png', import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 1000); assert.equal(bytes.readUInt32BE(20), 1100);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'cc44f09909a487d9dfc430423996dfb7a7d31811a90729d9fd4d2cd00b5b1081');
  assert.equal(Object.keys(PEDAL_PHOTOS).length, 1);
});
test('existing saved boards receive photos by ID without changing dimensions or accepting imported URLs', () => {
  const board = sampleBoard(), oldJson = JSON.stringify(board);
  const photo = pedalPhoto(board.items.find(i => i.pedalId === 'strymon-bluesky')!.pedal);
  assert.equal(photo?.src, '/images/pedals/strymon-bluesky-v2.png');
  assert.equal(JSON.stringify(board), oldJson);
  const custom = { ...CATALOG[0], id: 'custom-1', imageUrl: 'https://untrusted.example/a.png' };
  assert.equal(pedalPhoto(custom), undefined);
  const loaded = parseBoard({ ...board, items: [{ ...board.items[0], pedal: { ...board.items[0].pedal, imageUrl: 'https://untrusted.example/a.png' } }] });
  assert.equal('imageUrl' in loaded.items[0].pedal, false);
});
test('photo fits the mm frame without changing its aspect ratio or footprint', () => {
  const fit = containImage(1000, 1100, 101.6, 114.3);
  assert.ok(Math.abs(fit.width / fit.height - 1000 / 1100) < 1e-9);
  assert.ok(fit.x >= 0 && fit.y >= 0 && fit.x + fit.width <= 101.6 && fit.y + fit.height <= 114.3);
});
test('Mule links match observed category/status/title filters and encode all query text as one value', () => {
  for (const term of ['DS-1', 'blueSky V2', '보스 CE-2W', 'A&B + Mini #2? sell_status=판매완료']) {
    const url = new URL(muleSearchUrl(term)!);
    assert.equal(url.origin, 'https://www.mule.co.kr'); assert.equal(url.pathname, '/bbs/market/sell');
    assert.equal(url.searchParams.get('qs'), term); assert.equal(url.searchParams.get('ct1'), '이펙터');
    assert.equal(url.searchParams.get('sell_status'), '판매중'); assert.equal(url.searchParams.get('qf'), 'title');
    assert.equal(url.searchParams.getAll('sell_status').length, 1); assert.equal(url.hash, '');
  }
  assert.equal(new URL(muleSearchUrl('DS-1', false)!).searchParams.get('sell_status'), '');
  assert.equal(muleSearchUrl('   '), null); assert.equal(muleSearchUrl('a'.repeat(121)), null);
  assert.equal(defaultMuleQuery(CATALOG.find(p => p.id === 'strymon-bluesky')!), 'blueSky V2');
});
