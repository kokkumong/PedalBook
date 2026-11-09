'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { parseBoard, sampleBoard } from '../domain/board.ts';
import type { Board } from '../domain/board.ts';
import { loadBoard, saveBoard, STORAGE_KEY } from '../domain/storage.ts';

type State = { board: Board; past: Board[]; future: Board[]; ready: boolean; dirty: boolean; version: number };
type Action = { type: 'load'; board: Board; dirty: boolean } | { type: 'edit'; update: (board: Board) => Board } | { type: 'undo' | 'redo' } | { type: 'saved'; version: number };
function reducer(state: State, action: Action): State {
  if (action.type === 'load') return { board: action.board, past: [], future: [], ready: true, dirty: action.dirty, version: state.version + 1 };
  if (action.type === 'saved') return state.version === action.version ? { ...state, dirty: false } : state;
  if (action.type === 'edit') {
    const next = action.update(state.board);
    if (JSON.stringify(next) === JSON.stringify(state.board)) return state;
    return { ...state, board: next, past: [...state.past, state.board].slice(-60), future: [], dirty: true, version: state.version + 1 };
  }
  if (action.type === 'undo' && state.past.length) return { ...state, board: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.board, ...state.future], dirty: true, version: state.version + 1 };
  if (action.type === 'redo' && state.future.length) return { ...state, board: state.future[0], past: [...state.past, state.board], future: state.future.slice(1), dirty: true, version: state.version + 1 };
  return state;
}

export function useBoard() {
  const [state, dispatch] = useReducer(reducer, { board: sampleBoard(), past: [], future: [], ready: false, dirty: false, version: 0 });
  const [storageProblem, setStorageProblem] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState(false);
  const expected = useRef<string | null>(null);

  const restore = useCallback(() => {
    try {
      const result = loadBoard(window.localStorage);
      expected.current = result.expected;
      setStorageProblem(result.message ?? null);
      setMigrationNotice(result.status === 'migrated');
      dispatch({ type: 'load', board: result.board, dirty: result.status === 'migrated' || result.status === 'empty' });
    } catch {
      setStorageProblem('브라우저 저장 공간을 사용할 수 없어요. 파일로 내보내 보관해 주세요.');
      dispatch({ type: 'load', board: sampleBoard(), dirty: false });
    }
  }, []);
  useEffect(restore, [restore]);

  useEffect(() => {
    if (!state.ready || !state.dirty || storageProblem) return;
    let cancelled = false;
    const persist = () => {
      if (cancelled) return;
      try {
        const result = saveBoard(window.localStorage, state.board, expected.current, crypto.randomUUID(), new Date().toISOString());
        if (result.status === 'saved') { expected.current = result.raw; dispatch({ type: 'saved', version: state.version }); }
        else setStorageProblem(result.message);
      } catch { setStorageProblem('자동 저장에 실패했어요. 파일로 내보내 보관해 주세요.'); }
    };
    // Serialize read/compare/write across tabs where Web Locks is supported.
    if (navigator.locks) void navigator.locks.request('pedalbook-board-save', persist).catch(() => { if (!cancelled) setStorageProblem('저장 잠금을 얻지 못했어요. 파일로 내보낸 뒤 다시 열어 주세요.'); });
    else persist();
    return () => { cancelled = true; };
  }, [state.board, state.dirty, state.ready, state.version, storageProblem]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== expected.current) setStorageProblem('다른 탭에서 저장본이 변경되었어요. 현재 보드를 파일로 내보낸 뒤 저장본을 불러와 주세요.');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    if (!state.dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [state.dirty]);

  const edit = useCallback((update: (board: Board) => Board) => dispatch({ type: 'edit', update }), []);
  const replace = useCallback((board: Board) => { const valid = parseBoard(board); dispatch({ type: 'edit', update: () => valid }); }, []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  return { ...state, edit, replace, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0, storageProblem, migrationNotice, restore };
}
