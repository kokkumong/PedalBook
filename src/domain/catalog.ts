export type Pedal = {
  id: string;
  brand: string;
  name: string;
  subtitle: string;
  category: string;
  widthMm: number;
  heightMm: number;
  color: string;
  ink: string;
  style: 'compact' | 'tuner' | 'wide' | 'custom';
  sourceUrl: string | null;
};

// Width × depth from manufacturer specifications. Photos and original illustration fallbacks are managed separately.
export const CATALOG: Pedal[] = [
  { id: 'boss-ds1', brand: 'BOSS', name: 'DS-1', subtitle: 'Distortion', category: '드라이브', widthMm: 73, heightMm: 129, color: '#e58e50', ink: '#372d24', style: 'compact', sourceUrl: 'https://www.boss.info/global/products/ds-1/specifications/' },
  { id: 'boss-ce2w', brand: 'BOSS', name: 'CE-2W', subtitle: 'Chorus', category: '모듈레이션', widthMm: 73, heightMm: 129, color: '#8fbcc8', ink: '#2d4b50', style: 'compact', sourceUrl: 'https://www.boss.info/global/products/ce-2w/' },
  { id: 'boss-dd8', brand: 'BOSS', name: 'DD-8', subtitle: 'Digital Delay', category: '공간계', widthMm: 73, heightMm: 129, color: '#e7e9dd', ink: '#425648', style: 'compact', sourceUrl: 'https://www.boss.info/global/products/dd-8/' },
  { id: 'strymon-bluesky', brand: 'strymon', name: 'blueSky V2', subtitle: 'Reverb', category: '공간계', widthMm: 101.6, heightMm: 114.3, color: '#7fabc0', ink: '#f3f7f3', style: 'wide', sourceUrl: 'https://www.strymon.net/product/bluesky/' },
  { id: 'boss-tu3', brand: 'BOSS', name: 'TU-3', subtitle: 'Chromatic Tuner', category: '유틸리티', widthMm: 73, heightMm: 129, color: '#e8e7dc', ink: '#414d3d', style: 'tuner', sourceUrl: 'https://www.boss.info/global/products/tu-3/' },
];

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s-]/g, '');
export function searchCatalog(query: string, category = '전체') {
  const term = normalize(query).replace(/보스/g, 'boss').replace(/스트라이몬/g, 'strymon');
  return CATALOG.filter(p => (category === '전체' || p.category === category) && normalize(`${p.brand}${p.name}${p.subtitle}${p.category}`).includes(term));
}
