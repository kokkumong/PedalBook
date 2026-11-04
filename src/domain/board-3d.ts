import { boardModel, clampPosition, extents } from './board.ts';
import type { Board, BoardItem, Point } from './board.ts';
import { rockboardProfile, rockboardAngle, rockboardBaseHeight, rockboardBays, ROCKBOARD_SHEET_MM, ROCKBOARD_FOOT_MM } from './rockboard.ts';
import { bossProfile } from './boss.ts';

// The existing heightMm is the top-view depth. These are separate visual Z heights.
export const PREVIEW_HEIGHT_MM = 40;
const VERIFIED_HEIGHTS: Readonly<Record<string, { mm: number; sourceUrl: string }>> = {
  'strymon-bluesky': { mm: 61, sourceUrl: 'https://www.strymon.net/product/bluesky/' },
  'pp-p-468e6a1037b6cf55433c': { mm: 32, sourceUrl: 'https://www.moskyaudio.com/product/product-19-230.html' },
};
export function pedalElevation(id: string) {
  const boss = bossProfile(id);
  const known = boss ? { mm: boss.heightMm, sourceUrl: boss.sourceUrl } : Object.hasOwn(VERIFIED_HEIGHTS, id) ? VERIFIED_HEIGHTS[id] : undefined;
  return { mm: known?.mm ?? PREVIEW_HEIGHT_MM, estimated: !known, sourceUrl: known?.sourceUrl };
}
export function itemElevation(item: BoardItem) {
  const known = pedalElevation(item.pedalId);
  return item.physicalHeightMm === undefined ? { ...known, manual: false }
    : { mm: item.physicalHeightMm, estimated: false, sourceUrl: undefined, manual: true };
}

// Three.js uses Y-up. Saved board X/Y map to world X/Z; 1 world unit = 1 mm.
export function boardToWorld(point: Point, board: Pick<Board, 'widthMm' | 'heightMm'>) {
  return { x: point.xMm - board.widthMm / 2, z: point.yMm - board.heightMm / 2 };
}
export function worldToBoard(point: { x: number; z: number }, board: Pick<Board, 'widthMm' | 'heightMm'>): Point {
  return { xMm: point.x + board.widthMm / 2, yMm: point.z + board.heightMm / 2 };
}
export function worldRotation(rotationDeg: BoardItem['rotationDeg']) { return -rotationDeg * Math.PI / 180; }

// Preserve the grab offset on the deck-parallel plane through the initial hit, so tall
// pedals do not jump when dragging starts or when the camera is tilted.
export function dragOnBoard(item: BoardItem, board: Board, start: { x: number; z: number }, current: { x: number; z: number }, snap: boolean): Point {
  return clampPosition(item, board, { xMm: item.xMm + current.x - start.x, yMm: item.yMm + current.z - start.z }, snap);
}

export function fitDistance(radius: number, aspect: number, verticalFovDeg = 40) {
  const vertical = verticalFovDeg * Math.PI / 360;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(.01, aspect));
  return radius / Math.sin(Math.min(vertical, horizontal)) * 1.12;
}

export function boardRockboard(board: Board) { return rockboardProfile(boardModel(board)); }
export function boardSurfaceAngle(board: Board) {
  const profile = boardRockboard(board);
  return profile ? rockboardAngle(profile) : 0;
}
export function boardSurfacePoint(point: Point, board: Board, upper?: boolean) {
  const profile = boardRockboard(board), angle = boardSurfaceAngle(board);
  const local = boardToWorld(point, board);
  const raised = profile?.step && (upper ?? point.yMm <= profile.step.depthMm) ? profile.step.riseMm : 0;
  return { x: local.x, y: (profile ? rockboardBaseHeight(profile) : 0) - local.z * Math.tan(angle) + raised, z: local.z };
}
export function surfaceToBoard(point: { x: number; z: number }, board: Board): Point {
  return worldToBoard(point, board);
}
export function pedalCrossesStep(item: BoardItem, board: Board) {
  if (item.mountSide === 'bottom') return false;
  const step = boardRockboard(board)?.step;
  if (!step) return false;
  const half = extents(item).yMm;
  return item.yMm - half < step.depthMm && item.yMm + half > step.depthMm;
}
export function pedalSurfacePoint(item: BoardItem, board: Board) {
  const step = boardRockboard(board)?.step;
  if (item.mountSide === 'bottom') {
    const profile = boardRockboard(board), angle = boardSurfaceAngle(board);
    // Hang parallel to the deck with a 2mm mounting allowance. A straddling
    // footprint hangs below the lower tier rather than intersecting its riser.
    const upper = !!step && item.yMm + extents(item).yMm <= step.depthMm;
    const p = boardSurfacePoint(item, board, upper);
    // Local y=0 is the equipment base, glued to the underside; local +Y
    // points down after the mounting flip. Do not subtract its height twice.
    const offset = (profile ? ROCKBOARD_SHEET_MM : 16) + 2;
    return { x: p.x, y: p.y - offset * Math.cos(angle), z: p.z - offset * Math.sin(angle) };
  }
  // A straddling pedal is displayed on the higher plane and flagged, rather than
  // buried inside the riser. Moving across the step never rewrites saved mm.
  const upper = !!step && item.yMm - extents(item).yMm < step.depthMm;
  return boardSurfacePoint(item, board, upper);
}

// Eight corners of the same oriented box used by Three.js. Stored X/Y remain
// mounting coordinates, not the shifted bottom face of a hanging enclosure.
export function itemLocalToWorld(point: { x: number; y: number; z: number }, item: BoardItem, board: Board) {
  const origin = pedalSurfacePoint(item, board), tilt = boardSurfaceAngle(board), yaw = worldRotation(item.rotationDeg);
  const sign = item.mountSide === 'bottom' ? -1 : 1;
  const y = point.y*sign, z = point.z*sign;
  const rx = point.x*Math.cos(yaw)+z*Math.sin(yaw), rz = -point.x*Math.sin(yaw)+z*Math.cos(yaw);
  return { x: origin.x+rx, y: origin.y+y*Math.cos(tilt)-rz*Math.sin(tilt), z: origin.z+y*Math.sin(tilt)+rz*Math.cos(tilt) };
}
export function itemWorldCorners(item: BoardItem, board: Board) {
  const result: { x: number; y: number; z: number }[] = [];
  for (const x of [-item.pedal.widthMm/2,item.pedal.widthMm/2]) for (const z of [-item.pedal.heightMm/2,item.pedal.heightMm/2]) for (const y of [0,itemElevation(item).mm]) {
    result.push(itemLocalToWorld({x,y,z},item,board));
  }
  return result;
}

export function undersideWarnings(item: BoardItem, board: Board): string[] {
  if (item.mountSide !== 'bottom') return [];
  const profile = boardRockboard(board);
  if (!profile) return ['이 보드는 하부 구조 정보가 없어요. RockBoard 공식 규격을 적용해 확인하세요.'];
  const corners = itemWorldCorners(item, board);
  const xs = corners.map(p=>p.x+board.widthMm/2), ys = corners.map(p=>p.z+board.heightMm/2);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const inset = (profile.depthMm-profile.cavityDepthMm)/2, warnings: string[] = [];
  if (!rockboardBays(profile).some(bay=>minX >= bay.xMm-bay.widthMm/2-.001 && maxX <= bay.xMm+bay.widthMm/2+.001)) warnings.push('하부 보강대 또는 측면 여유 구획을 벗어나요.');
  if (minY < inset-.001 || maxY > profile.depthMm-inset+.001) warnings.push('하부 앞뒤 여유 공간을 벗어나요.');
  if (Math.min(...corners.map(p=>p.y)) < ROCKBOARD_FOOT_MM-.001) warnings.push('현재 위치에서 장비 높이가 하부 여유 높이를 초과해요.');
  if (profile.step && minY < profile.step.depthMm && maxY > profile.step.depthMm) warnings.push('상단 단차 아래에 걸쳐 있어요. 한쪽 구획으로 이동해 주세요.');
  else if (profile.step && minY < profile.step.depthMm && maxY > inset+profile.step.cavityDepthMm) warnings.push('상단 하부 공간도면의 앞뒤 범위를 벗어나요.');
  if (itemElevation(item).estimated) warnings.push('장비 높이가 임시값이에요. 실제 높이를 입력해 주세요.');
  return warnings;
}
