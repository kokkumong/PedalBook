'use client';
import { useMemo, useRef, useState } from 'react';
import { BOARD_MODELS, CATALOG, CATALOG_META, matchesQuery, searchCatalog } from '../domain/catalog.ts';
import type { BoardModel, Pedal } from '../domain/catalog.ts';
import { catalogPhoto } from '../domain/photos.ts';
import { PedalThumb } from './pedal-thumbnail';
const PAGE_SIZE = 12;

export function BoardThumb({ model }: { model: BoardModel }) {
  const [failed, setFailed] = useState(false);
  return <span className="thumbnail board-thumbnail">{failed ? <span aria-label="보드 사진 없음">▦</span> : <img loading="lazy" src={catalogPhoto('boards', model.id)?.src} alt={`${model.brand} ${model.name} 보드 사진`} onError={() => setFailed(true)} draggable={false}/>}</span>;
}

export function CatalogLibrary({ ready, currentModelId, onAdd, onBoard, onCustom }: {
  ready: boolean; currentModelId?: string; onAdd: (pedal: Pedal) => void; onBoard: (model: BoardModel) => void; onCustom: () => void;
}) {
  const [kind, setKind] = useState<'pedals' | 'boards'>('pedals');
  const [query, setQuery] = useState(''), [brand, setBrand] = useState('전체'), [category, setCategory] = useState('전체'), [page, setPage] = useState(0);
  const catalogTop = useRef<HTMLDivElement>(null);
  const brands = useMemo(() => [...new Set((kind === 'pedals' ? CATALOG : BOARD_MODELS).map(p => p.brand.toUpperCase()))].sort(), [kind]);
  const pedals = useMemo(() => searchCatalog(query, category, brand), [query, category, brand]);
  const boards = useMemo(() => BOARD_MODELS.filter(b => (brand === '전체' || b.brand.toUpperCase() === brand) && matchesQuery(`${b.brand} ${b.name}`, query)), [query, brand]);
  const results = kind === 'pedals' ? pedals : boards, pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const changePage = (n: number) => { setPage(n); catalogTop.current?.scrollIntoView({ block: 'nearest' }); };
  return <aside className="library panel" aria-label="페달과 보드 라이브러리">
    <div className="panel-heading"><p className="eyebrow">BUILD YOUR SOUND</p><h1>기어 라이브러리</h1></div>
    <div className="library-tabs" role="group" aria-label="라이브러리 종류">{(['pedals', 'boards'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setQuery(''); setBrand('전체'); setCategory('전체'); setPage(0); }}>{k === 'pedals' ? '페달' : '보드'} <small>{(k === 'pedals' ? CATALOG.length : BOARD_MODELS.length).toLocaleString('ko-KR')}</small></button>)}</div>
    <label className="search-field"><span aria-hidden="true">⌕</span><input id="catalog-search" type="search" aria-label="라이브러리 검색" placeholder="브랜드, 모델 검색" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/><kbd>/</kbd></label>
    <label className="brand-filter">제조사<select aria-label="제조사 필터" value={brand} onChange={e => { setBrand(e.target.value); setPage(0); }}><option value="전체">전체 제조사</option>{brands.map(b => <option key={b}>{b}</option>)}</select></label>
    {kind === 'pedals' && <div className="filters" aria-label="카테고리 필터">{['전체', ...new Set(CATALOG.map(p => p.category))].map(c => <button key={c} className={`filter ${c === category ? 'active' : ''}`} aria-pressed={c === category} onClick={() => { setCategory(c); setPage(0); }}>{c}</button>)}</div>}
    <div className="library-subtitle" ref={catalogTop}><span>{results.length.toLocaleString('ko-KR')}개 검색됨</span><span>{kind === 'pedals' ? '클릭 또는 드래그' : '클릭해서 보드 변경'}</span></div>
    <div className="catalog">{kind === 'pedals' ? pedals.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(p => <button key={p.id} className="pedal-card" disabled={!ready} draggable={ready} onDragStart={e => { e.dataTransfer.setData('application/x-pedalbook', p.id); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => onAdd(p)} aria-label={`${p.brand} ${p.name} 보드에 추가`}><PedalThumb pedal={p}/><span className="card-copy"><span className="card-brand">{p.brand}</span><strong>{p.name}</strong><span className="card-category">{p.widthMm} × {p.heightMm} mm</span></span><span className="card-add" aria-hidden="true">＋</span></button>) : boards.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(b => <button key={b.id} className="pedal-card board-card" disabled={!ready} aria-pressed={currentModelId === b.id} onClick={() => onBoard(b)} aria-label={`${b.brand} ${b.name} 보드 선택`} title={`${b.brand} ${b.name} · ${b.widthMm} × ${b.heightMm} mm`}><BoardThumb model={b}/><span className="card-copy board-card-copy"><span className="card-brand">{b.brand}</span><strong>{b.name}</strong><span className="card-category">{b.widthMm} × {b.heightMm} mm</span></span></button>)}</div>
    {!results.length && <p className="empty-results">검색 결과가 없어요.<br/>다른 모델명이나 제조사로 찾아보세요.</p>}
    <nav className="catalog-pagination" aria-label="라이브러리 페이지"><button aria-label="이전 페이지" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>←</button><span>{currentPage + 1} / {pageCount}</span><button aria-label="다음 페이지" disabled={currentPage + 1 >= pageCount} onClick={() => changePage(currentPage + 1)}>→</button></nav>
    {kind === 'pedals' ? <button className="custom-button" disabled={!ready} onClick={onCustom}><span>＋</span><span>내 페달 직접 만들기<small>이름과 규격으로 추가하세요</small></span></button> : <p className="library-note">보드를 바꿔도 페달 위치는 유지돼요.<br/>작은 보드에서는 밖으로 나간 페달을 확인하세요.<br/>사진 외곽 기준 사각 영역이며 홈·레일은 별도로 확인하세요.</p>}
    <p className="library-note"><a href={CATALOG_META.sourceUrl} target="_blank" rel="noopener noreferrer">PedalPlayground 카탈로그 ↗</a><br/>{CATALOG_META.syncedAt.slice(0,10)} 동기화 · 인치 → mm<br/>PedalPlayground 우선 · 없으면 공식 사진<br/>사진을 불러올 수 없으면 대체 표시합니다.</p>
  </aside>;
}
