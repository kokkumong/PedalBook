'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoard } from '../hooks/use-board';
import { addItem, emptyBoard, MAX_FILE_BYTES, MAX_PEDALS, parseBoard, parseBoardFile, placementWarnings, resizeBoard, screenToMm, updateItem, viewportTransform } from '../domain/board.ts';
import type { Board, BoardItem, Point } from '../domain/board.ts';
import { CATALOG, searchCatalog } from '../domain/catalog.ts';
import type { Pedal } from '../domain/catalog.ts';
import { pedalImage } from '../domain/artwork.ts';
import { budget } from '../domain/market.ts';
import { Dialog } from './dialog';
import { MarketPanel, won } from './market-panel';

const BoardCanvas = dynamic(() => import('./board-canvas'), { ssr: false, loading: () => <div className="canvas-loading">보드 준비 중…</div> });
const categories = ['전체', ...new Set(CATALOG.map(p => p.category))];

function PedalThumb({ pedal }: { pedal: Pedal }) { return <span className="thumbnail" aria-hidden="true"><img src={pedalImage(pedal)} alt="" draggable={false}/></span>; }

function BoardSize({ board, onChange }: { board: Board; onChange: (width: number, height: number) => void }) {
  const [width, setWidth] = useState(String(board.widthMm)), [height, setHeight] = useState(String(board.heightMm));
  useEffect(() => { setWidth(String(board.widthMm)); setHeight(String(board.heightMm)); }, [board.widthMm, board.heightMm]);
  const preset = `${board.widthMm},${board.heightMm}`;
  return <section className="settings-section"><p className="eyebrow">THE FOUNDATION</p><h2>보드 설정</h2><label className="field-label" htmlFor="board-preset">보드 사이즈</label><select id="board-preset" value={['450,250', '600,320', '800,400'].includes(preset) ? preset : 'custom'} onChange={event => { if (event.target.value !== 'custom') { const [w, h] = event.target.value.split(',').map(Number); onChange(w, h); } else document.getElementById('board-width')?.focus(); }}><option value="450,250">Compact · 450 × 250</option><option value="600,320">Standard · 600 × 320</option><option value="800,400">Large · 800 × 400</option><option value="custom">직접 입력</option></select><form className="size-form" onSubmit={event => { event.preventDefault(); onChange(Number(width), Number(height)); }}><label htmlFor="board-width">가로 <span>mm</span><input id="board-width" type="number" min="150" max="1500" step="0.1" required value={width} onChange={event => setWidth(event.target.value)}/></label><span className="size-cross">×</span><label htmlFor="board-height">세로 <span>mm</span><input id="board-height" type="number" min="150" max="1000" step="0.1" required value={height} onChange={event => setHeight(event.target.value)}/></label><button className="button light full" type="submit">규격 적용</button></form></section>;
}

export default function Editor() {
  const store = useBoard(); const { board, edit, replace, ready, undo, redo } = store;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(''), [category, setCategory] = useState('전체');
  const [grid, setGrid] = useState(true), [snap, setSnap] = useState(true), [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }), [canvasSize, setCanvasSize] = useState({ width: 700, height: 500 });
  const [dragging, setDragging] = useState(false), [dialog, setDialog] = useState<'custom' | 'new' | 'help' | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'pedal' | 'budget'>('pedal'), [budgetMode, setBudgetMode] = useState<'all' | 'purchase'>('purchase');
  const [message, setMessage] = useState(''), [nameDraft, setNameDraft] = useState(board.name);
  const fileInput = useRef<HTMLInputElement>(null), canvasHost = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const currentBoard = useRef(board); currentBoard.current = board;
  const item = board.items.find(i => i.instanceId === selectedId);
  const warning = useMemo(() => placementWarnings(board), [board]);
  const pedals = useMemo(() => searchCatalog(query, category), [query, category]);
  const totals = useMemo(() => budget(board, budgetMode), [board, budgetMode]);
  const notify = useCallback((text: string) => setMessage(text), []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 4500); return () => clearTimeout(timer); }, [message]);
  useEffect(() => setNameDraft(board.name), [board.name]);
  const fit = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const select = useCallback((id: string | null) => { setSelectedId(id); if (id) setInspectorTab('pedal'); }, []);
  const move = useCallback((id: string, point: Point) => edit(b => updateItem(b, id, point)), [edit]);
  const add = useCallback((pedal: Pedal, point?: Point) => {
    if (currentBoard.current.items.length >= MAX_PEDALS) { notify(`최대 ${MAX_PEDALS}개까지 배치할 수 있어요.`); return; }
    const instanceId = crypto.randomUUID();
    edit(b => addItem(b, pedal, instanceId, point, snap)); select(instanceId); notify(`${pedal.name} 페달을 추가했어요.`);
  }, [edit, snap, select, notify]);
  const action = useCallback((kind: 'rotate' | 'duplicate' | 'remove') => {
    const found = currentBoard.current.items.find(i => i.instanceId === selectedId); if (!found) return;
    if (kind === 'duplicate') {
      if (currentBoard.current.items.length >= MAX_PEDALS) { notify(`최대 ${MAX_PEDALS}개까지 배치할 수 있어요.`); return; }
      const id = crypto.randomUUID();
      edit(b => { const next = addItem(b, found.pedal, id); return updateItem(next, id, { manualPriceKrw: found.manualPriceKrw }); });
      select(id); return;
    }
    if (kind === 'remove') { edit(b => ({ ...b, items: b.items.filter(i => i.instanceId !== found.instanceId) })); setSelectedId(null); }
    else edit(b => updateItem(b, found.instanceId, { rotationDeg: ((found.rotationDeg + 90) % 360) as BoardItem['rotationDeg'] }));
  }, [selectedId, edit, select, notify]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!ready || dragging || dialog || (event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (event.key === '/') { event.preventDefault(); searchInput.current?.focus(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? redo : undo)(); return; }
      if (event.key === 'Escape') { setSelectedId(null); return; }
      if (!selectedId || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === 'r') { event.preventDefault(); action('rotate'); }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); action('remove'); }
      const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
      if (delta) { event.preventDefault(); const step = event.shiftKey ? 5 : 1; edit(b => { const found = b.items.find(i => i.instanceId === selectedId); return found ? updateItem(b, selectedId, { xMm: found.xMm + delta[0] * step, yMm: found.yMm + delta[1] * step }) : b; }); }
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, [action, dialog, dragging, edit, ready, redo, selectedId, undo]);

  function exportBoard() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${board.name.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'pedalboard'}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('보드를 파일로 내보냈어요.');
  }
  async function importBoard(file: File | undefined) {
    if (!file) return;
    try { if (file.size > MAX_FILE_BYTES) throw new Error('256KB 이하의 파일을 선택해 주세요.'); const next = parseBoardFile(await file.text()); replace(next); setSelectedId(null); fit(); notify('보드를 불러왔어요. 되돌리기로 이전 배치를 복구할 수 있어요.'); }
    catch (error) { notify((error as Error).message); }
  }
  const saveText = !ready ? '저장본 확인 중' : store.storageProblem ? '자동 저장 중단' : store.dirty ? '저장 중…' : '자동 저장됨';

  return <>
    <header className="app-header"><a className="brand" href="/" aria-label="PedalBook 홈"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>pedalbook<span className="brand-dot">.</span></a><div className="header-center"><span className="live-dot"/>나만의 사운드, 나만의 보드</div><div className="header-actions"><span className="prototype-tag">BUILD · FIND · PLAN</span><button className="icon-button" aria-label="사용 방법" onClick={() => setDialog('help')}>?</button></div></header>
    <div className="project-bar"><div className="project-title"><span className="project-icon" aria-hidden="true">▦</span><div><p className="eyebrow">YOUR WORKSPACE</p><input aria-label="보드 이름" maxLength={60} value={nameDraft} disabled={!ready} onChange={event => setNameDraft(event.target.value)} onBlur={() => { const name = nameDraft.trim() || 'Untitled board'; edit(b => ({ ...b, name })); setNameDraft(name); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/></div><span className={`saved-state ${store.storageProblem ? 'error' : ''}`} role="status">{saveText}</span></div><div className="project-actions"><button className="button light" disabled={!ready} onClick={() => setDialog('new')}>＋ 새 보드</button><button className="button light" disabled={!ready} onClick={() => fileInput.current?.click()}>↥ 불러오기</button><button className="button primary" disabled={!ready} onClick={exportBoard}>↧ 보드 내보내기</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={event => { void importBoard(event.target.files?.[0]); event.target.value = ''; }}/></div></div>
    {store.storageProblem && <div className="storage-banner" role="alert"><span>{store.storageProblem}</span><button onClick={exportBoard}>현재 보드 내보내기</button><button onClick={() => { store.restore(); setSelectedId(null); fit(); }}>저장본 불러오기</button></div>}
    {store.migrationNotice && <div className="migration-banner">이전 프로토타입의 배치를 가져왔어요. 이전 저장 데이터도 그대로 보관됩니다.</div>}
    <main className="workspace">
      <aside className="library panel" aria-label="페달 라이브러리"><div className="panel-heading"><p className="eyebrow">BUILD YOUR SOUND</p><h1>페달 라이브러리<span>{CATALOG.length}</span></h1></div><label className="search-field"><span aria-hidden="true">⌕</span><input ref={searchInput} type="search" aria-label="페달 검색" placeholder="브랜드, 모델 검색" value={query} onChange={event => setQuery(event.target.value)}/><kbd>/</kbd></label><div className="filters" aria-label="카테고리 필터">{categories.map(c => <button key={c} className={`filter ${c === category ? 'active' : ''}`} aria-pressed={c === category} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="library-subtitle"><span>{pedals.length} PEDALS</span><span>클릭 또는 드래그로 추가</span></div><div className="catalog">{pedals.map(p => <button key={p.id} className="pedal-card" disabled={!ready} draggable={ready} onDragStart={event => { event.dataTransfer.setData('application/x-pedalbook', p.id); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => add(p)} aria-label={`${p.brand} ${p.name} 보드에 추가`}><PedalThumb pedal={p}/><span className="card-copy"><span className="card-brand">{p.brand}</span><strong>{p.name}</strong><span className="card-category">{p.category} · {p.widthMm} × {p.heightMm}</span></span><span className="card-add" aria-hidden="true">＋</span></button>)}{!pedals.length && <p className="empty-results">검색 결과가 없어요.<br/>내 페달을 직접 추가해 보세요.</p>}</div><button className="custom-button" disabled={!ready} onClick={() => setDialog('custom')}><span>＋</span><span>내 페달 직접 만들기<small>이름과 규격만 있으면 충분해요</small></span><span>↗</span></button><p className="library-note">제조사 규격을 참고한 샘플 5종<br/>그래픽은 배치 확인용 일러스트입니다.</p></aside>
      <section className="editor" aria-label="페달보드 편집기"><div className="editor-toolbar"><div className="editor-label"><span className="live-dot"/>BOARD EDITOR</div><div className="toolbar-actions"><button className="icon-button" aria-label="되돌리기" disabled={!store.canUndo} onClick={undo}>↶</button><button className="icon-button" aria-label="다시 실행" disabled={!store.canRedo} onClick={redo}>↷</button><span className="toolbar-divider"/><button className={`toggle-button ${grid ? 'active' : ''}`} aria-pressed={grid} onClick={() => setGrid(!grid)}>▦ <span>그리드</span></button><button className={`toggle-button ${snap ? 'active' : ''}`} aria-pressed={snap} onClick={() => setSnap(!snap)}>⌗ <span>5mm 스냅</span></button></div></div>
        <div className="canvas-viewport" ref={canvasHost} id="board-canvas" tabIndex={0} role="group" aria-label="보드 편집 캔버스" aria-describedby="canvas-instructions" onPointerDown={() => canvasHost.current?.focus({ preventScroll: true })} onDragOver={event => { if ([...event.dataTransfer.types].includes('application/x-pedalbook')) event.preventDefault(); }} onDrop={event => { const p = CATALOG.find(p => p.id === event.dataTransfer.getData('application/x-pedalbook')); if (!p || !ready) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); add(p, screenToMm({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewportTransform(board, canvasSize.width, canvasSize.height, zoom, pan))); }}>
          <div className="canvas-caption"><span>TOP VIEW</span><span>{board.widthMm} × {board.heightMm} MM</span></div>
          {ready ? <BoardCanvas board={board} selectedId={selectedId} zoom={zoom} pan={pan} grid={grid} snap={snap} onSelect={select} onMove={move} onPan={setPan} onSize={setCanvasSize} onDragging={setDragging}/> : <div className="canvas-loading">저장된 보드를 확인하고 있어요…</div>}
          {!board.items.length && ready && <div className="empty-board"><strong>첫 페달의 자리를 정해볼까요?</strong><p>라이브러리에서 페달을 선택해 주세요.</p></div>}
          <div className="canvas-bottom"><span><span className="orange-dot"/>실제 규격 비율로 배치</span><div className="zoom-control"><button aria-label="축소" disabled={zoom <= .5} onClick={() => setZoom(z => Math.max(.5, z - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2, z + .25))}>＋</button><span className="zoom-divider"/><button aria-label="보드 전체 보기" onClick={fit}>⛶</button></div></div>
        </div><div className="board-status"><span>{board.items.length}개 페달 배치됨</span><span className="placement-warning">{[warning.pairs ? `겹침 ${warning.pairs}곳` : '', warning.outside ? `보드 밖 ${warning.outside}개` : ''].filter(Boolean).join(' · ')}</span><span className="status-help" id="canvas-instructions"><kbd>R</kbd> 회전 · <kbd>Del</kbd> 삭제 · 방향키 이동</span></div>
        <div className="budget-strip"><div><p className="eyebrow">PLAN YOUR NEXT SOUND</p><strong>{totals.count === 0 ? '구매할 페달이 없어요' : `${totals.known}/${totals.count}개 가격 확인`}</strong><span>{totals.missing ? ` · ${totals.missing}개 가격 미상` : ''}</span></div><button onClick={() => setInspectorTab('budget')}>{won(totals.total)} <span>예산 보기 ↗</span></button></div>
        <div className="placed-list"><div className="placed-heading"><h2>내 보드의 페달</h2><span>목록에서 선택해 키보드로도 이동할 수 있어요</span></div><div className="placed-items">{board.items.map((p, index) => <button key={p.instanceId} aria-label={`${index + 1}번 ${p.pedal.brand} ${p.pedal.name} 선택`} aria-pressed={selectedId === p.instanceId} className={selectedId === p.instanceId ? 'selected' : ''} onClick={() => { select(p.instanceId); canvasHost.current?.focus({ preventScroll: true }); }}><i style={{ backgroundColor: p.pedal.color }}/><span>{p.pedal.name}</span><small>{p.owned ? '보유' : `${index + 1}`}</small></button>)}</div></div>
      </section>
      <aside className="inspector panel" aria-label="보드와 예산 설정"><BoardSize board={board} onChange={(w, h) => { try { const next = resizeBoard(board, w, h); replace(next); fit(); } catch (error) { notify((error as Error).message); } }}/><div className="inspector-tabs" role="tablist" aria-label="상세 정보"><button role="tab" id="pedal-tab" aria-controls="pedal-panel" aria-selected={inspectorTab === 'pedal'} onClick={() => setInspectorTab('pedal')}>선택한 페달</button><button role="tab" id="budget-tab" aria-controls="budget-panel" aria-selected={inspectorTab === 'budget'} onClick={() => setInspectorTab('budget')}>보드 예산</button></div>
        {inspectorTab === 'pedal' ? <section className="settings-section selection-section" role="tabpanel" id="pedal-panel" aria-labelledby="pedal-tab">{item ? <><div className="selected-preview"><PedalThumb pedal={item.pedal}/><span className="card-copy"><span className="card-brand">{item.pedal.brand}</span><strong>{item.pedal.name}</strong><span className="card-category">{item.pedal.subtitle}</span></span></div><div className="selected-dimensions"><span>가로 × 세로</span><strong>{item.pedal.widthMm} × {item.pedal.heightMm} mm</strong></div><div className="selected-controls"><button className="button light" onClick={() => action('rotate')}>↻ 90° 회전</button><button className="button light" onClick={() => action('duplicate')}>⧉ 복제</button><button className="button light full delete-button" onClick={() => action('remove')}>선택한 페달 삭제</button></div><div className="pedal-position"><span>X {item.xMm}</span><span>Y {item.yMm}</span><span>{item.rotationDeg}°</span></div>{item.pedal.sourceUrl && <a className="source-link" href={item.pedal.sourceUrl} target="_blank" rel="noopener noreferrer">제조사 규격 참고 ↗</a>}<MarketPanel item={item} onPrice={price => edit(b => updateItem(b, item.instanceId, { manualPriceKrw: price }))} onOwned={owned => edit(b => updateItem(b, item.instanceId, { owned }))} notify={notify}/></> : <div className="selection-empty"><span>⌖</span>보드나 목록에서 페달을 선택하면<br/>규격·매물 찾기·단가를 확인할 수 있어요.</div>}</section> : <section className="settings-section budget-section" role="tabpanel" id="budget-panel" aria-labelledby="budget-tab"><div className="budget-mode"><button aria-pressed={budgetMode === 'purchase'} onClick={() => setBudgetMode('purchase')}>추가 구매</button><button aria-pressed={budgetMode === 'all'} onClick={() => setBudgetMode('all')}>전체 배치</button></div><p className="eyebrow">{budgetMode === 'purchase' ? 'TO COMPLETE YOUR BOARD' : 'YOUR WHOLE BOARD'}</p><strong className="budget-total">{won(totals.total)}</strong><p className="budget-caption">{totals.count === 0 ? '추가 구매할 페달이 없어요.' : `${totals.known}/${totals.count}개 확인된 금액의 합계`}</p>{totals.missing > 0 && <p className="budget-missing">{totals.missing}개 가격 미상 · 합계에 포함되지 않았어요.</p>}<div className="budget-rows">{totals.rows.map((row, index) => <button key={row.item.instanceId} onClick={() => select(row.item.instanceId)}><span><small>{String(index + 1).padStart(2, '0')} / {row.item.pedal.brand}</small><strong>{row.item.pedal.name}</strong></span><span><strong>{row.priceKrw === null ? '가격 미상' : won(row.priceKrw)}</strong><small>{row.basis === 'manual' ? '직접 입력' : row.basis === 'market' ? '매물 호가' : '단가 입력하기 ↗'}</small></span></button>)}</div><p className="budget-footnote">보유 페달 {totals.owned}개 · 직접 입력 {totals.manual}개<br/>보드·전원·케이블·배송비는 포함하지 않습니다.<br/>표시 금액은 구매를 보장하는 가격이 아닙니다.</p></section>}
        <div className="local-note"><span className="live-dot"/>이 브라우저에 저장 · 파일 백업 지원</div>
      </aside>
    </main>
    <div className={`toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">{message}</div>
    <Dialog open={dialog === 'custom'} title="내 페달 추가" onClose={() => setDialog(null)}><p className="dialog-description">이름과 직접 잰 규격으로 나만의 페달을 추가하세요.</p><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget), name = String(data.get('name')).trim(); if (!name) return; const id = `custom-${crypto.randomUUID()}`; const pedal: Pedal = { id, brand: 'CUSTOM', name, subtitle: '나의 커스텀 페달', category: '커스텀', widthMm: Number(data.get('width')), heightMm: Number(data.get('height')), color: String(data.get('color')), ink: '#302c35', style: 'custom', sourceUrl: null }; try { parseBoard(addItem(emptyBoard(), pedal, 'validation')); add(pedal); setDialog(null); } catch (error) { notify((error as Error).message); } }}><label className="field-label">페달 이름<input name="name" required maxLength={40} placeholder="예: My Overdrive"/></label><div className="dialog-fields"><label className="field-label">가로 (mm)<input name="width" type="number" min={20} max={400} step={.1} defaultValue={70} required/></label><label className="field-label">세로 (mm)<input name="height" type="number" min={20} max={500} step={.1} defaultValue={120} required/></label><label className="field-label">색상<input name="color" type="color" defaultValue="#aa95ca"/></label></div><button className="button primary full" type="submit">보드에 추가하기 ＋</button></form></Dialog>
    <Dialog open={dialog === 'new'} title="새 보드를 만들까요?" onClose={() => setDialog(null)}><p className="dialog-description">현재 배치를 비운 새 보드를 엽니다. 현재 보드는 파일로 내보내 보관할 수 있고, 새로고침 전까지 되돌리기로 복구할 수 있어요.</p><div className="dialog-actions"><button className="button light" onClick={exportBoard}>현재 보드 내보내기</button><button className="button primary" onClick={() => { replace(emptyBoard()); setSelectedId(null); fit(); setDialog(null); }}>빈 보드 만들기</button></div></Dialog>
    <Dialog open={dialog === 'help'} title="내 사운드의 자리 만들기" onClose={() => setDialog(null)}><ol className="help-list"><li>페달을 클릭하거나 보드로 드래그해 추가하세요.</li><li>페달 선택 후 <kbd>R</kbd>로 90° 회전, <kbd>Delete</kbd>로 삭제해요.</li><li>방향키로 1mm, Shift + 방향키로 5mm 움직여요. 확대 상태에서는 보드 배경을 끌어 이동해요.</li><li>뮬 검색어를 복사하고 장터에서 원하는 매물을 찾아보세요.</li><li>예상 단가와 보유 여부를 입력하면 추가 구매 예산을 확인할 수 있어요.</li><li>배치는 이 브라우저에 저장돼요. 다른 기기에서는 내보낸 파일을 불러오세요.</li></ol><p className="help-note">일러스트는 실제 제품 사진이 아닙니다. 케이블·잭 공간은 별도로 확인해 주세요. 자동 시세 수집과 계정 저장은 아직 연결하지 않았습니다.</p></Dialog>
  </>;
}
