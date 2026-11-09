'use client';

import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect, Circle, Text, Line, Image as CanvasImage } from 'react-konva';
import type Konva from 'konva';
import { boardModel, clampPosition, placementWarnings, viewportTransform } from '../domain/board.ts';
import type { Board, BoardItem, Point } from '../domain/board.ts';
import { catalogPhoto, containImage } from '../domain/photos.ts';
import { useCanvasPedalPhoto } from '../hooks/use-pedal-photo';
import { boardRockboard } from '../domain/board-3d.ts';
import { cablePoint } from '../domain/manual-cables.ts';
import { PatchCables } from './patch-cables';
import { rockboardBays } from '../domain/rockboard.ts';

type Props = { placingCable:boolean; cableStart:Point|null; selectedCableId:string|null; onCablePoint:(point:Point)=>void; onCableSelect:(id:string)=>void; onCableEndpoint:(id:string,end:'start'|'end',point:Point)=>void; board: Board; side: 'top' | 'bottom'; selectedId: string | null; zoom: number; pan: { x: number; y: number }; grid: boolean; snap: boolean;
  onSelect: (id: string | null) => void; onMove: (id: string, point: Point) => void; onPan: (pan: { x: number; y: number }) => void;
  onSize: (size: { width: number; height: number }) => void; onDragging: (dragging: boolean) => void };

function PedalNode({ item, board, selected, warning, snap, onSelect, onMove, onDragging }: { item: BoardItem; board: Board; selected: boolean; warning: boolean; snap: boolean; onSelect: Props['onSelect']; onMove: Props['onMove']; onDragging: Props['onDragging'] }) {
  const { image, isPhoto } = useCanvasPedalPhoto(item.pedal);
  const { widthMm: width, heightMm: height } = item.pedal;
  const imageBounds = image && isPhoto ? containImage(image.width, image.height, width, height) : { x: 0, y: 0, width, height };
  return <Group name="pedal" id={item.instanceId} x={item.xMm} y={item.yMm} rotation={item.rotationDeg} offsetX={width / 2} offsetY={height / 2} draggable
    onMouseDown={event => { event.cancelBubble = true; onSelect(item.instanceId); }}
    onTouchStart={event => { event.cancelBubble = true; onSelect(item.instanceId); }}
    onDragStart={() => { onSelect(item.instanceId); onDragging(true); }}
    onDragMove={event => { const node = event.target; const point = clampPosition(item, board, { xMm: node.x(), yMm: node.y() }, snap); node.position({ x: point.xMm, y: point.yMm }); }}
    onDragEnd={event => { const node = event.target; const point = clampPosition(item, board, { xMm: node.x(), yMm: node.y() }, snap); onMove(item.instanceId, point); onDragging(false); }}>
    <Rect width={width} height={height} fill={image && isPhoto ? 'transparent' : item.pedal.color} cornerRadius={4} shadowColor="#000" shadowBlur={6} shadowOffsetY={3} shadowOpacity={.3}/>
    {image ? <CanvasImage image={image} {...imageBounds}/> : <Text text={item.pedal.name} y={height / 2 - 5} width={width} fontSize={9} align="center" fill={item.pedal.ink}/>}
    {item.mountSide === 'bottom' && <><Rect width={width} height={height} stroke="#8edec9" strokeWidth={1.5} dash={[4,3]} fill="#24554e44" listening={false}/><Text text="하부" x={3} y={3} fontSize={9} padding={2} fill="#b3ffe9" listening={false}/></>}
    {item.owned && <Circle x={width - 6} y={height - 6} radius={2.5} fill="#b0cf9f" stroke="#2e4834" strokeWidth={.7}/>}
    {(selected || warning) && <Rect x={-4} y={-4} width={width + 8} height={height + 8} cornerRadius={6} stroke={selected ? '#ffb68d' : '#bd8362'} strokeWidth={selected ? 1.5 : 1} dash={selected ? undefined : [3, 3]} listening={false}/>}
    {selected && [[-4, -4], [width + 4, -4], [-4, height + 4], [width + 4, height + 4]].map(([x, y], i) => <Rect key={i} x={x - 1.5} y={y - 1.5} width={3} height={3} fill="#ffc19e" listening={false}/>)}
  </Group>;
}

function BoardSurface({ board, side }: { board: Board; side: 'top' | 'bottom' }) {
  const model = boardModel(board);
  const source = model ? catalogPhoto('boards', model.id)?.src : undefined;
  const [loaded, setLoaded] = useState<{ source: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!source) return;
    let active = true; const image = new window.Image();
    image.onload = () => { if (active) setLoaded({ source, image }); };
    image.onerror = () => { if (active) setLoaded(null); };
    image.src = source;
    return () => { active = false; };
  }, [source]);
  const image = loaded?.source === source ? loaded?.image : undefined;
  const railCount = Math.max(2, Math.round(board.heightMm / 62));
  const railHeight = (board.heightMm - 13 * (railCount - 1) - 10) / railCount;
  if (side === 'bottom') {
    const profile = boardRockboard(board);
    return <Group listening={false}><Rect width={board.widthMm} height={board.heightMm} fill="#18221e" stroke="#81957e" strokeWidth={1} cornerRadius={5}/>
      {profile ? rockboardBays(profile).map(bay=><Group key={bay.index}><Rect x={bay.xMm-bay.widthMm/2} y={(profile.depthMm-profile.cavityDepthMm)/2} width={bay.widthMm} height={profile.cavityDepthMm} fill="#365b4c55" stroke="#7dbba3" strokeWidth={.8} dash={[4,3]}/><Text x={bay.xMm-bay.widthMm/2} y={profile.depthMm-16} width={bay.widthMm} text={`${bay.widthMm} mm`} align="center" fontSize={7} fill="#8db49f"/></Group>) : <Text text="하부 구조 미확인 · 배치 미리보기" x={8} y={8} fontSize={8} fill="#b6cbb8"/>}
    </Group>;
  }
  return <Group>
    <Rect width={board.widthMm} height={board.heightMm} cornerRadius={5} fill={image ? 'transparent' : '#151d19'} stroke="#606c5e" strokeWidth={1} shadowBlur={14} shadowColor="#000" shadowOpacity={.3} shadowOffsetY={6}/>
    {image ? <CanvasImage image={image} {...containImage(image.width, image.height, board.widthMm, board.heightMm)} listening={false}/> : <>
      {Array.from({ length: railCount }, (_, i) => <Rect key={i} x={4} y={5 + i * (railHeight + 13)} width={board.widthMm - 8} height={railHeight} cornerRadius={2} fill="#333b35" stroke="#4a5649" strokeWidth={.5}/>)}
      {model && <Text text="보드 사진 로딩 중 또는 사용 불가 · 규격 표시" x={5} y={5} fontSize={7} fill="#c8d1c0"/>}
    </>}
  </Group>;
}

export default function BoardCanvas(props: Props) {
  const [cableHover,setCableHover]=useState<Point|null>(null);
  const host = useRef<HTMLDivElement>(null), stage = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 700, height: 500 });
  const panStart = useRef<{ x: number; y: number; pan: Props['pan'] } | null>(null);
  useEffect(() => {
    const node = host.current; if (!node) return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSize({ width, height }); props.onSize({ width, height }); });
    observer.observe(node); return () => observer.disconnect();
  }, [props.onSize]);
  const { board, selectedId, onSelect, onPan, zoom, pan, grid, snap } = props;
  const transform = viewportTransform(board, size.width, size.height, zoom, pan);
  const warnings = placementWarnings(board);
  const clearSelection = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (props.placingCable || event.target.findAncestor('.pedal', true) || event.target.findAncestor('.manual-cable', true)) return;
    onSelect(null);
    const pointer = event.target.getStage()?.getPointerPosition();
    if (pointer && zoom > 1) panStart.current = { ...pointer, pan: { ...pan } };
  };
  const cablePointer = () => {const pointer=stage.current?.getPointerPosition();return pointer?cablePoint({xMm:(pointer.x-transform.x)/transform.scale,yMm:(pointer.y-transform.y)/transform.scale},snap):null;};
  const placeCable = (event:Konva.KonvaEventObject<MouseEvent|TouchEvent>) => {event.cancelBubble=true;const point=cablePointer();if(point)props.onCablePoint(point);};
  const finishPan = () => { panStart.current = null; };
  return <div className="konva-host" style={{cursor:props.placingCable?'crosshair':undefined}} ref={host} aria-hidden="true">
    <Stage ref={stage} width={size.width} height={size.height} onMouseDown={clearSelection} onTouchStart={clearSelection}
      onMouseMove={() => { const start = panStart.current, point = stage.current?.getPointerPosition(); if (start && point) onPan({ x: start.pan.x + point.x - start.x, y: start.pan.y + point.y - start.y }); }}
      onTouchMove={() => { const start = panStart.current, point = stage.current?.getPointerPosition(); if (start && point) onPan({ x: start.pan.x + point.x - start.x, y: start.pan.y + point.y - start.y }); }}
      onMouseUp={finishPan} onTouchEnd={finishPan} onMouseLeave={finishPan}>
      <Layer>
        <Group x={transform.x} y={transform.y} scaleX={transform.scale} scaleY={transform.scale}>
          <Group listening={false}>
            {Array.from({ length: Math.floor(board.widthMm / 100) + 1 }, (_, i) => <Group key={i}><Text x={i * 100 - 15} y={-27} width={30} text={String(i * 100)} fontSize={6} align="center" fill="#95a28e"/><Line points={[i * 100, -15, i * 100, -21]} stroke="#65715f" strokeWidth={.6}/></Group>)}
            {Array.from({ length: Math.floor(board.heightMm / 100) + 1 }, (_, i) => <Text key={i} x={-38} y={i * 100 - 3} width={24} text={String(i * 100)} fontSize={6} align="right" fill="#95a28e"/>)}
          </Group>
          <BoardSurface board={board} side={props.side}/>
          {grid && <Group listening={false}>{Array.from({ length: Math.floor(board.widthMm / 25) + 1 }, (_, i) => <Line key={`x${i}`} points={[i * 25, 0, i * 25, board.heightMm]} stroke="#b3bda8" opacity={.08} strokeWidth={.6}/>)}{Array.from({ length: Math.floor(board.heightMm / 25) + 1 }, (_, i) => <Line key={`y${i}`} points={[0, i * 25, board.widthMm, i * 25]} stroke="#b3bda8" opacity={.08} strokeWidth={.6}/>)}</Group>}
          <Text x={board.widthMm - 180} y={board.heightMm - 13} width={165} text={`PEDALBOOK  /  ${board.widthMm} × ${board.heightMm}`} align="right" fontSize={5} letterSpacing={1} fill="#84917a" listening={false}/>
          {board.items.filter(item=>(item.mountSide ?? 'top') === props.side).sort((a,b)=>Number(a.instanceId === selectedId)-Number(b.instanceId === selectedId)).map(item => <PedalNode key={item.instanceId} {...props} item={item} selected={item.instanceId === selectedId} warning={warnings.ids.has(item.instanceId)}/>)}
          <PatchCables board={board} side={props.side} selectedId={props.selectedCableId} scale={transform.scale} snap={snap} onSelect={props.onCableSelect} onEndpoint={props.onCableEndpoint} onDragging={props.onDragging}/>
          {props.placingCable && <>
            <Rect x={-transform.x/transform.scale} y={-transform.y/transform.scale} width={size.width/transform.scale} height={size.height/transform.scale} fill="rgba(0,0,0,0)" onMouseDown={e=>{e.cancelBubble=true;}} onTouchStart={e=>{e.cancelBubble=true;}} onMouseMove={()=>setCableHover(cablePointer())} onClick={placeCable} onTap={placeCable}/>
            {props.cableStart && <Group listening={false}>
              {cableHover && <Line points={[props.cableStart.xMm,props.cableStart.yMm,cableHover.xMm,cableHover.yMm]} stroke="#efb567" strokeWidth={board.cableLayout?.cableDiameterMm??4} dash={[5,4]}/>}
              <Circle x={props.cableStart.xMm} y={props.cableStart.yMm} radius={6/transform.scale} fill="#efb567" stroke="#fff" strokeWidth={1/transform.scale}/>
            </Group>}
          </>}
        </Group>
      </Layer>
    </Stage>
  </div>;
}
