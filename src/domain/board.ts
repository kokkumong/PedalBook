import { z } from 'zod';
import { CATALOG, SOURCE_BOARDS, PEDALS_BY_ID } from './catalog.ts';
import type { Pedal } from './catalog.ts';

export const MAX_PEDALS = 100;
export const MAX_FILE_BYTES = 256 * 1024;
export const mm = (n: number) => Math.round(n * 1000) / 1000;
const text = (max: number) => z.string().trim().min(1).max(max);
const color = z.string().regex(/^#[a-f\d]{6}$/i);
const coordinate = z.number().finite().min(-5000).max(5000);

const pedalSchema = z.object({
  id: text(100), brand: text(80), name: text(160), subtitle: text(60), category: text(20),
  widthMm: z.number().finite().min(1).max(2540), heightMm: z.number().finite().min(1).max(2540),
  color, ink: color.default('#302c35'), style: z.enum(['compact', 'tuner', 'wide', 'custom']).default('custom'),
  sourceUrl: z.string().nullable().default(null),
}).transform((p): Pedal => {
  const known = PEDALS_BY_ID.get(p.id);
  // Imported links never become arbitrary external destinations.
  return { ...p, sourceUrl: known?.sourceUrl ?? null, style: known?.style ?? 'custom', ink: known?.ink ?? '#302c35' };
});
const itemSchema = z.object({
  instanceId: text(100), pedalId: text(100), pedal: pedalSchema,
  xMm: coordinate, yMm: coordinate, rotationDeg: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  owned: z.boolean().default(false), manualPriceKrw: z.number().int().min(0).max(100_000_000).nullable().default(null),
  // Optional extensions keep old v2 snapshots unchanged; absent means top.
  mountSide: z.enum(['top', 'bottom']).optional(),
  physicalHeightMm: z.number().finite().min(1).max(500).optional(),
}).refine(item => item.pedalId === item.pedal.id, '페달 ID와 규격 정보가 일치하지 않습니다.');
const boardSchema = z.object({
  schemaVersion: z.literal(2), name: text(60),
  widthMm: z.number().finite().min(50).max(2540), heightMm: z.number().finite().min(50).max(2540),
  modelId: text(100).optional(),
  items: z.array(itemSchema).max(MAX_PEDALS),
}).refine(board => new Set(board.items.map(i => i.instanceId)).size === board.items.length, '페달 인스턴스 ID가 중복됩니다.');

export type Board = z.infer<typeof boardSchema>;
export type BoardItem = Board['items'][number];
export type Point = { xMm: number; yMm: number };

export function parseBoard(input: unknown): Board {
  let raw = input;
  if (isRecord(raw) && raw.schemaVersion === 1) {
    const legacy = raw;
    raw = { schemaVersion: 2, name: legacy.name, widthMm: legacy.width, heightMm: legacy.height,
      items: Array.isArray(legacy.items) ? legacy.items.map((item: unknown) => {
        if (!isRecord(item) || !isRecord(item.pedal)) return item;
        const p = item.pedal;
        return { instanceId: item.id, pedalId: p.id, pedal: { ...p, widthMm: p.width, heightMm: p.height, sourceUrl: p.source },
          xMm: item.x, yMm: item.y, rotationDeg: item.rotation, owned: false, manualPriceKrw: null };
      }) : legacy.items };
  }
  const result = boardSchema.safeParse(raw);
  if (!result.success) throw new Error('보드 파일의 형식·규격·가격을 확인해 주세요. 지원 버전은 1과 2입니다.');
  return result.data;
}
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function parseBoardFile(text: string): Board {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('보드 파일은 256KB 이하로 선택해 주세요.');
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error('올바른 JSON 파일이 아닙니다.'); }
  return parseBoard(json);
}
export function emptyBoard(): Board { return { schemaVersion: 2, name: 'Untitled board', widthMm: 600, heightMm: 320, items: [] }; }
export function sampleBoard(): Board {
  const order = ['boss-tu3', 'boss-ds1', 'boss-ce2w', 'boss-dd8', 'strymon-bluesky'];
  return { ...emptyBoard(), name: 'My first pedalboard', items: order.map((id, index) => ({
    instanceId: `sample-${index}`, pedalId: id, pedal: { ...CATALOG.find(p => p.id === id)! },
    xMm: [80, 180, 280, 380, 500][index], yMm: 160, rotationDeg: 0, owned: false, manualPriceKrw: null,
  })) };
}
export function extents(item: BoardItem) {
  const swap = item.rotationDeg % 180 === 90;
  return { xMm: (swap ? item.pedal.heightMm : item.pedal.widthMm) / 2, yMm: (swap ? item.pedal.widthMm : item.pedal.heightMm) / 2 };
}
export function clampPosition(item: BoardItem, board: Board, point: Point, snap = false): Point {
  const half = extents(item);
  const axis = (n: number, size: number, length: number) => mm(length < size * 2 ? length / 2 : Math.min(length - size, Math.max(size, snap ? Math.round(n / 5) * 5 : n)));
  return { xMm: axis(point.xMm, half.xMm, board.widthMm), yMm: axis(point.yMm, half.yMm, board.heightMm) };
}
export function overlaps(a: BoardItem, b: BoardItem) {
  if ((a.mountSide ?? 'top') !== (b.mountSide ?? 'top')) return false;
  const ae = extents(a), be = extents(b);
  return Math.abs(a.xMm - b.xMm) < ae.xMm + be.xMm - .001 && Math.abs(a.yMm - b.yMm) < ae.yMm + be.yMm - .001;
}
export function placementWarnings(board: Board) {
  const ids = new Set<string>(); let outside = 0, pairs = 0;
  board.items.forEach((item, index) => {
    const half = extents(item);
    if (item.xMm - half.xMm < -.001 || item.yMm - half.yMm < -.001 || item.xMm + half.xMm > board.widthMm + .001 || item.yMm + half.yMm > board.heightMm + .001) { outside++; ids.add(item.instanceId); }
    board.items.slice(index + 1).forEach(other => { if (overlaps(item, other)) { pairs++; ids.add(item.instanceId); ids.add(other.instanceId); } });
  });
  return { ids, outside, pairs };
}
export function freePosition(item: BoardItem, board: Board): Point {
  const half = extents(item);
  for (let yMm = half.yMm + 5; yMm <= board.heightMm - half.yMm; yMm += 5) {
    for (let xMm = half.xMm + 5; xMm <= board.widthMm - half.xMm; xMm += 5) {
      if (!board.items.some(other => overlaps({ ...item, xMm, yMm }, other))) return { xMm, yMm };
    }
  }
  return { xMm: board.widthMm / 2, yMm: board.heightMm / 2 };
}
export function addItem(board: Board, pedal: Pedal, instanceId: string, point?: Point, snap = true): Board {
  if (board.items.length >= MAX_PEDALS) throw new Error(`한 보드에는 최대 ${MAX_PEDALS}개까지 배치할 수 있어요.`);
  const item: BoardItem = { instanceId, pedalId: pedal.id, pedal: { ...pedal }, xMm: 0, yMm: 0, rotationDeg: 0, owned: false, manualPriceKrw: null };
  Object.assign(item, point ? clampPosition(item, board, point, snap) : freePosition(item, board));
  return { ...board, items: [...board.items, item] };
}
export function updateItem(board: Board, instanceId: string, patch: Partial<Pick<BoardItem, 'xMm' | 'yMm' | 'rotationDeg' | 'owned' | 'manualPriceKrw' | 'mountSide' | 'physicalHeightMm'>>, snap = false): Board {
  return { ...board, items: board.items.map(item => {
    if (item.instanceId !== instanceId) return item;
    const next = { ...item, ...patch };
    if ('xMm' in patch || 'yMm' in patch || 'rotationDeg' in patch) Object.assign(next, clampPosition(next, board, next, snap));
    return next;
  }) };
}
export function resizeBoard(board: Board, widthMm: number, heightMm: number): Board {
  const next = parseBoard({ ...board, widthMm, heightMm, modelId: undefined });
  return { ...next, items: next.items.map(item => ({ ...item, ...clampPosition(item, next, item) })) };
}
export function viewportTransform(board: Board, width: number, height: number, zoom: number, pan: { x: number; y: number }) {
  const scale = Math.min(Math.max(1, width - 90) / board.widthMm, Math.max(1, height - 120) / board.heightMm) * zoom;
  return { scale, x: (width - board.widthMm * scale) / 2 + pan.x, y: (height - board.heightMm * scale) / 2 + pan.y };
}
export function screenToMm(point: { x: number; y: number }, transform: { x: number; y: number; scale: number }): Point {
  return { xMm: (point.x - transform.x) / transform.scale, yMm: (point.y - transform.y) / transform.scale };
}

export function selectBoardModel(board: Board, id: string): Board {
  const model = SOURCE_BOARDS.get(id);
  if (!model) throw new Error('보드 모델을 찾을 수 없어요.');
  // Keep existing placement coordinates: smaller boards report overflow rather than silently moving pedals.
  return parseBoard({ ...board, widthMm: model.widthMm, heightMm: model.heightMm, modelId: id });
}
export function boardModel(board: Board) {
  const model = board.modelId ? SOURCE_BOARDS.get(board.modelId) : undefined;
  return model && model.widthMm === board.widthMm && model.heightMm === board.heightMm ? model : undefined;
}
