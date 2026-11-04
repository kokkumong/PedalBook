import type { Board } from '../domain/board.ts';
import { SOURCE_BOARDS } from '../domain/catalog.ts';
import { boardRockboard } from '../domain/board-3d.ts';
import { rockboardProfile } from '../domain/rockboard.ts';

export function RockboardInfo({ board, onApply }: { board: Board; onApply: (id: string) => void }) {
  const profile = rockboardProfile(board.modelId ? SOURCE_BOARDS.get(board.modelId) : undefined);
  if (!profile) return null;
  const active = !!boardRockboard(board);
  return <div className="rockboard-info">
    <strong>RockBoard · {profile.name}</strong>
    {active ? <>
      <p>공식 도면 기반 3D · 체결부 단순화</p>
      <dl><div><dt>하부 구획 너비</dt><dd>{profile.bayWidthsMm.join(' / ')} mm</dd></div>
        <div><dt>하부 앞뒤 길이</dt><dd>{profile.cavityDepthMm} mm</dd></div>
        <div><dt>앞 → 뒤 여유 높이</dt><dd>{profile.cavityFrontMm} → {profile.cavityRearMm} mm</dd></div>
        {profile.step && <div><dt>상단 단차 / 하부 깊이</dt><dd>{profile.step.riseMm} / {profile.step.cavityDepthMm} mm</dd></div>}
      </dl>
      <p>3D의 ‘하부 보기’와 ‘하부 공간 표시’로 확인하세요. 경사 때문에 위치마다 여유 높이가 달라요.</p>
      <p className="rockboard-caution">파워 장착 전에는 공식 호환표와 실제 여유 공간을 확인해 주세요. 트레이·MOD·케이블 공간은 별도입니다.</p>
    </> : <>
      <p>이 저장본은 이전 카탈로그 규격({board.widthMm} × {board.heightMm} mm)을 사용해요. 공식 규격 {profile.widthMm} × {profile.depthMm} mm를 적용하면 상세 3D가 활성화됩니다.</p>
      <button className="button light full" onClick={() => onApply(board.modelId!)}>공식 규격 적용</button>
      <p>페달 좌표는 유지되며, 변경 후 경계 경고를 확인하세요.</p>
    </>}
    <div className="rockboard-sources">
      <a href={profile.productUrl} target="_blank" rel="noopener noreferrer">제품 사양 ↗</a>
      <a href={profile.drawingUrl} target="_blank" rel="noopener noreferrer">설계 도면 ↗</a>
      <a href={profile.spacesUrl} target="_blank" rel="noopener noreferrer">하부 공간도면 ↗</a>
      <a href={profile.psuUrl} target="_blank" rel="noopener noreferrer">파워 호환표 ↗</a>
    </div>
    <details><summary>치수 차이와 재구성 범위</summary>
      {profile.conflicts.map(text => <p key={text}>{text}</p>)}
      <p>판 두께·고무발·체결부와 구획의 끝 여백은 추정치입니다. 제조사 CAD나 장착 가능 판정은 아닙니다.</p>
    </details>
  </div>;
}
