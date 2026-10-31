'use client';
import { useEffect, useState } from 'react';
import type { BoardItem } from '../domain/board.ts';
import { marketState, MULE_MARKET_URL, parsePrice, searchPhrase, VERIFIED_QUOTES } from '../domain/market.ts';

export const won = (value: number) => `₩${value.toLocaleString('ko-KR')}`;

export function MarketPanel({ item, onPrice, onOwned, notify }: { item: BoardItem; onPrice: (price: number | null) => void; onOwned: (owned: boolean) => void; notify: (message: string) => void }) {
  const [draft, setDraft] = useState(item.manualPriceKrw?.toString() ?? '');
  const [error, setError] = useState('');
  useEffect(() => { setDraft(item.manualPriceKrw?.toString() ?? ''); setError(''); }, [item.instanceId, item.manualPriceKrw]);
  const phrase = searchPhrase(item.pedal), market = marketState(item.pedalId, VERIFIED_QUOTES[item.pedalId]);
  return <div className="market-panel">
    <div className="market-heading"><h3>중고 매물 찾기</h3><span className="small-badge">MULE</span></div>
    <label className="field-label" htmlFor="market-query">검색할 모델명</label>
    <div className="copy-query"><input id="market-query" aria-label="뮬 검색어" readOnly value={phrase}/><button title="검색어 복사" aria-label="검색어 복사" onClick={async () => { try { await navigator.clipboard.writeText(phrase); notify('검색어를 복사했어요. 뮬 장터 검색창에 붙여넣어 주세요.'); } catch { notify('자동 복사가 어려워요. 검색어를 직접 선택해 복사해 주세요.'); } }}>⧉</button></div>
    <a className="button light full market-link" href={MULE_MARKET_URL} target="_blank" rel="noopener noreferrer">뮬 장터 열기 <span aria-hidden="true">↗</span></a>
    <p className="field-hint">검색어를 복사한 뒤 장터에서 찾아보세요.</p>
    <div className="quote-card">
      <div><strong>참고 시세</strong><span className="small-badge">{market.status === 'unavailable' ? '정보 없음' : market.status === 'stale' ? '이전 관측값' : '매물 호가'}</span></div>
      {market.status === 'unavailable' ? <p>확인된 시세가 아직 없어요.<br/>예상 단가를 입력해 예산을 계산할 수 있어요.</p> : <><strong className="quote-value">{won(market.quote.medianKrw)}</strong><p>{won(market.quote.lowKrw)} ~ {won(market.quote.highKrw)} · {market.quote.sampleCount}개 표본<br/>{new Date(market.quote.observedAt).toLocaleDateString('ko-KR')} 확인 · 체결가와 다를 수 있어요.</p>{market.status === 'stale' && <p>하루 이상 지난 가격은 예산에 자동 반영하지 않아요.</p>}<a href={market.quote.sourceUrls[0]} target="_blank" rel="noopener noreferrer">가격 출처 확인 ↗</a></>}
    </div>
    <form onSubmit={event => { event.preventDefault(); try { onPrice(parsePrice(draft)); setError(''); notify('예상 단가를 반영했어요.'); } catch (err) { setError((err as Error).message); } }}>
      <label className="field-label" htmlFor="manual-price">내 예상 단가 <span>원</span></label>
      <input className="price-input" id="manual-price" inputMode="numeric" autoComplete="off" value={draft} placeholder="가격 미상" onChange={event => setDraft(event.target.value)} aria-invalid={!!error} aria-describedby={error ? 'price-error' : 'price-help'}/>
      {error && <p id="price-error" className="field-error" role="alert">{error}</p>}
      <p id="price-help" className="field-hint">직접 입력한 금액이며 시장 시세와 구분됩니다.</p>
      <div className="price-actions"><button className="button light" type="submit">단가 적용</button><button className="text-button" type="button" onClick={() => { setDraft(''); setError(''); onPrice(null); }}>초기화</button></div>
    </form>
    <label className="owned-check"><input type="checkbox" checked={item.owned} onChange={event => onOwned(event.target.checked)}/><span>이미 보유한 페달<small>추가 구매 예산에서 제외해요</small></span></label>
  </div>;
}
