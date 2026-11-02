import test from 'node:test';
import assert from 'node:assert/strict';
import snapshot from '../src/catalog-snapshot.json' with { type: 'json' };
import { CATALOG, CATALOG_META, BOARD_MODELS, searchCatalog } from '../src/domain/catalog.ts';
import { boardModel, emptyBoard, parseBoard, parseBoardFile, resizeBoard, sampleBoard, selectBoardModel, placementWarnings } from '../src/domain/board.ts';
import { imageSources } from '../src/server/catalog-image.ts';
import { catalogPhoto } from '../src/domain/photos.ts';

test('every upstream pedal and board is represented once, including legacy aliases', () => {
  assert.equal(CATALOG.length, snapshot.pedals.length);
  assert.equal(new Set(CATALOG.map(p => p.id)).size, CATALOG.length);
  assert.equal(BOARD_MODELS.length, snapshot.boards.length);
  assert.equal(CATALOG.filter(p => p.id === 'boss-ds1').length, 1);
  assert.ok(searchCatalog('1981 DRV', '전체', '1981 INVENTIONS').length > 0);
  assert.ok(searchCatalog('', '전체', 'BOSS').every(p => p.brand.toUpperCase() === 'BOSS'));
  assert.match(CATALOG_META.revision, /^[a-f0-9]{40}$/);
});
test('all imported catalog dimensions and long names can be saved and loaded', () => {
  for (const pedal of CATALOG) {
    const board = parseBoard({ ...emptyBoard(), items: [{ instanceId: 'test', pedalId: pedal.id, pedal, xMm: 100, yMm: 100, rotationDeg: 0 }] });
    assert.equal(board.items[0].pedal.name, pedal.name);
    assert.equal(board.items[0].pedal.widthMm, pedal.widthMm);
  }
  for (const model of BOARD_MODELS) assert.equal(boardModel(selectBoardModel(emptyBoard(), model.id))?.id, model.id);
});
test('model changes preserve pedals, prices and positions, round-trip and show overflow', () => {
  const original = sampleBoard(); original.items[0].manualPriceKrw = 12345;
  const model = [...BOARD_MODELS].sort((a,b) => a.widthMm * a.heightMm - b.widthMm * b.heightMm)[0];
  const next = selectBoardModel(original, model.id);
  assert.deepEqual(next.items, original.items); assert.ok(placementWarnings(next).outside > 0);
  assert.equal(parseBoardFile(JSON.stringify(next)).modelId, model.id);
  assert.equal(boardModel(next)?.id, model.id);
  assert.equal(resizeBoard(next, 600, 320).modelId, undefined);
  assert.equal(boardModel({ ...next, widthMm: next.widthMm + 1 }), undefined);
  assert.equal(boardModel({ ...next, modelId: '../../secret' }), undefined);
  assert.equal(parseBoard(original).modelId, undefined);
  assert.throws(() => selectBoardModel(original, 'unknown'));
});
test('only catalog identities resolve images, pinned upstream first then official; URLs cannot be injected', () => {
  const ds1 = imageSources('pedals', 'boss-ds1');
  assert.equal(ds1.length, 2); assert.ok(ds1[1].startsWith('https://static.roland.com/'));
  assert.ok(ds1[0].includes(`/${CATALOG_META.revision}/public/images/pedals/boss-ds1.png`));
  assert.deepEqual(imageSources('pedals', 'https://internal.invalid'), []);
  assert.deepEqual(imageSources('../../secret', 'boss-ds1'), []);
  assert.equal(catalogPhoto('boards', '../../secret'), undefined);
  assert.ok(imageSources('boards', BOARD_MODELS[0].id)[0].includes('/public/images/pedalboards/'));
});
