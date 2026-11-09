import type { Board, BoardItem } from './board.ts';
import type { Pedal } from './catalog.ts';

export const MULE_MARKET_URL = 'https://www.mule.co.kr/bbs/market/sell';
export const searchPhrase = (pedal: Pedal) => `${pedal.brand === 'CUSTOM' ? '' : pedal.brand + ' '}${pedal.name}`.normalize('NFKC').replace(/\s+/g, ' ').trim();

// Mule's public search form truncates queries to 20 characters (2026-11-05).
export const MULE_QUERY_LIMIT = 20;
const normalizeQuery = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
const queryLength = (value: string) => Array.from(value).length;

export function defaultMuleQuery(pedal: Pedal): string {
  let name = normalizeQuery(pedal.name);
  const brand = normalizeQuery(pedal.brand);
  if (brand && name.toLowerCase().startsWith(`${brand.toLowerCase()} `)) name = name.slice(brand.length).trim();
  // Color editions do not identify the circuit; retain other parentheses (e.g. V2).
  name = name.replace(/\s*\([^)]*\b(?:white|black|pink|red|blue|green|gold|silver|color|colour)\b[^)]*\)/gi, '')
    .replace(/\s+(?:guitar effects processor|power supply)$/i, '').trim();
  if (!name) name = normalizeQuery(pedal.name) || brand;
  if (queryLength(name) <= MULE_QUERY_LIMIT) return name;

  const words = name.split(' ');
  const model = words.find(word => /[a-z]/i.test(word) && /\d/.test(word) && !/^(?:v|mk|rev)\d+$/i.test(word));
  const version = words.find(word => /^(?:v\d+|mk(?:\d+|i{1,3}|iv)|rev\d+)$/i.test(word));
  if (model && queryLength(model) <= MULE_QUERY_LIMIT) {
    const withVersion = version && version !== model ? `${model} ${version}` : model;
    return queryLength(withVersion) <= MULE_QUERY_LIMIT ? withVersion : model;
  }
  // Keep whole words and reserve room for a generation marker when available.
  const suffix = version ? ` ${version}` : '';
  const room = MULE_QUERY_LIMIT - queryLength(suffix);
  let core = '';
  for (const word of words.filter(word => word !== version)) {
    const next = core ? `${core} ${word}` : word;
    if (queryLength(next) > room) break;
    core = next;
  }
  return core ? `${core}${suffix}` : Array.from(name).slice(0, MULE_QUERY_LIMIT).join('');
}
export function muleSearchUrl(query: string, sellingOnly = false): string | null {
  const term = normalizeQuery(query);
  if (!term || queryLength(term) > MULE_QUERY_LIMIT) return null;
  const url = new URL(MULE_MARKET_URL);
  url.search = new URLSearchParams({ page: '1', map: 'list', mode: 'list', qf: 'title', qs: term,
    ct1: '이펙터', sell_status: sellingOnly ? '판매중' : '', of: 'wdate', od: 'desc', andor: 'and', v: 'l' }).toString();
  return url.toString();
}

export type MarketQuote = {
  pedalId: string;
  source: 'mule';
  currency: 'KRW';
  metric: 'asking';
  medianKrw: number;
  lowKrw: number;
  highKrw: number;
  sampleCount: number;
  observedAt: string;
  sourceUrls: string[];
};
export type MarketState = { status: 'unavailable' } | { status: 'fresh' | 'stale'; quote: MarketQuote };
// No production quote is supplied until source evidence is verified.
export const VERIFIED_QUOTES: Record<string, MarketQuote> = {};
export function marketState(pedalId: string, quote: MarketQuote | undefined, now = Date.now()): MarketState {
  if (!quote || quote.pedalId !== pedalId || quote.source !== 'mule' || quote.currency !== 'KRW' || quote.metric !== 'asking' ||
    ![quote.medianKrw, quote.lowKrw, quote.highKrw].every(n => Number.isSafeInteger(n) && n > 0 && n <= 100_000_000) ||
    quote.lowKrw > quote.medianKrw || quote.medianKrw > quote.highKrw || !Number.isSafeInteger(quote.sampleCount) || quote.sampleCount < 1 ||
    !quote.sourceUrls.length || !quote.sourceUrls.every(raw => { try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname === 'www.mule.co.kr' && !u.username && !u.password && !u.port; } catch { return false; } })) return { status: 'unavailable' };
  const observed = Date.parse(quote.observedAt);
  if (!Number.isFinite(observed) || observed > now) return { status: 'unavailable' };
  return { status: now - observed <= 24 * 60 * 60 * 1000 ? 'fresh' : 'stale', quote };
}
export function itemPrice(item: BoardItem, quotes = VERIFIED_QUOTES, now = Date.now()) {
  if (item.manualPriceKrw !== null) return { priceKrw: item.manualPriceKrw, basis: 'manual' as const };
  const market = marketState(item.pedalId, quotes[item.pedalId], now);
  return market.status === 'fresh' ? { priceKrw: market.quote.medianKrw, basis: 'market' as const } : { priceKrw: null, basis: 'unknown' as const };
}
export function budget(board: Board, mode: 'all' | 'purchase', quotes = VERIFIED_QUOTES, now = Date.now()) {
  const items = board.items.filter(item => mode === 'all' || !item.owned);
  const rows = items.map(item => ({ item, ...itemPrice(item, quotes, now) }));
  return { rows, total: rows.reduce((sum, row) => sum + (row.priceKrw ?? 0), 0),
    known: rows.filter(row => row.priceKrw !== null).length, missing: rows.filter(row => row.priceKrw === null).length,
    manual: rows.filter(row => row.basis === 'manual').length, count: items.length, owned: board.items.filter(i => i.owned).length };
}
export function parsePrice(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^(\d+|\d{1,3}(,\d{3})+)$/.test(value.trim())) throw new Error('예상 단가는 원 단위 정수로 입력해 주세요. 쉼표는 천 단위로 사용할 수 있어요.');
  const normalized = value.trim().replaceAll(',', '');
  if (!/^\d+$/.test(normalized)) throw new Error('예상 단가는 0 이상의 원 단위 정수로 입력해 주세요.');
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number > 100_000_000) throw new Error('예상 단가는 1억 원 이하로 입력해 주세요.');
  return number;
}
