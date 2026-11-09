import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleBoard, parseBoard, removeItem, updateItem } from '../src/domain/board.ts';
import type { Board } from '../src/domain/board.ts';
import { emptySignal, signalNode } from '../src/domain/signal-config.ts';
import { cablePort, patchCables, routeCable, segmentBlocked, pedalRect, portWorld, cableWorldPoints } from '../src/domain/signal-chain.ts';
import { createPatchGeometry } from '../src/components/three/patch-geometry.ts';

function wiredBoard(): Board {
  const board=sampleBoard();board.items=board.items.slice(0,4).map((item,i)=>({...item,xMm:80+i*140,yMm:170}));
  board.signalChain={...emptySignal(),nodes:[...board.items].reverse().map(item=>signalNode(item.instanceId))};return board;
}
test('signal configuration round-trips and old v2 boards remain unchanged',()=>{
  const old=sampleBoard();assert.deepEqual(parseBoard(old),old);
  const board=wiredBoard();board.signalChain!.nodes[0].input={edge:'top',offsetPct:72,heightMm:25};
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))),board);
  for(const chain of [
    {...board.signalChain,plugWidthMm:NaN}, {...board.signalChain,cableDiameterMm:0},
    {...board.signalChain,nodes:[signalNode('missing')]},
    {...board.signalChain,nodes:[signalNode('sample-0'),signalNode('sample-0')]},
    {...board.signalChain,nodes:[{...signalNode('sample-0'),input:{edge:'top',offsetPct:101}}]},
  ])assert.throws(()=>parseBoard({...board,signalChain:chain}));
});
test('ordered instances determine OUT to IN connections and removal reconnects neighbors',()=>{
  const board=wiredBoard(), routes=patchCables(board);
  assert.equal(routes.length,3);assert.equal(routes[0].from.item.instanceId,'sample-3');assert.equal(routes[0].to.item.instanceId,'sample-2');
  assert.ok(routes.every(r=>r.routed && !r.warnings.length));
  const next=removeItem(board,'sample-2');assert.doesNotThrow(()=>parseBoard(next));
  assert.deepEqual(patchCables(next).map(r=>[r.from.item.instanceId,r.to.item.instanceId]),[['sample-3','sample-1'],['sample-1','sample-0']]);
});
test('plug projection, thickness and jack offsets rotate in saved mm, including underside flip',()=>{
  const board=wiredBoard(), item=board.items[0], chain=board.signalChain!;
  const input={edge:'right' as const,offsetPct:30};
  const p=cablePort(item,input,chain);
  assert.equal(p.point.x,item.xMm+item.pedal.widthMm/2);
  assert.equal(p.tip.x-p.point.x,chain.plugLengthMm);
  assert.ok(Math.abs(p.rect.y2-p.rect.y1-chain.plugWidthMm)<1e-6);
  const rotated=cablePort({...item,rotationDeg:90},input,chain);
  assert.deepEqual(rotated.normal,{x:0,y:1});
  const bottom=cablePort({...item,mountSide:'bottom'},input,chain);
  assert.equal(bottom.point.y-item.yMm,-(p.point.y-item.yMm));
  assert.ok(portWorld(bottom,board).y<portWorld(p,board).y);
});
test('orthogonal route avoids obstacles, preserves endpoints and reports an impassable barrier',()=>{
  const bounds={x1:0,y1:0,x2:200,y2:120,owner:'board'}, obstacle={x1:80,y1:25,x2:120,y2:95,owner:'pedal'};
  const start={x:20,y:60},end={x:180,y:60};
  const route=routeCable(start,end,[obstacle],bounds)!;
  assert.deepEqual(route[0],start);assert.deepEqual(route.at(-1),end);assert.ok(route.length>=4);
  for(let i=1;i<route.length;i++){assert.ok(route[i].x===route[i-1].x||route[i].y===route[i-1].y);assert.equal(segmentBlocked(route[i-1],route[i],obstacle),false);}
  assert.equal(routeCable(start,end,[{...obstacle,y1:-1,y2:121}],bounds),null);
});
test('plug clearance affects feasibility and never claims blocked cables have a valid length',()=>{
  const board=wiredBoard();board.items=board.items.slice(0,2);board.items[1].xMm=180;board.signalChain!.nodes=[signalNode('sample-1'),signalNode('sample-0')];
  const blocked=patchCables(board)[0];assert.equal(blocked.routed,false);assert.equal(blocked.lengthMm,null);assert.ok(blocked.warnings.length);
  const slim={...board,signalChain:{...board.signalChain!,plugWidthMm:8,plugLengthMm:6,cableDiameterMm:2}};
  assert.equal(patchCables(slim)[0].routed,true);
});
test('moving and rotating pedals recalculates endpoints without mutating stored coordinates',()=>{
  const board=wiredBoard(), saved=JSON.stringify(board), before=patchCables(board);
  const moved=updateItem(board,'sample-3',{yMm:100,rotationDeg:90});const after=patchCables(moved);
  assert.notDeepEqual(before[0].points,after[0].points);assert.equal(JSON.stringify(board),saved);
  for(const route of after.filter(r=>r.routed))for(let i=1;i<route.points.length;i++)for(const item of moved.items)assert.equal(segmentBlocked(route.points[i-1],route.points[i],pedalRect(item)),false);
});
test('cross-surface connections are flagged instead of pretending to route through the deck',()=>{
  const board=updateItem(wiredBoard(),'sample-3',{mountSide:'bottom'});const route=patchCables(board)[0];
  assert.equal(route.routed,false);assert.ok(route.warnings.some(w=>w.includes('관통')));
});
test('legacy jack conversion remains compatible but no longer renders automatic cables',()=>{
  const board=wiredBoard(),route=patchCables(board)[0],points=cableWorldPoints(route,board);
  assert.deepEqual(points[0],portWorld(route.from,board,board.signalChain!.plugLengthMm));
  assert.deepEqual(points.at(-1),portWorld(route.to,board,board.signalChain!.plugLengthMm));
  assert.equal(createPatchGeometry(board).children.length,0);
});

test('input and output plugs on the same pedal cannot occupy the same housing space',()=>{
  const board=wiredBoard();board.signalChain!.nodes[1].output={...board.signalChain!.nodes[1].input};
  const routes=patchCables(board);assert.ok(routes[0].warnings.some(w=>w.includes('플러그 공간')));assert.equal(routes[0].routed,false);
});
