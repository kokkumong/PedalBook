import { boardModel, clampPosition, extents } from './board.ts';
import type { Board, BoardItem, Point } from './board.ts';
import { rockboardProfile, rockboardAngle, rockboardBaseHeight } from './rockboard.ts';

// The existing heightMm is the top-view depth. These are separate visual Z heights.
export const PREVIEW_HEIGHT_MM = 40;
const VERIFIED_HEIGHTS: Readonly<Record<string, { mm: number; sourceUrl: string }>> = {
  'boss-ds1': { mm: 59, sourceUrl: 'https://www.boss.info/us/products/ds-1/' },
  'strymon-bluesky': { mm: 61, sourceUrl: 'https://www.strymon.net/product/bluesky/' },
};
export function pedalElevation(id: string) {
  const known = Object.hasOwn(VERIFIED_HEIGHTS, id) ? VERIFIED_HEIGHTS[id] : undefined;
  return { mm: known?.mm ?? PREVIEW_HEIGHT_MM, estimated: !known, sourceUrl: known?.sourceUrl };
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
  const step = boardRockboard(board)?.step;
  if (!step) return false;
  const half = extents(item).yMm;
  return item.yMm - half < step.depthMm && item.yMm + half > step.depthMm;
}
export function pedalSurfacePoint(item: BoardItem, board: Board) {
  const step = boardRockboard(board)?.step;
  // A straddling pedal is displayed on the higher plane and flagged, rather than
  // buried inside the riser. Moving across the step never rewrites saved mm.
  const upper = !!step && item.yMm - extents(item).yMm < step.depthMm;
  return boardSurfacePoint(item, board, upper);
}
