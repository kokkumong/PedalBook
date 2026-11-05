import { useEffect, useState } from 'react';
import type { Board, BoardItem } from '../domain/board.ts';
import { boardRockboard, itemElevation, undersideWarnings } from '../domain/board-3d.ts';
import { bossProfile } from '../domain/boss.ts';

export function MountControls({ item, board, onSide, onHeight, children }: {
  item: BoardItem; board: Board; children?: import('react').ReactNode;
  onSide: (side: 'top' | 'bottom') => void;
  onHeight: (height: number | undefined) => void;
}) {
  const elevation = itemElevation(item);
  const [height, setHeight] = useState(String(elevation.mm));
  useEffect(()=>setHeight(String(itemElevation(item).mm)),[item]);
  const supported = !!boardRockboard(board), bottom = item.mountSide === 'bottom';
  const warnings = undersideWarnings(item,board);
  const boss = bossProfile(item.pedalId);
  return <div className="mount-controls">
    <div className="mount-side" role="group" aria-label="장착 위치">
      <button aria-pressed={!bottom} onClick={()=>onSide('top')}>상판</button>
      <button aria-pressed={bottom} onClick={()=>onSide('bottom')}>보드 아래</button>
    </div>
    <details className="equipment-details" key={item.instanceId}><summary>규격·높이 및 출처</summary>
    {children}
    {!supported && <p>하부 미리보기로 배치할 수 있어요. 이 보드의 실제 하부 구조·높이는 확인되지 않았어요.</p>}
    {bottom && <p>장비 바닥면이 보드 밑면에 붙고 조작면이 아래를 향해요. 2mm 부착 여유를 두며, 하부 시점에서 드래그하거나 방향키로 이동할 수 있어요.</p>}
    <form onSubmit={event=>{ event.preventDefault(); const value=Number(height); if (Number.isFinite(value) && value>=1 && value<=500) onHeight(value); }}>
      <label htmlFor="equipment-height">장비 높이 <span>mm</span></label>
      <div className="height-input"><input id="equipment-height" type="number" min="1" max="500" step="0.1" required value={height} onChange={event=>setHeight(event.target.value)}/><button className="button light" type="submit">높이 적용</button></div>
    </form>
    <p>{elevation.manual ? <>직접 입력한 높이 · <button className="height-reset" onClick={()=>onHeight(undefined)}>기본 높이로 복원</button></> : elevation.estimated ? '높이 미상 · 임시 40mm. 실측 높이를 입력할 수 있어요.' : <a href={elevation.sourceUrl} target="_blank" rel="noopener noreferrer">제조사 공식 높이 {elevation.mm}mm ↗</a>}</p>
    {boss && <p><a href={boss.sourceUrl} target="_blank" rel="noopener noreferrer">BOSS 공식 규격·사진 기반 3D ↗</a><br/>공식 외곽 {boss.widthMm} × {boss.depthMm} × {boss.heightMm}mm{boss.model==='gt1000core' ? ' (고무발 포함)' : ''}. 부품 형상은 사진 근사이며 제조사 CAD가 아닙니다. 저장된 가로·세로와 입력 높이에 맞춰 표시해요.</p>}
    </details>
    {bottom && <div role="status">{warnings.length ? warnings.map(warning=><p className="rockboard-caution" key={warning}>{warning}</p>) : <p>도면상 하부 여유 구획 안에 있어요. 실제 체결부·잭·케이블 공간은 별도로 확인하세요.</p>}</div>}
  </div>;
}
