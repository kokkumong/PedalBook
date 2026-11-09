import { z } from 'zod';
import type { Board, Point } from './board.ts';
import { boardRockboard, boardSurfaceAngle, boardSurfacePoint } from './board-3d.ts';
import { ROCKBOARD_SHEET_MM } from './rockboard.ts';

export const MAX_CABLES = 100;
const coordinate = z.number().finite().min(-5000).max(5000);
export const cableEndpointSchema = z.object({ xMm: coordinate, yMm: coordinate, heightMm: z.number().finite().min(0).max(500) });
const manualCableSchema = z.object({
  id: z.string().min(1).max(100), start: cableEndpointSchema, end: cableEndpointSchema,
  side: z.enum(['top', 'bottom']), color: z.string().regex(/^#[a-f\d]{6}$/i),
}).refine(cable => Math.hypot(cable.end.xMm-cable.start.xMm,cable.end.yMm-cable.start.yMm)>=1, '케이블 끝점은 1mm 이상 떨어져야 합니다.');
export const cableLayoutSchema = z.object({
  cables: z.array(manualCableSchema).max(MAX_CABLES), visible: z.boolean(),
  plugWidthMm: z.number().finite().min(4).max(40), plugLengthMm: z.number().finite().min(5).max(60),
  cableDiameterMm: z.number().finite().min(1).max(12),
}).refine(layout => new Set(layout.cables.map(cable=>cable.id)).size===layout.cables.length, '케이블 ID가 중복됩니다.');
export type CableLayout = z.infer<typeof cableLayoutSchema>;
export type ManualCable = CableLayout['cables'][number];
export type CableEndpoint = ManualCable['start'];
export const emptyCableLayout = (): CableLayout => ({cables:[],visible:true,plugWidthMm:12,plugLengthMm:14,cableDiameterMm:4});
export const MANUAL_CABLE_COLORS = ['#efb567','#75cfba','#9ab9f4','#d4a0d9','#c8d682'];
export function cablePoint(point: Point, snap: boolean): Point {
  const axis=(value:number)=>Math.round(Math.max(-5000,Math.min(5000,snap?Math.round(value/5)*5:value))*1000)/1000;
  return {xMm:axis(point.xMm),yMm:axis(point.yMm)};
}
export function addManualCable(board:Board,id:string,start:Point,end:Point,side:ManualCable['side']):Board {
  const layout=board.cableLayout??emptyCableLayout();
  if(layout.cables.length>=MAX_CABLES || layout.cables.some(c=>c.id===id) || Math.hypot(end.xMm-start.xMm,end.yMm-start.yMm)<1)return board;
  const cable:ManualCable={id,start:{...start,heightMm:12},end:{...end,heightMm:12},side,color:MANUAL_CABLE_COLORS[layout.cables.length%MANUAL_CABLE_COLORS.length]};
  return {...board,cableLayout:{...layout,visible:true,cables:[...layout.cables,cable]}};
}
export function moveCableEndpoint(board:Board,id:string,end:'start'|'end',point:Point):Board {
  const layout=board.cableLayout;if(!layout)return board;
  const cable=layout.cables.find(c=>c.id===id);if(!cable)return board;
  const other=cable[end==='start'?'end':'start'];
  if(Math.hypot(point.xMm-other.xMm,point.yMm-other.yMm)<1)return board;
  return {...board,cableLayout:{...layout,cables:layout.cables.map(c=>c.id===id?{...c,[end]:{...c[end],...point}}:c)}};
}
export function removeManualCable(board:Board,id:string):Board {
  return board.cableLayout?{...board,cableLayout:{...board.cableLayout,cables:board.cableLayout.cables.filter(c=>c.id!==id)}}:board;
}
export function manualCableLength(cable:ManualCable) {return Math.hypot(cable.end.xMm-cable.start.xMm,cable.end.yMm-cable.start.yMm);}
export function endpointWorld(endpoint:CableEndpoint,side:ManualCable['side'],board:Board) {
  const point=boardSurfacePoint(endpoint,board),angle=boardSurfaceAngle(board);
  const height=side==='top'?endpoint.heightMm:-((boardRockboard(board)?ROCKBOARD_SHEET_MM:16)+2+endpoint.heightMm);
  return {x:point.x,y:point.y+height*Math.cos(angle),z:point.z+height*Math.sin(angle)};
}
