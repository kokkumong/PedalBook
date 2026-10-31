'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect, Circle, Text, Line, Image as CanvasImage } from 'react-konva';
import type Konva from 'konva';
import { clampPosition, placementWarnings, viewportTransform } from '../domain/board.ts';
import type { Board, BoardItem, Point } from '../domain/board.ts';
import { pedalImage } from '../domain/artwork.ts';

type Props = { board: Board; selectedId: string | null; zoom: number; pan: { x: number; y: number }; grid: boolean; snap: boolean;
  onSelect: (id: string | null) => void; onMove: (id: string, point: Point) => void; onPan: (pan: { x: number; y: number }) => void;
  onSize: (size: { width: number; height: number }) => void; onDragging: (dragging: boolean) => void };

function PedalNode({ item, board, selected, warning, snap, onSelect, onMove, onDragging }: { item: BoardItem; board: Board; selected: boolean; warning: boolean; snap: boolean; onSelect: Props['onSelect']; onMove: Props['onMove']; onDragging: Props['onDragging'] }) {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  const source = useMemo(() => pedalImage(item.pedal), [item.pedal]);
  useEffect(() => {
    let active = true; const img = new window.Image();
    img.onload = () => { if (active) setImage(img); };
    img.onerror = () => { if (active) setImage(undefined); };
    img.src = source;
    return () => { active = false; };
  }, [source]);
  const { widthMm: width, heightMm: height } = item.pedal;
  return <Group name="pedal" id={item.instanceId} x={item.xMm} y={item.yMm} rotation={item.rotationDeg} offsetX={width / 2} offsetY={height / 2} draggable
    onMouseDown={event => { event.cancelBubble = true; onSelect(item.instanceId); }}
    onTouchStart={event => { event.cancelBubble = true; onSelect(item.instanceId); }}
    onDragStart={() => { onSelect(item.instanceId); onDragging(true); }}
    onDragMove={event => { const node = event.target; const point = clampPosition(item, board, { xMm: node.x(), yMm: node.y() }, snap); node.position({ x: point.xMm, y: point.yMm }); }}
    onDragEnd={event => { const node = event.target; const point = clampPosition(item, board, { xMm: node.x(), yMm: node.y() }, snap); onMove(item.instanceId, point); onDragging(false); }}>
    <Rect width={width} height={height} fill={item.pedal.color} cornerRadius={4} shadowColor="#000" shadowBlur={6} shadowOffsetY={3} shadowOpacity={.3}/>
    {image ? <CanvasImage image={image} width={width} height={height}/> : <Text text={item.pedal.name} y={height / 2 - 5} width={width} fontSize={9} align="center" fill={item.pedal.ink}/>}
    {item.owned && <Circle x={width - 6} y={height - 6} radius={2.5} fill="#b0cf9f" stroke="#2e4834" strokeWidth={.7}/>}
    {(selected || warning) && <Rect x={-4} y={-4} width={width + 8} height={height + 8} cornerRadius={6} stroke={selected ? '#ffb68d' : '#bd8362'} strokeWidth={selected ? 1.5 : 1} dash={selected ? undefined : [3, 3]} listening={false}/>}
    {selected && [[-4, -4], [width + 4, -4], [-4, height + 4], [width + 4, height + 4]].map(([x, y], i) => <Rect key={i} x={x - 1.5} y={y - 1.5} width={3} height={3} fill="#ffc19e" listening={false}/>)}
  </Group>;
}

export default function BoardCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null), stage = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 700, height: 500 });
  const panStart = useRef<{ x: number; y: number; pan: Props['pan'] } | null>(null);
  useEffect(() => {
    const node = host.current; if (!node) return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSize({ width, height }); props.onSize({ width, height }); });
    observer.observe(node); return () => observer.disconnect();
  }, [props.onSize]);
  const { board, selectedId, onSelect, onPan, zoom, pan, grid } = props;
  const transform = viewportTransform(board, size.width, size.height, zoom, pan);
  const warnings = placementWarnings(board);
  const railCount = Math.max(2, Math.round(board.heightMm / 62));
  const railHeight = (board.heightMm - 13 * (railCount - 1) - 10) / railCount;
  const clearSelection = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (event.target.findAncestor('.pedal', true)) return;
    onSelect(null);
    const pointer = event.target.getStage()?.getPointerPosition();
    if (pointer && zoom > 1) panStart.current = { ...pointer, pan: { ...pan } };
  };
  const finishPan = () => { panStart.current = null; };
  return <div className="konva-host" ref={host} aria-hidden="true">
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
          <Rect width={board.widthMm} height={board.heightMm} cornerRadius={5} fill="#151d19" stroke="#606c5e" shadowBlur={14} shadowColor="#000" shadowOpacity={.3} shadowOffsetY={6}/>
          {Array.from({ length: railCount }, (_, i) => <Rect key={i} x={4} y={5 + i * (railHeight + 13)} width={board.widthMm - 8} height={railHeight} cornerRadius={2} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: railHeight }} fillLinearGradientColorStops={[0, '#454d47', .1, '#333b35', 1, '#29312c']} stroke="#4a5649" strokeWidth={.5}/>)}
          {grid && <Group listening={false}>{Array.from({ length: Math.floor(board.widthMm / 25) + 1 }, (_, i) => <Line key={`x${i}`} points={[i * 25, 0, i * 25, board.heightMm]} stroke="#b3bda8" opacity={.08} strokeWidth={.6}/>)}{Array.from({ length: Math.floor(board.heightMm / 25) + 1 }, (_, i) => <Line key={`y${i}`} points={[0, i * 25, board.widthMm, i * 25]} stroke="#b3bda8" opacity={.08} strokeWidth={.6}/>)}</Group>}
          <Text x={board.widthMm - 180} y={board.heightMm - 13} width={165} text={`PEDALBOOK  /  ${board.widthMm} × ${board.heightMm}`} align="right" fontSize={5} letterSpacing={1} fill="#84917a" listening={false}/>
          {board.items.map(item => <PedalNode key={item.instanceId} {...props} item={item} selected={item.instanceId === selectedId} warning={warnings.ids.has(item.instanceId)}/>)}
        </Group>
      </Layer>
    </Stage>
  </div>;
}
