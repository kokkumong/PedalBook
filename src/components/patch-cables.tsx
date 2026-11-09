'use client';
import { useState } from 'react';
import { Group, Line, Rect, Circle } from 'react-konva';
import type Konva from 'konva';
import type { Board, Point } from '../domain/board.ts';
import { cablePoint } from '../domain/manual-cables.ts';
import type { ManualCable } from '../domain/manual-cables.ts';

type Props={board:Board;side:'top'|'bottom';selectedId:string|null;scale:number;snap:boolean;onSelect:(id:string)=>void;onEndpoint:(id:string,end:'start'|'end',point:Point)=>void;onDragging:(value:boolean)=>void};
function Cable({cable,layout,props}:{cable:ManualCable;layout:NonNullable<Board['cableLayout']>;props:Props}) {
  const [drag,setDrag]=useState<{end:'start'|'end';point:Point}|null>(null);
  const start=drag?.end==='start'?drag.point:cable.start,end=drag?.end==='end'?drag.point:cable.end;
  const angle=Math.atan2(end.yMm-start.yMm,end.xMm-start.xMm)*180/Math.PI;
  const selected=props.selectedId===cable.id;
  const stop=(e:Konva.KonvaEventObject<MouseEvent|TouchEvent>)=>{e.cancelBubble=true;props.onSelect(cable.id);};
  return <Group name="manual-cable">
    <Line points={[start.xMm,start.yMm,end.xMm,end.yMm]} stroke={cable.color} strokeWidth={layout.cableDiameterMm} lineCap="round" hitStrokeWidth={Math.max(layout.cableDiameterMm,12/props.scale)} onMouseDown={stop} onTouchStart={stop}/>
    {(['start','end'] as const).map((which,i)=>{const p=which==='start'?start:end;return <Group key={which} x={p.xMm} y={p.yMm} draggable onMouseDown={stop} onTouchStart={stop}
      onDragStart={()=>{props.onSelect(cable.id);props.onDragging(true);}}
      onDragMove={e=>{const point=cablePoint({xMm:e.target.x(),yMm:e.target.y()},props.snap);e.target.position({x:point.xMm,y:point.yMm});setDrag({end:which,point});}}
      onDragEnd={e=>{const point=cablePoint({xMm:e.target.x(),yMm:e.target.y()},props.snap);const other=cable[which==='start'?'end':'start'];const valid=Math.hypot(point.xMm-other.xMm,point.yMm-other.yMm)>=1;const finalPoint=valid?point:cable[which];e.target.position({x:finalPoint.xMm,y:finalPoint.yMm});setDrag(null);props.onEndpoint(cable.id,which,point);props.onDragging(false);}}>
      <Rect rotation={angle+i*180} offsetY={layout.plugWidthMm/2} width={layout.plugLengthMm} height={layout.plugWidthMm} cornerRadius={2} fill="#c3c9bf" stroke="#354d41" strokeWidth={.8}/>
      <Circle radius={Math.max(6/props.scale,layout.plugWidthMm/2)} fill={selected?'#253b30':'#54645a'} stroke={selected?'#fff2d7':cable.color} strokeWidth={selected?2/props.scale:1/props.scale} hitStrokeWidth={14/props.scale}/>
      <Circle radius={2/props.scale} fill={cable.color} listening={false}/>
    </Group>;})}
  </Group>;
}
export function PatchCables(props:Props) {
  const layout=props.board.cableLayout;if(!layout?.visible)return null;
  return <Group>{layout.cables.filter(c=>c.side===props.side).map(c=><Cable key={c.id} cable={c} layout={layout} props={props}/>)}</Group>;
}
