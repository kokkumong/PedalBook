'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoard } from '../hooks/use-board';
import { addItem, removeItem, emptyBoard, freePosition, MAX_FILE_BYTES, MAX_PEDALS, parseBoard, parseBoardFile, placementWarnings, createCustomBoard, selectBoardModel, boardModel, screenToMm, updateItem, viewportTransform } from '../domain/board.ts';
import type { Board, BoardItem, Point } from '../domain/board.ts';
import { CATALOG } from '../domain/catalog.ts';
import type { Pedal } from '../domain/catalog.ts';
import { boardRockboard, pedalCrossesStep, undersideWarnings } from '../domain/board-3d.ts';
import type { Board3DHandle } from './board-canvas-3d';
import { pedalPhoto } from '../domain/photos.ts';
import { addManualCable, moveCableEndpoint, removeManualCable, MAX_CABLES } from '../domain/manual-cables.ts';
import { SignalPanel } from './signal-panel';
import { MountControls } from './mount-controls';
import { RockboardInfo } from './rockboard-info';
import { CatalogLibrary } from './catalog-library';
import { PedalThumb } from './pedal-thumbnail';
import { budget } from '../domain/market.ts';
import { Dialog } from './dialog';
import { ItemBudgetEditor, MarketPanel, won } from './market-panel';

const BoardCanvas = dynamic(() => import('./board-canvas'), { ssr: false, loading: () => <div className="canvas-loading">보드 준비 중…</div> });

const BoardCanvas3D = dynamic(() => import('./board-canvas-3d'), { ssr: false, loading: () => <div className="canvas-loading">3D 보드 준비 중…</div> });

export default function Editor() {
  const store = useBoard(); const { board, edit, replace, ready, undo, redo } = store;
  const [libraryOpen, setLibraryOpen] = useState(false), [inspectorOpen, setInspectorOpen] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const [placingCable,setPlacingCable]=useState(false),[cableStart,setCableStart]=useState<Point|null>(null);
  const [selectedCableId,setSelectedCableId]=useState<string|null>(null);
  const cancelCable=useCallback(()=>{setPlacingCable(false);setCableStart(null);},[]);
  const [surfaceView, setSurfaceView] = useState<'top' | 'bottom'>('top');
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [mountView, setMountView] = useState<{ side: 'top' | 'bottom'; sequence: number } | null>(null);
  const [zoom3D, setZoom3D] = useState(1), [fitRequest, setFitRequest] = useState(0);
  const scene3D = useRef<Board3DHandle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grid, setGrid] = useState(true), [snap, setSnap] = useState(true), [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }), [canvasSize, setCanvasSize] = useState({ width: 700, height: 500 });
  const [dragging, setDragging] = useState(false), [dialog, setDialog] = useState<'custom' | 'custom-board' | 'board-info' | 'new' | 'help' | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'pedal' | 'budget'>('pedal'), [budgetMode, setBudgetMode] = useState<'all' | 'purchase'>('purchase');
  const [message, setMessage] = useState(''), [nameDraft, setNameDraft] = useState(board.name);
  const fileInput = useRef<HTMLInputElement>(null), canvasHost = useRef<HTMLDivElement>(null);
  const currentBoard = useRef(board); currentBoard.current = board;
  const item = board.items.find(i => i.instanceId === selectedId);
  const warning = useMemo(() => placementWarnings(board), [board]);
  const underWarningCount = board.items.filter(i=>undersideWarnings(i,board).length).length;
  const totals = useMemo(() => budget(board, budgetMode), [board, budgetMode]);
  const notify = useCallback((text: string) => setMessage(text), []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 4500); return () => clearTimeout(timer); }, [message]);
  useEffect(() => setNameDraft(board.name), [board.name]);
  const fit = useCallback(() => { setZoom(1); setZoom3D(1); setPan({ x: 0, y: 0 }); setFitRequest(n => n + 1); }, []);
  const activeZoom = viewMode === '3d' ? zoom3D : zoom;
  const changeZoom = (delta: number) => {
    const setter = viewMode === '3d' ? setZoom3D : setZoom;
    setter(z => Math.min(2, Math.max(.5, z + delta)));
  };
  const returnTo2D = useCallback(() => { setViewMode('2d'); setDragging(false); }, []);
  const select = useCallback((id: string | null) => { setSelectedId(id); setSelectedCableId(null); if (id) { setSignalOpen(false); setInspectorTab('pedal'); setInspectorOpen(true); setLibraryOpen(false); } }, []);
  const showSurface = (side: 'top' | 'bottom') => { cancelCable(); setSurfaceView(side); setMountView(previous=>({side,sequence:(previous?.sequence ?? 0)+1})); };
  useEffect(()=>{ if (libraryOpen) document.getElementById('catalog-search')?.focus(); },[libraryOpen]);
  const move = useCallback((id: string, point: Point) => edit(b => updateItem(b, id, point)), [edit]);
  const add = useCallback((pedal: Pedal, point?: Point) => {
    if (currentBoard.current.items.length >= MAX_PEDALS) { notify(`최대 ${MAX_PEDALS}개까지 배치할 수 있어요.`); return; }
    const instanceId = crypto.randomUUID();
    edit(b => addItem(b, pedal, instanceId, point, snap)); select(instanceId); setInspectorOpen(false); notify(`${pedal.name} 페달을 추가했어요.`);
    setSurfaceView('top'); setMountView(previous=>({side:'top',sequence:(previous?.sequence ?? 0)+1}));
  }, [edit, snap, select, notify]);
  const selectCable=useCallback((id:string)=>{setSelectedCableId(id);setSelectedId(null);setInspectorOpen(false);},[]);
  const moveCable=useCallback((id:string,end:'start'|'end',point:Point)=>edit(b=>moveCableEndpoint(b,id,end,point)),[edit]);
  const removeCable=useCallback((id:string)=>{edit(b=>removeManualCable(b,id));setSelectedCableId(null);},[edit]);
  const placeCablePoint=(point:Point)=>{
    if(!cableStart){setCableStart(point);return;}
    if(Math.hypot(point.xMm-cableStart.xMm,point.yMm-cableStart.yMm)<1){notify('시작점과 조금 떨어진 곳에 끝점을 놓아 주세요.');return;}
    const id=crypto.randomUUID();edit(b=>addManualCable(b,id,cableStart,point,surfaceView));selectCable(id);cancelCable();notify('케이블을 연결했어요. 양 끝을 끌어 위치를 바꿀 수 있어요.');
  };
  const startCable=()=>{if((board.cableLayout?.cables.length??0)>=MAX_CABLES)return;setViewMode('2d');setSelectedId(null);setSelectedCableId(null);setSignalOpen(false);setInspectorOpen(false);setLibraryOpen(false);setCableStart(null);setPlacingCable(true);};
  const action = useCallback((kind: 'rotate' | 'duplicate' | 'remove') => {
    const found = currentBoard.current.items.find(i => i.instanceId === selectedId); if (!found) return;
    if (kind === 'duplicate') {
      if (currentBoard.current.items.length >= MAX_PEDALS) { notify(`최대 ${MAX_PEDALS}개까지 배치할 수 있어요.`); return; }
      const id = crypto.randomUUID();
      edit(b => { const copy = { ...found, instanceId: id }; return { ...b, items: [...b.items, { ...copy, ...freePosition(copy, b) }] }; });
      select(id); return;
    }
    if (kind === 'remove') { edit(b => removeItem(b, found.instanceId)); setSelectedId(null); }
    else edit(b => updateItem(b, found.instanceId, { rotationDeg: ((found.rotationDeg + 90) % 360) as BoardItem['rotationDeg'] }));
  }, [selectedId, edit, select, notify]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && placingCable) {cancelCable();event.preventDefault();return;}
      if (event.key === 'Escape' && !dialog && !dragging) {setSelectedCableId(null); setSignalOpen(false); setLibraryOpen(false); setInspectorOpen(false); setSelectedId(null); canvasHost.current?.focus({preventScroll:true}); return; }
      if (!ready || dragging || dialog || (event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (event.key === '/') { event.preventDefault(); cancelCable(); setSignalOpen(false); setLibraryOpen(true); setInspectorOpen(false); document.getElementById('catalog-search')?.focus(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? redo : undo)(); return; }

      if(selectedCableId && (event.key==='Delete'||event.key==='Backspace')) {event.preventDefault();removeCable(selectedCableId);return;}
      if (placingCable) return;
      if (!selectedId || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === 'r') { event.preventDefault(); action('rotate'); }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); action('remove'); }
      const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
      if (delta) { event.preventDefault(); const step = event.shiftKey ? 5 : 1; edit(b => { const found = b.items.find(i => i.instanceId === selectedId); return found ? updateItem(b, selectedId, { xMm: found.xMm + delta[0] * step, yMm: found.yMm + delta[1] * step }) : b; }); }
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, [action, dialog, dragging, edit, ready, redo, selectedId, undo, placingCable, cancelCable, selectedCableId, removeCable]);

  function exportBoard() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${board.name.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'pedalboard'}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('보드를 파일로 내보냈어요.');
  }
  async function importBoard(file: File | undefined) {
    if (!file) return;
    try { if (file.size > MAX_FILE_BYTES) throw new Error('256KB 이하의 파일을 선택해 주세요.'); const next = parseBoardFile(await file.text()); replace(next); cancelCable(); setSelectedCableId(null); setSelectedId(null); fit(); notify('보드를 불러왔어요. 되돌리기로 이전 배치를 복구할 수 있어요.'); }
    catch (error) { notify((error as Error).message); }
  }
  const saveText = !ready ? '저장본 확인 중' : store.storageProblem ? '자동 저장 중단' : store.dirty ? '저장 중…' : '자동 저장됨';

  return <div className="studio-shell">
    <header className="studio-header"><a className="brand" href="/" aria-label="PedalBook 홈"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>pedalbook<span className="brand-dot">.</span></a><div className="studio-project"><input aria-label="보드 이름" maxLength={60} value={nameDraft} disabled={!ready} onChange={event => setNameDraft(event.target.value)} onBlur={() => { const name = nameDraft.trim() || 'Untitled board'; edit(b => ({ ...b, name })); setNameDraft(name); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/><span className={`saved-state ${store.storageProblem ? 'error' : ''}`} role="status">{saveText}</span></div><div className="project-actions"><button className="button light" disabled={!ready} onClick={() => {cancelCable();setDialog('new');}}>＋ 새 보드</button><button className="button light" disabled={!ready} onClick={() => fileInput.current?.click()}>↥ 불러오기</button><button className="button primary" disabled={!ready} onClick={exportBoard}>↧ 보드 내보내기</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={event => { void importBoard(event.target.files?.[0]); event.target.value = ''; }}/></div><button className="icon-button" aria-label="사용 방법" onClick={()=>setDialog('help')}>?</button></header>
    {store.storageProblem && <div className="storage-banner" role="alert"><span>{store.storageProblem}</span><button onClick={exportBoard}>현재 보드 내보내기</button><button onClick={() => { store.restore(); cancelCable();setSelectedCableId(null);setSelectedId(null); fit(); }}>저장본 불러오기</button></div>}
    {store.migrationNotice && <div className="migration-banner">이전 프로토타입의 배치를 가져왔어요. 이전 저장 데이터도 그대로 보관됩니다.</div>}
    <main className={`workspace studio-workspace ${libraryOpen ? 'library-open' : ''} ${inspectorOpen ? 'inspector-open' : ''}`}>
      <div className="library-drawer" id="gear-library" hidden={!libraryOpen}><CatalogLibrary onClose={()=>{setLibraryOpen(false);document.getElementById('add-gear')?.focus();}} onCustomBoard={()=>setDialog('custom-board')} ready={ready} currentModelId={boardModel(board)?.id} onAdd={pedal=>{add(pedal);setLibraryOpen(true);}} onCustom={() => setDialog('custom')} onBoard={model => { try { replace(selectBoardModel(board, model.id)); setLibraryOpen(false); fit(); notify(`${model.brand} ${model.name} 보드를 적용했어요. 기존 페달 위치는 유지됩니다.`); } catch (error) { notify((error as Error).message); } }}/></div>

      <section className="editor" aria-label="페달보드 편집기"><div className="editor-toolbar"><button id="add-gear" className="add-gear" aria-expanded={libraryOpen} aria-controls="gear-library" onClick={()=>{cancelCable();setSignalOpen(false);setLibraryOpen(value=>!value);setInspectorOpen(false);}}>＋ 기어 추가</button><div className="toolbar-actions"><div className="surface-switch" role="group" aria-label="편집할 면"><button aria-pressed={surfaceView === 'top'} disabled={dragging} onClick={()=>showSurface('top')}>상판 보기</button><button aria-pressed={surfaceView === 'bottom'} disabled={dragging} onClick={()=>showSurface('bottom')}>하부 보기 <span>{board.items.filter(i=>i.mountSide === 'bottom').length}</span></button></div><button className={`view-toggle ${viewMode === '3d' ? 'active' : ''}`} aria-label={viewMode === '3d' ? '2D로 전환' : '3D로 전환'} aria-pressed={viewMode === '3d'} disabled={!ready || dragging} onClick={() => { setViewMode(mode => mode === '2d' ? '3d' : '2d'); setZoom3D(1); showSurface(surfaceView); }}>◇ {viewMode === '3d' ? '2D로 보기' : '3D로 보기'}</button><button className="icon-button" aria-label="되돌리기" disabled={!store.canUndo || dragging} onClick={undo}>↶</button><button className="icon-button" aria-label="다시 실행" disabled={!store.canRedo || dragging} onClick={redo}>↷</button><span className="toolbar-divider"/><button className={`toggle-button ${grid ? 'active' : ''}`} aria-pressed={grid} onClick={() => setGrid(!grid)}>▦ <span>그리드</span></button><button className={`toggle-button ${snap ? 'active' : ''}`} aria-pressed={snap} onClick={() => setSnap(!snap)}>⌗ <span>5mm 스냅</span></button><button className="toggle-button" aria-expanded={signalOpen} onClick={()=>{cancelCable();setSignalOpen(value=>!value);setLibraryOpen(false);setInspectorOpen(false);}}>패치 케이블</button><button className="toggle-button" onClick={()=>setDialog('board-info')}>보드 정보</button><button className="toggle-button" aria-expanded={inspectorOpen && inspectorTab === 'budget'} onClick={()=>{cancelCable();setSignalOpen(false);setInspectorTab('budget');setInspectorOpen(true);setLibraryOpen(false);}}>예산</button></div></div>
        <div className="canvas-viewport" ref={canvasHost} id="board-canvas" tabIndex={0} role="group" aria-label="보드 편집 캔버스" aria-describedby="canvas-instructions" onPointerDown={() => canvasHost.current?.focus({ preventScroll: true })} onDragOver={event => { if ([...event.dataTransfer.types].includes('application/x-pedalbook')) event.preventDefault(); }} onDrop={event => { const p = CATALOG.find(p => p.id === event.dataTransfer.getData('application/x-pedalbook')); if (!p || !ready) return; event.preventDefault(); if (viewMode === '3d') { const point = scene3D.current?.project(event.clientX, event.clientY); if (point) add(p, point); return; } const rect = event.currentTarget.getBoundingClientRect(); add(p, screenToMm({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewportTransform(board, canvasSize.width, canvasSize.height, zoom, pan))); }}>
          <div className="canvas-caption"><span>{viewMode === '3d' ? (surfaceView === 'bottom' ? '3D · UNDERSIDE' : '3D · TOP') : (surfaceView === 'bottom' ? 'UNDERSIDE PLAN' : 'TOP VIEW')}</span><span>{board.widthMm} × {board.heightMm} MM</span></div>
          {ready ? viewMode === '3d' ? <BoardCanvas3D onViewSide={setSurfaceView} viewRequest={mountView} board={board} selectedId={selectedId} zoom={zoom3D} fitRequest={fitRequest} grid={grid} snap={snap} apiRef={scene3D} onSelect={select} onMove={move} onDragging={setDragging} onZoom={setZoom3D} onReturnTo2D={returnTo2D}/> : <BoardCanvas placingCable={placingCable} cableStart={cableStart} selectedCableId={selectedCableId} onCablePoint={placeCablePoint} onCableSelect={selectCable} onCableEndpoint={moveCable} side={surfaceView} board={board} selectedId={selectedId} zoom={zoom} pan={pan} grid={grid} snap={snap} onSelect={select} onMove={move} onPan={setPan} onSize={setCanvasSize} onDragging={setDragging}/> : <div className="canvas-loading">저장된 보드를 확인하고 있어요…</div>}
          {placingCable && <div className="cable-placement" role="status"><span>{cableStart?'끝점을 클릭하세요':'시작점을 클릭하세요'}</span><small>시작 → 끝 · Esc 취소</small><button onClick={cancelCable}>취소</button></div>}
          {!placingCable && !board.cableLayout?.cables.some(c=>c.side===surfaceView) && !board.items.some(i=>(i.mountSide ?? 'top') === surfaceView) && ready && <div className="empty-board"><strong>{surfaceView === 'bottom' ? '하부에 배치된 장비가 없어요' : '첫 페달의 자리를 정해볼까요?'}</strong><p>{surfaceView === 'bottom' ? '아래 목록에서 장비 선택 → 장착 위치 → 보드 아래' : '기어 추가 버튼으로 라이브러리를 열어 주세요.'}</p></div>}
          <div className="canvas-bottom"><span><span className="orange-dot"/>{viewMode === '3d' ? (boardRockboard(board) ? 'RockBoard 도면 기반 · 미상 페달 높이 40mm' : '높이 미상 페달 40mm · 보드 두께 예시') : '실제 규격 비율로 배치'}</span><div className="zoom-control"><button aria-label="축소" disabled={activeZoom <= .501 || dragging} onClick={() => changeZoom(-.25)}>−</button><span>{Math.round(activeZoom * 100)}%</span><button aria-label="확대" disabled={activeZoom >= 1.999 || dragging} onClick={() => changeZoom(.25)}>＋</button><span className="zoom-divider"/><button aria-label="보드 전체 보기" disabled={dragging} onClick={fit}>⛶</button></div></div>
        </div><div className="board-status"><span>{board.items.length}개 페달 배치됨</span><span className="placement-warning">{[warning.pairs ? `겹침 ${warning.pairs}곳` : '', warning.outside ? `보드 밖 ${warning.outside}개` : '', underWarningCount ? `하부 확인 ${underWarningCount}개` : ''].filter(Boolean).join(' · ')}</span><span className="status-help" id="canvas-instructions"><kbd>R</kbd> 회전 · <kbd>Del</kbd> 삭제 · 방향키 이동</span></div>
        <div className="placed-list"><div className="placed-heading"><h2>내 보드의 페달</h2><span>목록에서 선택해 키보드로도 이동할 수 있어요</span></div><div className="placed-items">{board.items.map((p, index) => <button key={p.instanceId} aria-label={`${index + 1}번 ${p.pedal.brand} ${p.pedal.name} 선택`} aria-pressed={selectedId === p.instanceId} className={selectedId === p.instanceId ? 'selected' : ''} onClick={() => { select(p.instanceId); showSurface(p.mountSide ?? 'top'); canvasHost.current?.focus({ preventScroll: true }); }}><i style={{ backgroundColor: p.pedal.color }}/><span>{p.pedal.name}{p.mountSide === 'bottom' && <em className="under-badge">하부</em>}</span><small>{p.owned ? '보유' : `${index + 1}`}</small></button>)}</div></div>
      </section>
      <aside className={`inspector panel ${inspectorTab === 'pedal' ? 'pedal-menu' : 'budget-drawer'}`} hidden={!inspectorOpen || (inspectorTab === 'pedal' && !item)} aria-label={inspectorTab === 'pedal' ? '선택한 페달' : '보드 예산'}>
        <div className="drawer-heading">
          {inspectorTab === 'pedal' && item ? <div className="selected-preview"><PedalThumb pedal={item.pedal}/><span className="card-copy"><span className="card-brand">{item.pedal.brand}</span><strong>{item.pedal.name}</strong></span></div> : <strong>보드 예산</strong>}
          <button className="icon-button" aria-label="상세 패널 닫기" onClick={()=>{setInspectorOpen(false);canvasHost.current?.focus({preventScroll:true});}}>×</button>
        </div>
        {inspectorTab === 'pedal' ? <section className="settings-section selection-section" aria-label="페달 조작">{item && <>
          <div className="selected-controls">
            <button className="button light" onClick={() => action('rotate')} title="90° 회전 (R)">↻ 회전</button>
            <button className="button light" onClick={() => action('duplicate')}>⧉ 복제</button>
            <button className="button light delete-button" onClick={() => action('remove')}>삭제</button>
          </div>
          {pedalCrossesStep(item, board) && <p className="rockboard-caution" role="status">페달이 상단 단차에 걸쳐 있어요. 한쪽 상판 안으로 이동해 주세요.</p>}
          <MountControls item={item} board={board} onSide={side => { edit(b=>updateItem(b,item.instanceId,{mountSide:side})); setViewMode('3d'); showSurface(side); }} onHeight={height=>edit(b=>updateItem(b,item.instanceId,{physicalHeightMm:height}))}>
            <div className="selected-dimensions"><span>가로 × 세로</span><strong>{Number(item.pedal.widthMm.toFixed(1))} × {Number(item.pedal.heightMm.toFixed(1))} mm</strong></div>
            <div className="pedal-position"><span>X {item.xMm}</span><span>Y {item.yMm}</span><span>{item.rotationDeg}°</span></div>
            {item.pedal.sourceUrl && <a className="source-link" href={item.pedal.sourceUrl} target="_blank" rel="noopener noreferrer">규격 출처 ↗</a>}
            <p className="photo-credit">{pedalPhoto(item.pedal) ? <a href={pedalPhoto(item.pedal)!.sourceUrl} target="_blank" rel="noopener noreferrer">사진: {pedalPhoto(item.pedal)!.credit} ↗</a> : '배치용 일러스트 · 사용 가능한 제품 사진 준비 중'}</p>
          </MountControls>
          <MarketPanel item={item}/>
        </>}</section> : <section className="settings-section budget-section" aria-label="예산 관리"><div className="budget-mode"><button aria-pressed={budgetMode === 'purchase'} onClick={() => setBudgetMode('purchase')}>추가 구매</button><button aria-pressed={budgetMode === 'all'} onClick={() => setBudgetMode('all')}>전체 배치</button></div><p className="eyebrow">{budgetMode === 'purchase' ? 'TO COMPLETE YOUR BOARD' : 'YOUR WHOLE BOARD'}</p><strong className="budget-total">{won(totals.total)}</strong><p className="budget-caption">{totals.count === 0 ? '추가 구매할 페달이 없어요.' : `${totals.known}/${totals.count}개 확인된 금액의 합계`}</p>{totals.missing > 0 && <p className="budget-missing">{totals.missing}개 가격 미상 · 합계에 포함되지 않았어요.</p>}<div className="budget-rows">{totals.rows.map((row, index) => <details className="budget-item" key={row.item.instanceId}><summary><span><small>{String(index + 1).padStart(2, '0')} / {row.item.pedal.brand}</small><strong>{row.item.pedal.name}</strong></span><span><strong>{row.priceKrw === null ? '가격 미상' : won(row.priceKrw)}</strong><small>{row.basis === 'manual' ? '직접 입력' : row.basis === 'market' ? '매물 호가' : '단가 입력하기'}</small></span></summary><ItemBudgetEditor item={row.item} onPrice={price => edit(b => updateItem(b, row.item.instanceId, { manualPriceKrw: price }))} onOwned={owned => edit(b => updateItem(b, row.item.instanceId, { owned }))} notify={notify}/></details>)}</div><p className="budget-footnote">보유 페달 {totals.owned}개 · 직접 입력 {totals.manual}개<br/>보드·전원·케이블·배송비는 포함하지 않습니다.<br/>표시 금액은 구매를 보장하는 가격이 아닙니다.</p></section>}
        {inspectorTab === 'budget' && <div className="local-note"><span className="live-dot"/>이 브라우저에 저장 · 파일 백업 지원</div>}
      </aside>
      {signalOpen && <SignalPanel board={board} selectedId={selectedCableId} onSelect={id=>{selectCable(id);const cable=board.cableLayout?.cables.find(c=>c.id===id);if(cable)showSurface(cable.side);}} onAdd={startCable} onEdit={()=>{setViewMode('2d');setSignalOpen(false);}} onEndpoint={moveCable} onRemove={removeCable} onChange={cableLayout=>edit(b=>({...b,cableLayout}))} onClose={()=>setSignalOpen(false)}/>}
    </main>
    <div className={`toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">{message}</div>
    <Dialog open={dialog === 'custom-board'} title="내 보드 만들기" onClose={()=>setDialog(null)}><p className="dialog-description">이름과 가로·세로 규격을 입력하세요. 현재 페달 위치와 예산은 유지됩니다.</p><form onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);try {replace(createCustomBoard(board,String(data.get('name')),Number(data.get('width')),Number(data.get('depth'))));fit();setDialog(null);setLibraryOpen(false);notify('내 보드를 만들었어요. 기존 페달 위치는 유지됩니다.');}catch(error){notify((error as Error).message);}}}><label className="field-label">보드 이름<input name="name" required maxLength={60} defaultValue="My custom board"/></label><div className="custom-board-dimensions"><label className="field-label">가로 (mm)<input name="width" type="number" required min={50} max={2540} step={.1} defaultValue={board.widthMm}/></label><label className="field-label">세로 (mm)<input name="depth" type="number" required min={50} max={2540} step={.1} defaultValue={board.heightMm}/></label></div><button className="button primary full" type="submit">내 보드 만들기</button></form></Dialog>
    <Dialog open={dialog === 'board-info'} title="보드 정보" onClose={()=>setDialog(null)}><p>{boardModel(board) ? `${boardModel(board)!.brand} · ${boardModel(board)!.name}` : '내 보드'} · {board.widthMm} × {board.heightMm} mm</p><RockboardInfo board={board} onApply={id=>{replace(selectBoardModel(board,id));fit();}}/><p className="dialog-description">다른 보드는 기어 추가 → 보드에서 선택하거나, 내 보드 만들기로 직접 만들 수 있어요.</p></Dialog>
    <Dialog open={dialog === 'custom'} title="내 페달 추가" onClose={() => setDialog(null)}><p className="dialog-description">이름과 직접 잰 규격으로 나만의 페달을 추가하세요.</p><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget), name = String(data.get('name')).trim(); if (!name) return; const id = `custom-${crypto.randomUUID()}`; const pedal: Pedal = { id, brand: 'CUSTOM', name, subtitle: '나의 커스텀 페달', category: '커스텀', widthMm: Number(data.get('width')), heightMm: Number(data.get('height')), color: String(data.get('color')), ink: '#302c35', style: 'custom', sourceUrl: null }; try { parseBoard(addItem(emptyBoard(), pedal, 'validation')); add(pedal); setDialog(null); } catch (error) { notify((error as Error).message); } }}><label className="field-label">페달 이름<input name="name" required maxLength={40} placeholder="예: My Overdrive"/></label><div className="dialog-fields"><label className="field-label">가로 (mm)<input name="width" type="number" min={20} max={400} step={.1} defaultValue={70} required/></label><label className="field-label">세로 (mm)<input name="height" type="number" min={20} max={500} step={.1} defaultValue={120} required/></label><label className="field-label">색상<input name="color" type="color" defaultValue="#aa95ca"/></label></div><button className="button primary full" type="submit">보드에 추가하기 ＋</button></form></Dialog>
    <Dialog open={dialog === 'new'} title="새 보드를 만들까요?" onClose={() => setDialog(null)}><p className="dialog-description">현재 배치를 비운 새 보드를 엽니다. 현재 보드는 파일로 내보내 보관할 수 있고, 새로고침 전까지 되돌리기로 복구할 수 있어요.</p><div className="dialog-actions"><button className="button light" onClick={exportBoard}>현재 보드 내보내기</button><button className="button primary" onClick={() => { replace(emptyBoard()); setSelectedId(null); fit(); setDialog(null); }}>빈 보드 만들기</button></div></Dialog>
    <Dialog open={dialog === 'help'} title="내 사운드의 자리 만들기" onClose={() => setDialog(null)}><ol className="help-list"><li>기어 추가 버튼을 눌러 라이브러리를 열고, 페달을 클릭하거나 보드로 드래그해 추가하세요. 내 페달 만들기 아래의 내 보드 만들기에서 직접 규격을 입력할 수 있어요.</li><li>페달 선택 후 <kbd>R</kbd>로 90° 회전, <kbd>Delete</kbd>로 삭제해요.</li><li>방향키로 1mm, Shift + 방향키로 5mm 움직여요. 확대 상태에서는 보드 배경을 끌어 이동해요.</li><li>3D로 보기 버튼으로 전환하면 배경 드래그로 시점을 회전하고, 휠 또는 두 손가락으로 확대해요. 페달은 직접 드래그해 이동할 수 있고 Esc로 이동을 취소해요. 2D와 3D는 같은 배치를 사용해요.</li><li>장비 선택 후 ‘보드 아래’를 눌러 하부로 내릴 수 있어요. 상판 보기·하부 보기로 표시할 면을 바꾸고, 3D 보드 반투명으로 가려진 장비를 확인하세요. 하부 시점에서 드래그하거나 방향키로 이동하고, ‘상판’으로 다시 올려요. 높이와 하부 공간 경고도 확인하세요.</li><li>패치 케이블 → 케이블 추가를 누른 뒤 시작점과 끝점을 클릭하세요. 양 끝을 끌어 위치를 수정하고 Esc로 배치를 취소해요. 끝점은 페달을 옮겨도 지정한 자리에 유지됩니다.</li><li>뮬에서 검색하기 버튼을 누르면 핵심 모델명으로 전체 매물(판매완료 포함)을 검색해요.</li><li>상단 예산 버튼을 누르고 페달 항목을 펼쳐 예상 단가와 보유 여부를 입력하면 추가 구매 예산을 확인할 수 있어요.</li><li>배치는 이 브라우저에 저장돼요. 다른 기기에서는 내보낸 파일을 불러오세요.</li></ol><p className="help-note">페달과 보드 탭에서 제조사·모델을 검색하세요. 공식 사진과 카탈로그 사진을 사용하며 로딩 실패 시 대체 표시합니다. 케이블·잭 공간은 별도로 확인해 주세요. 자동 시세 수집과 계정 저장은 아직 연결하지 않았습니다.</p></Dialog>
  </div>;
}
