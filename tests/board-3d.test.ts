import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { addItem, emptyBoard, parseBoardFile, sampleBoard, updateItem } from '../src/domain/board.ts';
import { boardToWorld, worldToBoard, worldRotation, dragOnBoard, fitDistance, pedalElevation } from '../src/domain/board-3d.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('saved mm coordinates round-trip through the 3D plane for custom board sizes', () => {
  for (const [widthMm, heightMm] of [[600, 320], [50, 2540], [820.42, 424.18]]) {
    const board = { widthMm, heightMm };
    for (const point of [{ xMm: 0, yMm: 0 }, { xMm: 84.125, yMm: 91.75 }, { xMm: widthMm, yMm: heightMm }]) {
      const result = worldToBoard(boardToWorld(point, board), board);
      close(result.xMm, point.xMm); close(result.yMm, point.yMm);
    }
  }
});

test('clockwise 2D rotations have the same footprint and direction from above in 3D', () => {
  const localFront = new Vector3(0, 0, -10);
  for (const [deg, expected] of [[0, [0, -10]], [90, [10, 0]], [180, [0, 10]], [270, [-10, 0]]] as const) {
    const world = localFront.clone().applyAxisAngle(new Vector3(0, 1, 0), worldRotation(deg));
    close(world.x, expected[0]); close(world.z, expected[1]);
  }
});

test('dragging preserves the grab offset under different orbit angles and zoom levels', () => {
  const board = sampleBoard(), item = board.items[2];
  for (const cameraPosition of [[400, 600, 700], [-700, 300, 200], [100, 1400, -800]]) {
    const camera = new PerspectiveCamera(40, 1.4, 1, 10000);
    camera.position.set(...cameraPosition as [number, number, number]);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const origin = boardToWorld(item, board);
    const initial = new Vector3(origin.x + 12, 40, origin.z - 18);
    const target = initial.clone().add(new Vector3(35, 0, -25));
    const projected = target.clone().project(camera);
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(projected.x, projected.y), camera);
    const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -40), new Vector3())!;
    assert.deepEqual(dragOnBoard(item, board, initial, hit, false), { xMm: item.xMm + 35, yMm: item.yMm - 25 });
    assert.deepEqual(dragOnBoard(item, board, initial, initial, false), { xMm: item.xMm, yMm: item.yMm });
  }
});

test('3D movement uses shared 5mm snapping and rotated edge bounds', () => {
  const board = sampleBoard(), item = { ...board.items[0], rotationDeg: 90 as const };
  const start = { x: 3, z: 9 };
  assert.deepEqual(dragOnBoard(item, board, start, { x: 15.2, z: 16.1 }, true), { xMm: 90, yMm: 165 });
  assert.deepEqual(dragOnBoard(item, board, start, { x: -9999, z: 9999 }, true), { xMm: 64.5, yMm: 283.5 });
  const small = { ...board, widthMm: 50, heightMm: 50 };
  assert.deepEqual(dragOnBoard(item, small, start, { x: 999, z: 999 }, true), { xMm: 25, yMm: 25 });
});

test('3D drag commits remain compatible with v2 exports, selection-independent edits and catalog pedals', () => {
  let board = sampleBoard();
  const item = board.items[0];
  const before = JSON.stringify(board);
  const position = dragOnBoard(item, board, { x: 0, z: 0 }, { x: 25, z: 30 }, true);
  board = updateItem(board, item.instanceId, position);
  assert.deepEqual(parseBoardFile(JSON.stringify(board)), board);
  assert.equal(board.schemaVersion, 2);
  assert.deepEqual(board.items[0].pedal, item.pedal);
  assert.notEqual(JSON.stringify(board), before);
  const custom = { ...item.pedal, id: 'custom-test', widthMm: 300, heightMm: 200 };
  assert.equal(addItem(emptyBoard(), custom, 'new', position).items[0].xMm, 150);
});

test('fit distance contains the bounding sphere in portrait and landscape viewports', () => {
  for (const aspect of [.3, .8, 1, 2.5]) {
    const distance = fitDistance(450, aspect);
    const halfVertical = 20 * Math.PI / 180;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
    assert.ok(distance * Math.sin(halfVertical) > 450);
    assert.ok(distance * Math.sin(halfHorizontal) > 450);
  }
});

test('unknown physical height is explicitly estimated and cannot be confused with footprint depth', () => {
  assert.equal(pedalElevation('boss-ds1').mm, 59);
  assert.equal(pedalElevation('boss-ds1').estimated, false);
  assert.equal(pedalElevation('strymon-bluesky').mm, 61);
  for (const id of ['custom-pedal', 'unknown', '__proto__']) {
    assert.deepEqual(pedalElevation(id), { mm: 40, estimated: true, sourceUrl: undefined });
  }
});
