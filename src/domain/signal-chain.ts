import { extents, mm } from './board.ts';
import type { Board, BoardItem, Point } from './board.ts';
import { boardRockboard, boardSurfaceAngle, boardSurfacePoint, itemElevation, itemLocalToWorld } from './board-3d.ts';
import { ROCKBOARD_SHEET_MM } from './rockboard.ts';
import type { SignalChain, SignalPort } from './signal-config.ts';

export type CablePoint = { x: number; y: number };
export type CableRect = { x1: number; y1: number; x2: number; y2: number; owner: string };
export type CablePort = { point: CablePoint; normal: CablePoint; tip: CablePoint; lead: CablePoint; rect: CableRect; heightMm: number; item: BoardItem; local: { x: number; z: number } };
export type PatchCable = { index: number; from: CablePort; to: CablePort; points: CablePoint[]; color: string; warnings: string[]; lengthMm: number | null; side: 'top' | 'bottom'; routed: boolean };
export const CABLE_COLORS = ['#efb567', '#75cfba', '#9ab9f4', '#d4a0d9', '#c8d682'];
const EPS = .001;
const distance = (a: CablePoint, b: CablePoint) => Math.hypot(a.x-b.x, a.y-b.y);
const inflate = (r: CableRect, n: number): CableRect => ({ ...r, x1: r.x1-n, y1: r.y1-n, x2: r.x2+n, y2: r.y2+n });
const inside = (p: CablePoint, r: CableRect) => p.x>r.x1+EPS && p.x<r.x2-EPS && p.y>r.y1+EPS && p.y<r.y2-EPS;
export const rectanglesOverlap = (a: CableRect, b: CableRect) => a.x1<b.x2-EPS && a.x2>b.x1+EPS && a.y1<b.y2-EPS && a.y2>b.y1+EPS;
export function segmentBlocked(a: CablePoint, b: CablePoint, r: CableRect) {
  if (Math.abs(a.y-b.y)<EPS) return a.y>r.y1+EPS && a.y<r.y2-EPS && Math.max(a.x,b.x)>r.x1+EPS && Math.min(a.x,b.x)<r.x2-EPS;
  if (Math.abs(a.x-b.x)<EPS) return a.x>r.x1+EPS && a.x<r.x2-EPS && Math.max(a.y,b.y)>r.y1+EPS && Math.min(a.y,b.y)<r.y2-EPS;
  return true; // The router only emits orthogonal segments.
}
export function pedalRect(item: BoardItem): CableRect {
  const e = extents(item);
  return { x1: item.xMm-e.xMm, x2: item.xMm+e.xMm, y1: item.yMm-e.yMm, y2: item.yMm+e.yMm, owner: item.instanceId };
}
export function cablePort(item: BoardItem, port: SignalPort, chain: SignalChain): CablePort {
  const w = item.pedal.widthMm, h = item.pedal.heightMm;
  const vertical = port.edge === 'left' || port.edge === 'right';
  const local = { x: vertical ? (port.edge === 'left' ? -w/2 : w/2) : w*(port.offsetPct/100-.5), z: vertical ? h*(port.offsetPct/100-.5) : (port.edge === 'top' ? -h/2 : h/2) };
  const normal = vertical ? { x: port.edge === 'left' ? -1 : 1, y: 0 } : { x: 0, y: port.edge === 'top' ? -1 : 1 };
  const angle = item.rotationDeg*Math.PI/180, sign = item.mountSide === 'bottom' ? -1 : 1;
  const rotate = (p: CablePoint) => ({ x: mm(p.x*Math.cos(angle)-p.y*sign*Math.sin(angle)), y: mm(p.x*Math.sin(angle)+p.y*sign*Math.cos(angle)) });
  const n = rotate(normal), p = rotate({ x: local.x, y: local.z });
  const point = { x: mm(item.xMm+p.x), y: mm(item.yMm+p.y) };
  const tip = { x: mm(point.x+n.x*chain.plugLengthMm), y: mm(point.y+n.y*chain.plugLengthMm) };
  const clearance = chain.cableDiameterMm/2+3;
  const lead = { x: mm(tip.x+n.x*(clearance+1)), y: mm(tip.y+n.y*(clearance+1)) };
  const half = chain.plugWidthMm/2;
  return { point, normal: n, tip, lead, local, item, heightMm: port.heightMm ?? Math.max(1,itemElevation(item).mm*.45),
    rect: { x1: Math.min(point.x,tip.x)-(n.x===0 ? half : 0), x2: Math.max(point.x,tip.x)+(n.x===0 ? half : 0), y1: Math.min(point.y,tip.y)-(n.y===0 ? half : 0), y2: Math.max(point.y,tip.y)+(n.y===0 ? half : 0), owner: item.instanceId } };
}

// A small binary heap keeps path searches bounded even for dense boards.
class MinHeap {
  data: { id: number; score: number }[] = [];
  push(value: { id: number; score: number }) {
    let i=this.data.length; this.data.push(value);
    while(i>0) { const p=(i-1)>>1; if(this.data[p].score<=value.score) break; this.data[i]=this.data[p]; i=p; } this.data[i]=value;
  }
  pop() {
    const first=this.data[0], last=this.data.pop(); if(!this.data.length || !last) return first;
    let i=0; while(i*2+1<this.data.length) { let c=i*2+1; if(c+1<this.data.length && this.data[c+1].score<this.data[c].score)c++; if(this.data[c].score>=last.score)break; this.data[i]=this.data[c];i=c; } this.data[i]=last; return first;
  }
}
function simplify(points: CablePoint[]) {
  const result: CablePoint[]=[];
  for(const p of points) {
    if(result.length && distance(p,result.at(-1)!)<EPS)continue;
    while(result.length>1) { const a=result.at(-2)!,b=result.at(-1)!; if(Math.abs((b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x))>EPS)break; result.pop(); } result.push(p);
  }
  return result;
}
// Sparse orthogonal grid through obstacle edges. Bend and crossing penalties favor
// tidy routes, while expanded obstacles enforce cable thickness and a 3mm gap.
export function routeCable(start: CablePoint, end: CablePoint, obstacles: CableRect[], bounds: CableRect, used: CablePoint[][] = []): CablePoint[] | null {
  if([start,end].some(p=>p.x<bounds.x1 || p.x>bounds.x2 || p.y<bounds.y1 || p.y>bounds.y2 || obstacles.some(r=>inside(p,r))))return null;
  const unique=(values:number[])=>[...new Set(values.map(mm))].sort((a,b)=>a-b);
  const xs=unique([bounds.x1,bounds.x2,start.x,end.x,...obstacles.flatMap(r=>[r.x1,r.x2])].filter(v=>v>=bounds.x1 && v<=bounds.x2));
  const ys=unique([bounds.y1,bounds.y2,start.y,end.y,...obstacles.flatMap(r=>[r.y1,r.y2])].filter(v=>v>=bounds.y1 && v<=bounds.y2));
  const width=xs.length, count=width*ys.length, goal=ys.indexOf(end.y)*width+xs.indexOf(end.x);
  const origin=ys.indexOf(start.y)*width+xs.indexOf(start.x), cost=new Float64Array(count*3).fill(Infinity), parent=new Int32Array(count*3).fill(-1);
  const blocked=new Map<string,boolean>(), queue=new MinHeap();
  const point=(cell:number)=>({x:xs[cell%width],y:ys[Math.floor(cell/width)]});
  cost[origin*3]=0;queue.push({id:origin*3,score:0});
  let final=-1, visits=0;
  while(queue.data.length && visits++<count*6) {
    const entry=queue.pop()!, id=entry.id, cell=Math.floor(id/3), dir=id%3, p=point(cell);
    if(entry.score>cost[id]+Math.abs(p.x-end.x)+Math.abs(p.y-end.y)+EPS)continue;
    if(cell===goal){final=id;break;}
    const xi=cell%width,yi=Math.floor(cell/width);
    const nexts=[[xi-1,yi,1],[xi+1,yi,1],[xi,yi-1,2],[xi,yi+1,2]];
    for(const [x,y,d] of nexts) {
      if(x<0 || x>=width || y<0 || y>=ys.length)continue;
      const next=y*width+x, q=point(next), key=cell<next?`${cell}/${next}`:`${next}/${cell}`;
      let collision=blocked.get(key);if(collision===undefined){collision=obstacles.some(r=>segmentBlocked(p,q,r));blocked.set(key,collision);}if(collision)continue;
      let crossing=0;
      for(const route of used)for(let k=1;k<route.length;k++) {
        const a=route[k-1],b=route[k];
        // Penalize intersections and shared runs, but never compromise clearance.
        if(Math.max(Math.min(p.x,q.x),Math.min(a.x,b.x))<=Math.min(Math.max(p.x,q.x),Math.max(a.x,b.x))+EPS && Math.max(Math.min(p.y,q.y),Math.min(a.y,b.y))<=Math.min(Math.max(p.y,q.y),Math.max(a.y,b.y))+EPS)crossing+=24;
      }
      const score=cost[id]+distance(p,q)+(dir && dir!==d?18:0)+crossing, nextId=next*3+d;
      if(score>=cost[nextId])continue;
      cost[nextId]=score;parent[nextId]=id;queue.push({id:nextId,score:score+Math.abs(q.x-end.x)+Math.abs(q.y-end.y)});
    }
  }
  if(final<0)return null;
  const result:CablePoint[]=[];for(let id=final;id>=0;id=parent[id])result.push(point(Math.floor(id/3)));
  return simplify(result.reverse());
}

function calculatePatchCables(board: Board): PatchCable[] {
  const chain=board.signalChain;if(!chain || chain.nodes.length<2)return [];
  const nodes=chain.nodes.map(node=>({node,item:board.items.find(item=>item.instanceId===node.instanceId)})).filter((n): n is typeof n & {item:BoardItem}=>!!n.item);
  const sockets=nodes.map(({node,item})=>({input:cablePort(item,node.input,chain),output:cablePort(item,node.output,chain)}));
  const ports=sockets.flatMap((pair,i)=>[...(i>0?[pair.input]:[]),...(i<nodes.length-1?[pair.output]:[])]);
  const result:PatchCable[]=[], clearance=chain.cableDiameterMm/2+3;
  for(let i=0;i<nodes.length-1;i++) {
    const from=sockets[i].output,to=sockets[i+1].input;
    const side=from.item.mountSide??'top', warnings:string[]=[];
    const sameSide=(to.item.mountSide??'top')===side;
    const bodies=board.items.filter(item=>(item.mountSide??'top')===side).map(pedalRect);
    const peers=ports.filter(port=>(port.item.mountSide??'top')===side);
    for(const port of [from,to]) {
      if(bodies.some(r=>r.owner!==port.item.instanceId && rectanglesOverlap(port.rect,r)) || peers.some(p=>p!==port && rectanglesOverlap(port.rect,p.rect)))warnings.push('플러그 공간이 다른 장비 또는 플러그와 겹쳐요.');
      if(port.heightMm+chain.plugWidthMm/2>itemElevation(port.item).mm || port.heightMm<chain.plugWidthMm/2)warnings.push('잭 높이에 비해 플러그가 장비 높이를 벗어나요.');
    }
    if(!sameSide)warnings.push('상판·하부 사이 연결은 관통 위치를 확인해야 해요. 같은 면 배치에서 자동 경로를 지원해요.');
    const obstacles=[...bodies,...peers.map(p=>p.rect)].map(r=>inflate(r,clearance));
    const bounds={x1:clearance,y1:clearance,x2:board.widthMm-clearance,y2:board.heightMm-clearance,owner:'board'};
    const route=sameSide?routeCable(from.lead,to.lead,obstacles,bounds,result.filter(r=>r.routed&&r.side===side).map(r=>r.points)):null;
    const neckBlocked=[from,to].some(port=>bodies.some(r=>r.owner!==port.item.instanceId && segmentBlocked(port.tip,port.lead,inflate(r,clearance))) || peers.some(p=>p!==port && segmentBlocked(port.tip,port.lead,inflate(p.rect,clearance))));
    if(!route || neckBlocked)warnings.push('통과할 여유 공간이 없어요. 페달 간격이나 잭 위치를 조정해 주세요.');
    const routed=!!route && !neckBlocked && !warnings.some(warning=>warning.startsWith('플러그 공간'));
    const points=routed?simplify([from.tip,...route!,to.tip]):[from.tip,to.tip];
    const length=routed?points.slice(1).reduce((n,p,j)=>n+distance(points[j],p),0):null;
    result.push({index:i,from,to,side,points,routed,color:CABLE_COLORS[i%CABLE_COLORS.length],warnings:[...new Set(warnings)],lengthMm:length===null?null:mm(length)});
  }
  return result;
}

// Jack positions follow the same mounting flip/yaw/tilt as the pedal geometry.
export function portWorld(port: CablePort, board: Board, outwardMm=0) {
  const localNormal={x:port.local.x===-port.item.pedal.widthMm/2?-1:port.local.x===port.item.pedal.widthMm/2?1:0,z:port.local.z===-port.item.pedal.heightMm/2?-1:port.local.z===port.item.pedal.heightMm/2?1:0};
  return itemLocalToWorld({x:port.local.x+localNormal.x*outwardMm,y:port.heightMm,z:port.local.z+localNormal.z*outwardMm},port.item,board);
}
export function cableWorldPoints(cable: PatchCable, board: Board) {
  const chain=board.signalChain!;
  const start=portWorld(cable.from,board,chain.plugLengthMm),end=portWorld(cable.to,board,chain.plugLengthMm);
  if(!cable.routed)return [start,end];
  const sign=cable.side==='bottom'?-1:1, angle=boardSurfaceAngle(board);
  const height=chain.cableDiameterMm/2+2;
  const undersideOffset=(boardRockboard(board)?ROCKBOARD_SHEET_MM:16)+2;
  const points=cable.points.map(p=>{const base=boardSurfacePoint({xMm:p.x,yMm:p.y} as Point,board); const offset=sign===1?height:-(height+undersideOffset);return {x:base.x,y:base.y+offset*Math.cos(angle),z:base.z+offset*Math.sin(angle)};});
  return [start,...points,end];
}

const routeCache = new WeakMap<Board, PatchCable[]>();
export function patchCables(board: Board): PatchCable[] {
  const cached=routeCache.get(board);if(cached)return cached;
  const routes=calculatePatchCables(board);routeCache.set(board,routes);return routes;
}
