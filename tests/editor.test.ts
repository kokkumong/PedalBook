import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, searchCatalog } from '../src/domain/catalog.ts';
import { addItem, emptyBoard, sampleBoard, parseBoard, parseBoardFile, clampPosition, updateItem, placementWarnings, resizeBoard, createCustomBoard, viewportTransform, screenToMm, MAX_PEDALS } from '../src/domain/board.ts';
import { budget, marketState, parsePrice, searchPhrase } from '../src/domain/market.ts';
import type { MarketQuote } from '../src/domain/market.ts';
import { loadBoard, saveBoard, decodeEnvelope, LEGACY_KEY, STORAGE_KEY } from '../src/domain/storage.ts';

const legacy = () => { const board = sampleBoard(); return { schemaVersion: 1, name: '이전 보드', width: board.widthMm, height: board.heightMm, items: board.items.map(i => ({ id: i.instanceId, pedal: { ...i.pedal, width: i.pedal.widthMm, height: i.pedal.heightMm, source: i.pedal.sourceUrl }, x: i.xMm, y: i.yMm, rotation: i.rotationDeg })) }; };
const now = Date.parse('2026-10-31T00:00:00Z');
const quote: MarketQuote = { pedalId: CATALOG[0].id, source: 'mule', currency: 'KRW', metric: 'asking', medianKrw: 100000, lowKrw: 90000, highKrw: 110000, sampleCount: 5, observedAt: new Date(now).toISOString(), sourceUrls: ['https://www.mule.co.kr/bbs/market/sell?idx=fixture'] };
const memory = () => { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };

test('v1 migration preserves dimensions, centers and instance IDs without invented prices', () => {
  const old = legacy(), migrated = parseBoard(old);
  assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.name, old.name);
  assert.equal(migrated.widthMm, old.width);
  migrated.items.forEach((i, index) => { assert.equal(i.instanceId, old.items[index].id); assert.equal(i.xMm, old.items[index].x); assert.equal(i.pedal.heightMm, old.items[index].pedal.height); assert.equal(i.manualPriceKrw, null); assert.equal(i.owned, false); });
  assert.deepEqual(parseBoardFile(JSON.stringify(migrated)), migrated);
});
test('invalid JSON, oversized files, duplicated IDs and invalid coordinates/prices are rejected', () => {
  assert.throws(() => parseBoardFile('{')); assert.throws(() => parseBoardFile('한'.repeat(90000)));
  const board = sampleBoard(); assert.throws(() => parseBoard({ ...board, items: [board.items[0], board.items[0]] }));
  for (const patch of [{ xMm: NaN }, { manualPriceKrw: -1 }, { manualPriceKrw: 1.2 }, { rotationDeg: 45 }, { pedalId: 'wrong' }]) assert.throws(() => parseBoard({ ...board, items: [{ ...board.items[0], ...patch }] }));
});
test('imported links are limited to catalog sources and custom links are removed', () => {
  const board = sampleBoard(), i = board.items[0];
  const known = parseBoard({ ...board, items: [{ ...i, pedal: { ...i.pedal, sourceUrl: 'javascript:alert(1)' } }] });
  assert.equal(known.items[0].pedal.sourceUrl, i.pedal.sourceUrl);
  const custom = parseBoard({ ...board, items: [{ ...i, pedalId: 'custom', pedal: { ...i.pedal, id: 'custom', sourceUrl: 'https://example.com' } }] });
  assert.equal(custom.items[0].pedal.sourceUrl, null);
});
test('screen/mm conversion remains inverse through zoom and pan', () => {
  const board = sampleBoard(), point = { xMm: 132.5, yMm: 98.25 };
  for (const zoom of [.5, 1, 2]) { const t = viewportTransform(board, 800, 500, zoom, { x: -83, y: 41 }); const recovered = screenToMm({ x: point.xMm * t.scale + t.x, y: point.yMm * t.scale + t.y }, t); assert.ok(Math.abs(recovered.xMm - point.xMm) < 1e-9); assert.ok(Math.abs(recovered.yMm - point.yMm) < 1e-9); }
});
test('rotation uses swapped physical footprint and never changes dimensions', () => {
  const board = sampleBoard(), i = board.items[0], rotated = { ...i, rotationDeg: 90 as const };
  assert.deepEqual(clampPosition(rotated, board, { xMm: -100, yMm: -100 }), { xMm: i.pedal.heightMm / 2, yMm: i.pedal.widthMm / 2 });
  const next = updateItem(board, i.instanceId, { rotationDeg: 90 }); assert.deepEqual(next.items[0].pedal, i.pedal);
  const restored = updateItem(next, i.instanceId, { rotationDeg: 0 }); assert.deepEqual(restored, board);
});
test('duplicate models receive separate positions; edges touching do not count as overlap', () => {
  let board = addItem(emptyBoard(), CATALOG[0], 'one'); board = addItem(board, CATALOG[0], 'two'); assert.equal(placementWarnings(board).pairs, 0);
  const one = board.items[0]; board = updateItem(board, 'two', { xMm: one.xMm + one.pedal.widthMm, yMm: one.yMm }); assert.equal(placementWarnings(board).pairs, 0);
  board = updateItem(board, 'two', { xMm: one.xMm + 1 }); assert.equal(placementWarnings(board).pairs, 1);
});
test('oversized pedal remains physically sized and is reported after board resize', () => {
  const wide = { ...CATALOG[0], widthMm: 250, heightMm: 200 };
  const board = resizeBoard(addItem(emptyBoard(), wide, 'wide'), 150, 150);
  assert.equal(board.items[0].pedal.widthMm, 250); assert.equal(placementWarnings(board).outside, 1);
  assert.throws(() => resizeBoard(board, 0, 150));
});
test('custom board preserves equipment placement, underside, height and budget even outside its new boundary', () => {
  const original = updateItem(sampleBoard(), sampleBoard().items[0].instanceId, { mountSide: 'bottom', physicalHeightMm: 32, manualPriceKrw: 75000, owned: true, rotationDeg: 90 });
  const next = createCustomBoard({ ...original, modelId: 'previous-model' }, '  My board  ', 150, 100);
  assert.equal(next.name, 'My board'); assert.equal(next.modelId, undefined);
  assert.deepEqual(next.items, original.items); assert.ok(placementWarnings(next).outside > 0);
  assert.deepEqual(parseBoardFile(JSON.stringify(next)), next);
  for (const dimensions of [[49,100],[100,2541],[NaN,100]]) assert.throws(()=>createCustomBoard(original,'Board',...dimensions as [number,number]));
  assert.throws(()=>createCustomBoard(original,' ',600,320));
});
test('catalog aliases and model versions are retained in search phrases', () => {
  assert.equal(searchCatalog('보스 DS1', '전체')[0]?.id, 'boss-ds1');
  assert.match(searchPhrase(CATALOG.find(p => p.id === 'strymon-bluesky')!), /V2/);
});
test('100 item limit rejects another addition', () => {
  const board = sampleBoard(); board.items = Array.from({ length: MAX_PEDALS }, (_, i) => ({ ...board.items[0], instanceId: String(i) }));
  assert.throws(() => addItem(board, CATALOG[0], 'overflow'));
});
test('budget counts each instance, owned exclusions, missing prices and explicit zero independently', () => {
  let board = addItem(addItem(addItem(emptyBoard(), CATALOG[0], 'a'), CATALOG[0], 'b'), CATALOG[1], 'c');
  board = updateItem(board, 'a', { manualPriceKrw: 100000, owned: true }); board = updateItem(board, 'b', { manualPriceKrw: 0 });
  const all = budget(board, 'all'); assert.equal(all.total, 100000); assert.equal(all.known, 2); assert.equal(all.missing, 1); assert.equal(all.manual, 2);
  const purchase = budget(board, 'purchase'); assert.equal(purchase.total, 0); assert.equal(purchase.known, 1); assert.equal(purchase.count, 2); assert.equal(purchase.missing, 1);
  board = updateItem(board, 'b', { manualPriceKrw: null }); assert.equal(budget(board, 'purchase').missing, 2);
});
test('manual price overrides fresh observed asking prices; stale and invalid sources are excluded', () => {
  let board = addItem(addItem(emptyBoard(), CATALOG[0], 'a'), CATALOG[0], 'b');
  const quotes = { [quote.pedalId]: quote };
  assert.equal(budget(board, 'all', quotes, now).total, 200000);
  board = updateItem(board, 'a', { manualPriceKrw: 80000 }); assert.equal(budget(board, 'all', quotes, now).total, 180000);
  assert.equal(budget(board, 'all', quotes, now + 86400001).missing, 1);
  assert.equal(marketState(quote.pedalId, { ...quote, sourceUrls: ['https://www.mule.co.kr.evil.example/'] }, now).status, 'unavailable');
  assert.equal(marketState(quote.pedalId, { ...quote, observedAt: new Date(now + 1).toISOString() }, now).status, 'unavailable');
  assert.equal(marketState(quote.pedalId, { ...quote, sampleCount: 0 }, now).status, 'unavailable');
});
test('price input distinguishes empty from zero and rejects negative/fractional/unsafe values', () => {
  assert.equal(parsePrice(''), null); assert.equal(parsePrice('0'), 0); assert.equal(parsePrice('100,000'), 100000);
  for (const bad of ['-1', '1.5', 'Infinity', '100000001', '1e5', 'abc', '1,2', '100,']) assert.throws(() => parsePrice(bad));
});
test('legacy storage loads without modifying original; v2 save round-trips', () => {
  const s = memory(); const old = JSON.stringify(legacy()); s.setItem(LEGACY_KEY, old);
  const loaded = loadBoard(s); assert.equal(loaded.status, 'migrated'); assert.equal(s.getItem(STORAGE_KEY), null);
  const result = saveBoard(s, loaded.board, loaded.expected, 'r1', new Date(now).toISOString()); assert.equal(result.status, 'saved');
  assert.equal(s.getItem(LEGACY_KEY), old); assert.deepEqual(decodeEnvelope(s.getItem(STORAGE_KEY)!).board, loaded.board); assert.equal(loadBoard(s).status, 'loaded');
});
test('corrupt storage is preserved and concurrent changes are never overwritten by stale revision', () => {
  const s = memory(); s.setItem(STORAGE_KEY, '{broken'); assert.equal(loadBoard(s).status, 'corrupt'); assert.equal(s.getItem(STORAGE_KEY), '{broken');
  const a = saveBoard(s, sampleBoard(), '{broken', 'a', new Date(now).toISOString()); assert.equal(a.status, 'saved');
  const before = s.getItem(STORAGE_KEY); assert.equal(saveBoard(s, emptyBoard(), '{broken', 'b', new Date(now).toISOString()).status, 'conflict'); assert.equal(s.getItem(STORAGE_KEY), before);
});
test('denied storage and quota failures are reported without destroying the in-memory board', () => {
  const board = sampleBoard(); const json = JSON.stringify(board);
  assert.equal(loadBoard({ getItem() { throw new Error('denied'); }, setItem() {} }).status, 'unavailable');
  assert.equal(saveBoard({ getItem() { return null; }, setItem() { throw new Error('quota'); } }, board, null, 'r', new Date(now).toISOString()).status, 'error');
  assert.equal(JSON.stringify(board), json);
});
