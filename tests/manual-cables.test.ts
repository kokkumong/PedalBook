import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleBoard, parseBoard, updateItem, screenToMm, viewportTransform } from '../src/domain/board.ts';
import { addManualCable, moveCableEndpoint, removeManualCable, cablePoint, emptyCableLayout, endpointWorld, manualCableLength, MAX_CABLES } from '../src/domain/manual-cables.ts';
import { createPatchGeometry } from '../src/components/three/patch-geometry.ts';
import { emptySignal } from '../src/domain/signal-config.ts';
const a={xMm:100,yMm:50}, b={xMm:200,yMm:100};
const wired=()=>addManualCable(sampleBoard(),'c1',a,b,'top');

test('manual endpoints round-trip with legacy boards and reject malformed saved data',()=>{
  const old=sampleBoard();assert.deepEqual(parseBoard(old),old);
  const board={...wired(),signalChain:emptySignal()};assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))),board);
  const layout=board.cableLayout!, c=layout.cables[0];
  for(const patch of [
    {cables:[c,c]}, {cables:[{...c,end:c.start}]}, {cables:[{...c,start:{...c.start,xMm:NaN}}]},
    {cables:[{...c,start:{...c.start,heightMm:-1}}]}, {cables:[{...c,side:'both'}]},
    {plugWidthMm:0}, {plugLengthMm:Infinity}, {cableDiameterMm:13},
  ])assert.throws(()=>parseBoard({...board,cableLayout:{...layout,...patch}}));
});
test('adding, dragging and removing are immutable and leave the other endpoint and pedals untouched',()=>{
  const initial=sampleBoard(), board=addManualCable(initial,'c1',a,b,'top'), saved=JSON.stringify(board);
  assert.equal(initial.cableLayout,undefined);assert.equal(board.items,initial.items);
  const moved=moveCableEndpoint(board,'c1','start',{xMm:130,yMm:55});
  assert.equal(JSON.stringify(board),saved);assert.deepEqual(moved.cableLayout!.cables[0].end,board.cableLayout!.cables[0].end);
  assert.deepEqual(moved.cableLayout!.cables[0].start,{xMm:130,yMm:55,heightMm:12});
  assert.equal(moveCableEndpoint(board,'c1','start',b),board);
  assert.equal(addManualCable(board,'c1',a,b,'top'),board);
  assert.equal(addManualCable(board,'c2',a,a,'top'),board);
  assert.equal(removeManualCable(moved,'c1').cableLayout!.cables.length,0);
  assert.equal(updateItem(board,board.items[0].instanceId,{xMm:300,rotationDeg:90}).cableLayout,board.cableLayout);
  assert.equal(manualCableLength(board.cableLayout!.cables[0]),Math.hypot(100,50));
});
test('new cables respect the limit and turn visibility back on',()=>{
  let board={...sampleBoard(),cableLayout:{...emptyCableLayout(),visible:false}};
  for(let i=0;i<MAX_CABLES;i++)board=addManualCable(board,String(i),a,b,i%2?'top':'bottom') as typeof board;
  assert.equal(board.cableLayout.visible,true);assert.equal(board.cableLayout.cables.length,MAX_CABLES);
  assert.equal(addManualCable(board,'overflow',a,b,'top'),board);
  assert.doesNotThrow(()=>parseBoard(board));
});
test('screen placement preserves mm under zoom/pan and applies 5mm snap independently',()=>{
  const board=sampleBoard();
  for(const zoom of [.5,1,2]){
    const t=viewportTransform(board,1200,700,zoom,{x:37,y:-51});
    const point=screenToMm({x:t.x+123.2*t.scale,y:t.y+78.8*t.scale},t);
    assert.deepEqual(cablePoint(point,false),{xMm:123.2,yMm:78.8});
    assert.deepEqual(cablePoint(point,true),{xMm:125,yMm:80});
  }
  assert.deepEqual(cablePoint({xMm:6000,yMm:-6000},false),{xMm:5000,yMm:-5000});
});
test('manual 3D preview follows exact endpoints/heights, underside and visibility',()=>{
  const board=wired(), c=board.cableLayout!.cables[0];
  const top=endpointWorld(c.start,'top',board), bottom=endpointWorld(c.start,'bottom',board);
  assert.ok(top.y>bottom.y);
  assert.ok(endpointWorld({...c.start,heightMm:30},'top',board).y>top.y);
  const group=createPatchGeometry(board);assert.equal(group.children.length,3);
  const tube=group.children[0] as THREE.Mesh<THREE.TubeGeometry>;
  assert.deepEqual(tube.geometry.parameters.path.getPoint(0).toArray(),[top.x,top.y,top.z]);
  const end=endpointWorld(c.end,'top',board);
  assert.deepEqual(tube.geometry.parameters.path.getPoint(1).toArray(),[end.x,end.y,end.z]);
  group.traverse(obj=>{if(obj instanceof THREE.Mesh){const p=obj.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));obj.geometry.dispose();(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose());}});
  assert.equal(createPatchGeometry({...board,cableLayout:{...board.cableLayout!,visible:false}}).children.length,0);
});
