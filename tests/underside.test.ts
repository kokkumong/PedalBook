import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { BOARD_MODELS, PEDALS_BY_ID } from '../src/domain/catalog.ts';
import { addItem, emptyBoard, freePosition, overlaps, parseBoardFile, placementWarnings, selectBoardModel, updateItem } from '../src/domain/board.ts';
import { boardSurfaceAngle, boardSurfacePoint, dragOnBoard, itemElevation, itemWorldCorners, pedalSurfacePoint, undersideWarnings } from '../src/domain/board-3d.ts';
import { ROCKBOARD_SHEET_MM } from '../src/domain/rockboard.ts';

const iso = PEDALS_BY_ID.get('pp-p-468e6a1037b6cf55433c')!;
const quad = BOARD_MODELS.find(b=>b.brand === 'Rockboard by Warwick' && b.name === 'Quad 4.1')!;
const makeBoard = () => addItem(selectBoardModel(emptyBoard(),quad.id),iso,'power',{xMm:120,yMm:120},false);
const close = (a: number,b: number) => assert.ok(Math.abs(a-b)<.0001,`${a} != ${b}`);

test('mount side and measured height round-trip without changing old v2 files or budgets', () => {
  const original = makeBoard();
  assert.deepEqual(parseBoardFile(JSON.stringify(original)),original);
  assert.equal(original.items[0].mountSide,undefined);
  const board = updateItem(original,'power',{mountSide:'bottom',physicalHeightMm:32.5,manualPriceKrw:100000,owned:true});
  assert.deepEqual(parseBoardFile(JSON.stringify(board)),board);
  assert.deepEqual({x:board.items[0].xMm,y:board.items[0].yMm},{x:120,y:120});
  assert.equal(board.items[0].manualPriceKrw,100000);
  for (const physicalHeightMm of [-1,0,501,'32',null]) {
    assert.throws(()=>parseBoardFile(JSON.stringify({...board,items:[{...board.items[0],physicalHeightMm}]})));
  }
  assert.throws(()=>parseBoardFile(JSON.stringify({...board,items:[{...board.items[0],mountSide:'inside'}]})));
});

test('ISO-10 uses official 32mm while a user override remains per instance', () => {
  const item = makeBoard().items[0];
  assert.equal(itemElevation(item).mm,32);assert.equal(itemElevation(item).estimated,false);
  assert.equal(itemElevation({...item,physicalHeightMm:35}).mm,35);
  assert.equal(itemElevation({...item,physicalHeightMm:35}).manual,true);
  assert.equal(itemElevation(item).manual,false);
});

test('top and underside footprints can overlap; same-side overlaps and free placement remain enforced', () => {
  const board = makeBoard(), top = board.items[0], bottom = {...top,instanceId:'under',mountSide:'bottom' as const};
  assert.equal(overlaps(top,bottom),false);
  assert.equal(placementWarnings({...board,items:[top,bottom]}).pairs,0);
  assert.equal(placementWarnings({...board,items:[bottom,{...bottom,instanceId:'other'}]}).pairs,1);
  const point=freePosition(bottom,{...board,items:[bottom]});
  assert.equal(overlaps({...bottom,...point},bottom),false);
});

test('hanging enclosure stays below the deck with 2mm allowance at every rotation', () => {
  const board = makeBoard();
  for (const rotationDeg of [0,90,180,270] as const) {
    const item = {...board.items[0],mountSide:'bottom' as const,rotationDeg};
    const corners = itemWorldCorners(item,board), angle = boardSurfaceAngle(board);
    const topCorners = corners.filter((_,index)=>index%2 === 1);
    for (const corner of topCorners) {
      const top = boardSurfacePoint({xMm:corner.x+board.widthMm/2,yMm:corner.z+board.heightMm/2},board);
      close((top.y-corner.y)*Math.cos(angle),ROCKBOARD_SHEET_MM+2);
    }
    assert.ok(Math.max(...corners.map(p=>p.y))<boardSurfacePoint(item,board).y+20);
  }
});

test('underside guidance distinguishes safe bay, brace, front/back, insufficient height and unsupported board', () => {
  const board = makeBoard(), item = {...board.items[0],mountSide:'bottom' as const};
  assert.deepEqual(undersideWarnings(item,board),[]);
  assert.ok(undersideWarnings({...item,xMm:235},board).some(w=>w.includes('보강대')));
  assert.ok(undersideWarnings({...item,yMm:20},board).some(w=>w.includes('앞뒤')));
  assert.ok(undersideWarnings({...item,physicalHeightMm:100},board).some(w=>w.includes('높이')));
  assert.ok(undersideWarnings(item,emptyBoard()).some(w=>w.includes('구조 정보')));
  assert.deepEqual(undersideWarnings({...item,mountSide:'top'},board),[]);
  const unknown={...item,pedalId:'custom',pedal:{...item.pedal,id:'custom'}};
  assert.ok(undersideWarnings(unknown,board).some(w=>w.includes('임시값')));
});

test('dragging from below retains grab offset, shared snapping and rotated bounds', () => {
  const board=makeBoard(), item={...board.items[0],mountSide:'bottom' as const};
  const p=pedalSurfacePoint(item,board), angle=boardSurfaceAngle(board), normal=new Vector3(0,Math.cos(angle),Math.sin(angle));
  const start=new Vector3(p.x+15,p.y,p.z), target=start.clone().add(new Vector3(25,-20*Math.tan(angle),20));
  for (const position of [[400,-600,700],[-700,-300,200],[100,-1400,-800]]) {
    const camera=new PerspectiveCamera(40,1.4,1,10000);camera.position.set(...position as [number,number,number]);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const projected=target.clone().project(camera), ray=new Raycaster();ray.setFromCamera(new Vector2(projected.x,projected.y),camera);
    const hit=ray.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal,start),new Vector3())!;
    assert.deepEqual(dragOnBoard(item,board,start,hit,true),{xMm:145,yMm:140});
  }
});
