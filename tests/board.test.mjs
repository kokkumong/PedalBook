import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, copy, defaultBoard, validateBoard, clampPosition, extents, overlaps, warnings, findFreePosition } from '../prototype/model.js';

test('a saved board round-trips its physical dimensions, positions and custom pedal data', () => {
  const board = defaultBoard();
  board.items.push({ id: 'custom-1', pedal: { id: 'custom-1', brand: 'CUSTOM', name: '<My Pedal>', subtitle: '내 페달', category: '커스텀', width: 60, height: 110, color: '#aa99bb' }, x: 70.1, y: 70.2, rotation: 90 });
  const restored = validateBoard(JSON.parse(JSON.stringify(board)));
  assert.equal(restored.items.at(-1).rotation, 90);
  assert.equal(restored.items.at(-1).pedal.name, '<My Pedal>');
  assert.equal(restored.items.at(-1).x, 70.1);
  assert.equal(restored.width, 600);
});

test('90 degree rotation changes footprint and prevents moving outside a board', () => {
  const board = defaultBoard(), item = copy(board.items[0]); item.rotation = 90;
  assert.deepEqual(extents(item), { x: 64.5, y: 36.5 });
  assert.deepEqual(clampPosition(item, board, -100, 800), { x: 64.5, y: 283.5 });
});

test('snap acts in mm and the physical boundary wins over grid alignment', () => {
  const board = defaultBoard(), item = board.items[0];
  assert.deepEqual(clampPosition(item, board, 103, 101, true), { x: 105, y: 100 });
  assert.deepEqual(clampPosition(item, board, 0, 0, true), { x: 36.5, y: 64.5 });
});

test('touching edges are allowed, overlapping rotated footprints are reported', () => {
  const pedal = copy(CATALOG[0]);
  const a = { id: 'a', pedal, x: 100, y: 100, rotation: 0 };
  const b = { id: 'b', pedal, x: 173, y: 100, rotation: 0 };
  assert.equal(overlaps(a, b), false);
  b.rotation = 90;
  assert.equal(overlaps(a, b), true);
  assert.equal(warnings({ width: 600, height: 320, items: [a, b] }).pairs, 1);
});

test('items too large for a small board retain dimensions and produce a warning', () => {
  const board = { ...defaultBoard(), width: 150, height: 150, items: [] };
  const item = { id: 'oversize', pedal: { ...CATALOG[0], width: 200 }, rotation: 0, x: 0, y: 0 };
  Object.assign(item, clampPosition(item, board, 500, 500)); board.items.push(item);
  assert.equal(item.x, 75);
  assert.equal(item.pedal.width, 200);
  assert.equal(warnings(board).outside, 1);
});

test('a new pedal is placed in a free position when space is available', () => {
  const board = defaultBoard(), item = { ...copy(board.items[0]), id: 'new' };
  board.items = board.items.slice(0, 1);
  Object.assign(item, findFreePosition(item, board));
  assert.equal(board.items.some(other => overlaps(item, other)), false);
});

test('import rejects unsupported schemas, duplicate IDs, unbounded coordinates and invalid rotation', () => {
  for (const mutate of [
    b => { b.schemaVersion = 2; }, b => { b.items.push(copy(b.items[0])); },
    b => { b.items[0].x = Infinity; }, b => { b.items[0].rotation = 45; },
    b => { b.items[0].pedal.color = 'red" onload="alert(1)'; },
  ]) { const board = defaultBoard(); mutate(board); assert.throws(() => validateBoard(board)); }
});

test('import ignores untrusted source URLs and graphics properties', () => {
  const board = defaultBoard();
  board.items[0].pedal.source = 'javascript:alert(1)';
  board.items[0].pedal.ink = 'red" onload="alert(1)';
  const restored = validateBoard(board);
  assert.match(restored.items[0].pedal.source, /^https:\/\/www.boss.info\//);
  assert.match(restored.items[0].pedal.ink, /^#[a-f0-9]{6}$/i);
});
