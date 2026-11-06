'use client';
import { useMemo } from 'react';
import { Group, Line, Rect, Text, Circle } from 'react-konva';
import type { Board } from '../domain/board.ts';
import { patchCables } from '../domain/signal-chain.ts';

export function PatchCables({board,side}:{board:Board;side:'top'|'bottom'}) {
  const routes=useMemo(()=>patchCables(board),[board]);
  if(!board.signalChain?.visible)return null;
  return <Group listening={false}>{routes.filter(route=>route.side===side).map(route=><Group key={route.index}>
    {route.routed && <Line points={route.points.flatMap(p=>[p.x,p.y])} stroke="#121b18" strokeWidth={board.signalChain!.cableDiameterMm+2} lineCap="round" lineJoin="round"/>}
    <Line points={route.points.flatMap(p=>[p.x,p.y])} stroke={route.routed?route.color:'#f18d7c'} strokeWidth={route.routed?board.signalChain!.cableDiameterMm:1.5} lineCap="round" lineJoin="round" dash={route.routed?undefined:[4,4]} opacity={route.routed ? .95 : .7}/>
    {[route.from,route.to].filter(port=>(port.item.mountSide??'top')===side).map((port,index)=><Group key={index}>
      <Rect x={port.rect.x1} y={port.rect.y1} width={port.rect.x2-port.rect.x1} height={port.rect.y2-port.rect.y1} fill="#c0c6bc" stroke={route.warnings.length?'#f18d7c':'#32463d'} strokeWidth={.8} cornerRadius={2}/>
      <Circle x={port.tip.x} y={port.tip.y} radius={board.signalChain!.cableDiameterMm/2} fill={route.color}/>
    </Group>)}
    <Circle x={route.from.lead.x} y={route.from.lead.y} radius={5} fill="#24352d" stroke={route.color} strokeWidth={.8}/><Text x={route.from.lead.x-5} y={route.from.lead.y-3} width={10} text={String(route.index+1)} fontSize={6} align="center" fill="#f6f4de"/>
  </Group>)}</Group>;
}
