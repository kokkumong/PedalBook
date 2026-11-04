import { isRecord, parseBoard, sampleBoard } from './board.ts';
import type { Board } from './board.ts';

export const STORAGE_KEY = 'pedalbook.board.v2';
export const LEGACY_KEY = 'pedalbook.prototype.v1';
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export type SavedEnvelope = { format: 1; revision: string; savedAt: string; board: Board };
export type LoadResult = { board: Board; expected: string | null; status: 'empty' | 'loaded' | 'migrated' | 'corrupt' | 'unavailable'; message?: string };

export function decodeEnvelope(raw: string): SavedEnvelope {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.format !== 1 || typeof value.revision !== 'string' || !value.revision || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) throw new Error('저장 형식이 올바르지 않습니다.');
  return { format: 1, revision: value.revision, savedAt: value.savedAt, board: parseBoard(value.board) };
}
export function loadBoard(storage: StoragePort): LoadResult {
  let raw: string | null;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { board: sampleBoard(), expected: null, status: 'unavailable', message: '브라우저 저장 공간에 접근할 수 없어요. 파일로 내보내 보관해 주세요.' }; }
  if (raw !== null) {
    try { return { board: decodeEnvelope(raw).board, expected: raw, status: 'loaded' }; }
    catch { return { board: sampleBoard(), expected: raw, status: 'corrupt', message: '저장 데이터를 읽지 못했어요. 원본을 보존하며 자동 저장을 멈췄습니다.' }; }
  }
  try {
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      try { return { board: parseBoard(JSON.parse(legacy)), expected: null, status: 'migrated' }; }
      catch { return { board: sampleBoard(), expected: null, status: 'corrupt', message: '이전 프로토타입 데이터를 읽지 못했어요. 원본은 보존하고 있습니다.' }; }
    }
    return { board: sampleBoard(), expected: null, status: 'empty' };
  } catch { return { board: sampleBoard(), expected: null, status: 'unavailable', message: '저장 공간을 읽지 못했어요. 파일 백업을 이용해 주세요.' }; }
}
export type SaveResult = { status: 'saved'; raw: string } | { status: 'conflict' | 'error'; message: string };
export function saveBoard(storage: StoragePort, board: Board, expected: string | null, revision: string, now: string): SaveResult {
  try {
    if (storage.getItem(STORAGE_KEY) !== expected) return { status: 'conflict', message: '다른 탭의 변경을 발견해 자동 저장을 멈췄어요. 현재 보드를 내보낸 뒤 저장본을 불러와 주세요.' };
    const raw = JSON.stringify({ format: 1, revision, savedAt: now, board: parseBoard(board) } satisfies SavedEnvelope);
    storage.setItem(STORAGE_KEY, raw);
    return { status: 'saved', raw };
  } catch { return { status: 'error', message: '자동 저장에 실패했어요. 현재 보드를 파일로 내보내 보관해 주세요.' }; }
}
