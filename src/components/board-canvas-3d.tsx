'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { boardRockboard } from '../domain/board-3d.ts';
import type { Board, Point } from '../domain/board.ts';
import { createBoardScene } from './three/board-scene';

export type Board3DHandle = Pick<ReturnType<typeof createBoardScene>, 'project'>;
type Props = {
  board: Board; selectedId: string | null; grid: boolean; snap: boolean; zoom: number; fitRequest: number;
  viewRequest: { side: 'top' | 'bottom'; sequence: number } | null;
  apiRef: RefObject<Board3DHandle | null>;
  onSelect: (id: string | null) => void; onMove: (id: string, point: Point) => void;
  onDragging: (dragging: boolean) => void; onZoom: (zoom: number) => void; onReturnTo2D: () => void;
};

export default function BoardCanvas3D(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createBoardScene> | null>(null);
  const latest = useRef(props); latest.current = props;
  const [failed, setFailed] = useState(false);
  const [showClearance,setShowClearance] = useState(false);
  const profile = boardRockboard(props.board);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    try {
      const view = createBoardScene(node, {
        onSelect: id => latest.current.onSelect(id),
        onMove: (id, point) => latest.current.onMove(id, point),
        onDragging: value => latest.current.onDragging(value),
        onZoom: value => latest.current.onZoom(value),
        onError: () => setFailed(true),
      });
      scene.current = view;
      latest.current.apiRef.current = view;
    } catch { setFailed(true); }
    return () => {
      scene.current?.dispose();
      scene.current = null;
      latest.current.apiRef.current = null;
    };
  }, []);
  useEffect(() => { scene.current?.update(props.board, props.selectedId, props.grid, props.snap); }, [props.board, props.selectedId, props.grid, props.snap]);
  useEffect(() => { scene.current?.setZoom(props.zoom); }, [props.zoom]);
  useEffect(() => { scene.current?.fit(); }, [props.fitRequest]);
  useEffect(() => {
    if (props.viewRequest?.side === 'bottom') scene.current?.viewUnderside();
    else if (props.viewRequest) scene.current?.fit();
  }, [props.viewRequest]);
  useEffect(() => { scene.current?.setClearance(showClearance); }, [showClearance]);
  useEffect(() => {
    if (failed) {
      scene.current?.dispose(); scene.current = null;
      latest.current.apiRef.current = null;
    }
  }, [failed]);
  return <>
    <div className="three-host" ref={host}/>
    {(profile || props.board.items.some(item=>item.mountSide === 'bottom')) && !failed && <div className="three-board-tools" aria-label="보드 3D 보기">
      <button onClick={() => scene.current?.fit()}>상판 보기</button>
      <button onClick={() => scene.current?.viewUnderside()}>하부 보기</button>
      {profile && <button aria-pressed={showClearance} onClick={() => setShowClearance(value => !value)}>하부 공간 {showClearance ? '숨기기' : '표시'}</button>}
    </div>}
    {failed ? <div className="three-error" role="alert"><strong>3D 화면을 열 수 없어요.</strong><p>브라우저의 WebGL 지원과 하드웨어 가속 설정을 확인해 주세요.<br/>현재 배치는 2D에서 계속 편집할 수 있어요.</p><button className="button primary" onClick={props.onReturnTo2D}>2D로 돌아가기</button></div>
      : <div className="three-instructions">배경 드래그 <b>시점 회전</b><span>·</span>휠 / 두 손가락 <b>확대</b><span>·</span>페달 드래그 <b>이동</b></div>}
  </>;
}
