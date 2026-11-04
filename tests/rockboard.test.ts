import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, Plane, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { BOARD_MODELS } from '../src/domain/catalog.ts';
import { emptyBoard, parseBoardFile, sampleBoard, selectBoardModel } from '../src/domain/board.ts';
import { boardRockboard, boardSurfacePoint, boardSurfaceAngle, dragOnBoard, pedalCrossesStep, pedalSurfacePoint, surfaceToBoard } from '../src/domain/board-3d.ts';
import { ROCKBOARD_PROFILES, rockboardBays, rockboardProfile, rockboardSlotRuns } from '../src/domain/rockboard.ts';
import { createRockboardGeometry } from '../src/components/three/rockboard-geometry.ts';

const close = (a: number, b: number, tolerance = .0001) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
const model = (name: string) => BOARD_MODELS.find(b => b.brand === 'Rockboard by Warwick' && b.name === name)!;
const boardFor = (name: string) => selectBoardModel(emptyBoard(), model(name).id);

test('all 16 RockBoard models use official footprints, with no name-only matches', () => {
  const models = BOARD_MODELS.filter(b => rockboardProfile(b));
  assert.equal(models.length, 16);
  for (const profile of ROCKBOARD_PROFILES) {
    const board = boardFor(profile.name);
    assert.equal(board.widthMm, profile.widthMm);
    assert.equal(board.heightMm, profile.depthMm);
    assert.ok(profile.drawingUrl.startsWith('https://cdn.rockboard.de/'));
    assert.equal(rockboardProfile({ brand: 'other', name: profile.name }), undefined);
  }
});

test('legacy saved dimensions and pedal coordinates survive loading; applying official dimensions is explicit', () => {
  const legacy = { ...sampleBoard(), modelId: model('Quad 4.1').id, widthMm: 468.884, heightMm: 330.2 };
  const loaded = parseBoardFile(JSON.stringify(legacy));
  assert.deepEqual(loaded, legacy);
  assert.equal(boardRockboard(loaded), undefined);
  const applied = selectBoardModel(loaded, legacy.modelId);
  assert.equal(applied.widthMm, 470); assert.equal(applied.heightMm, 330);
  assert.deepEqual(applied.items, legacy.items);
  assert.deepEqual(parseBoardFile(JSON.stringify(applied)), applied);
});

test('sloped surfaces round-trip mm and preserve drag offsets under orbit and zoom', () => {
  const board = { ...boardFor('Quad 4.1'), items: sampleBoard().items };
  const item = { ...board.items[0], xMm: 150, yMm: 150 };
  const angle = boardSurfaceAngle(board);
  for (const point of [{xMm:0,yMm:0},{xMm:137.125,yMm:219.75},{xMm:470,yMm:330}]) {
    const result = surfaceToBoard(boardSurfacePoint(point,board),board);
    close(result.xMm,point.xMm); close(result.yMm,point.yMm);
  }
  for (const position of [[400,600,700],[-700,300,200],[100,1400,-800]]) {
    const camera = new PerspectiveCamera(40,1.4,1,10000);
    camera.position.set(...position as [number,number,number]); camera.lookAt(0,0,0); camera.updateMatrixWorld();
    const p = boardSurfacePoint(item,board), normal = new Vector3(0,Math.cos(angle),Math.sin(angle));
    const start = new Vector3(p.x+12,p.y+40,p.z-18);
    const target = start.clone().add(new Vector3(35,25*Math.tan(angle),-25));
    const projected = target.clone().project(camera), ray = new Raycaster();
    ray.setFromCamera(new Vector2(projected.x,projected.y),camera);
    const hit = ray.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,start),new Vector3())!;
    assert.deepEqual(dragOnBoard(item,board,start,hit,false),{xMm:185,yMm:125});
  }
});

test('MAX step is 46mm, raises crossing pedals and reports the unsupported footprint', () => {
  const board = boardFor('Cinque 5.3 MAX');
  const item = {...sampleBoard().items[0],xMm:300,yMm:218};
  assert.equal(pedalCrossesStep(item,board),true);
  close(pedalSurfacePoint(item,board).y-boardSurfacePoint(item,board,false).y,46);
  for (const yMm of [80,350]) assert.equal(pedalCrossesStep({...item,yMm},board),false);
  const low = {...item,yMm:350};
  close(pedalSurfacePoint(low,board).y,boardSurfacePoint(low,board,false).y);
});

test('all models have open slots, open cavities, bounded meshes and manufacturer bay widths', () => {
  for (const profile of ROCKBOARD_PROFILES) {
    const board = boardFor(profile.name), {root,clearance} = createRockboardGeometry(profile);
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root);
    close(bounds.max.x-bounds.min.x,profile.widthMm,.001);
    close(bounds.max.z-bounds.min.z,profile.depthMm,.001);
    assert.ok(bounds.min.y >= -.001 && bounds.max.y < 200,profile.name);
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      assert.ok(positions.count > 0);
      for (const value of positions.array) assert.ok(Number.isFinite(value),profile.name);
    });
    const deck = root.getObjectByName(profile.step ? 'upper-perforated-deck' : 'perforated-deck')!;
    const segmentDepth = profile.step?.depthMm ?? profile.depthMm, rows = profile.step ? 4 : profile.slotRows;
    const run = rockboardSlotRuns(profile.widthMm-(profile.step ? 6 : 0))[0][0];
    const p = boardSurfacePoint({xMm:run.xMm+(profile.step ? 3 : 0),yMm:(segmentDepth-(rows-1)*47)/2},board);
    const normal = new Vector3(0,Math.cos(boardSurfaceAngle(board)),Math.sin(boardSurfaceAngle(board)));
    const ray = new Raycaster(new Vector3(p.x,p.y,p.z).addScaledVector(normal,100),normal.clone().negate());
    assert.equal(ray.intersectObject(deck,false).length,0,`${profile.name}: slot must be a real hole`);
    const edge = boardSurfacePoint({xMm:5,yMm:segmentDepth/2},board);
    ray.set(new Vector3(edge.x,edge.y,edge.z).addScaledVector(normal,100),normal.clone().negate());
    assert.ok(ray.intersectObject(deck,false).length > 0,`${profile.name}: solid deck rim`);
    const bays = rockboardBays(profile);
    assert.equal(clearance.visible,false);
    for (const bay of bays) {
      const cavity = clearance.children.find(o=>o.name === `cavity-${bay.index}`)!;
      const box = new Box3().setFromObject(cavity);
      close(box.max.x-box.min.x,bay.widthMm,.001);
      // A ray starting inside the open cavity can exit downward unobstructed.
      ray.set(new Vector3(bay.xMm-profile.widthMm/2,20,0),new Vector3(0,-1,0));
      const hardware = root.children.filter(o=>o instanceof Mesh);
      assert.equal(ray.intersectObjects(hardware,false).length,0,`${profile.name}: no solid slab underneath`);
    }
    root.traverse(o=>{ if(o instanceof Mesh) { o.geometry.dispose(); const materials=Array.isArray(o.material)?o.material:[o.material]; materials.forEach(m=>m.dispose()); } });
  }
});
