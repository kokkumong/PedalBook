import { CATALOG_META, SOURCE_PEDALS, SOURCE_BOARDS } from './catalog.ts';
import type { Pedal } from './catalog.ts';

export type PedalPhoto = {
  src: string;
  sourceUrl: string;
  originalUrl: string;
  credit: string;
  usage: string;
  checkedAt: string;
};

// Deliberately separate from saved boards: old layouts receive new imagery,
// while imported files cannot choose arbitrary remote image URLs.
export const PEDAL_PHOTOS: Readonly<Record<string, PedalPhoto>> = {
  'boss-ds1': { src: '/api/catalog-image/pedals/boss-ds1?v=official-1', sourceUrl: 'https://www.boss.info/global/products/ds-1/', originalUrl: 'https://static.roland.com/assets/images/products/gallery/ds1_gal.jpg', credit: 'BOSS / Roland', usage: 'Official product gallery reference for personal noncommercial prototype; original rights retained.', checkedAt: '2026-11-02' },
  'boss-ce2w': { src: '/api/catalog-image/pedals/boss-ce2w?v=official-1', sourceUrl: 'https://www.boss.info/global/products/ce-2w/', originalUrl: 'https://static.roland.com/assets/images/products/gallery/CE-2W_F_gal.jpg', credit: 'BOSS / Roland', usage: 'Official product gallery reference for personal noncommercial prototype; original rights retained.', checkedAt: '2026-11-02' },
  'boss-dd8': { src: '/api/catalog-image/pedals/boss-dd8?v=official-1', sourceUrl: 'https://www.boss.info/global/products/dd-8/', originalUrl: 'https://static.roland.com/assets/images/products/gallery/dd-8_top_gal.jpg', credit: 'BOSS / Roland', usage: 'Official product gallery reference for personal noncommercial prototype; original rights retained.', checkedAt: '2026-11-02' },
  'boss-tu3': { src: '/api/catalog-image/pedals/boss-tu3?v=official-1', sourceUrl: 'https://www.boss.info/global/products/tu-3/', originalUrl: 'https://static.roland.com/assets/images/products/gallery/tu-3_top_gal.jpg', credit: 'BOSS / Roland', usage: 'Official product gallery reference for personal noncommercial prototype; original rights retained.', checkedAt: '2026-11-02' },
  'strymon-bluesky': {
    src: '/images/pedals/strymon-bluesky-v2.png',
    sourceUrl: 'https://www.strymon.net/press/',
    originalUrl: 'https://www.strymon.net/wp-content/uploads/2022/08/blueSky_Homepage.png',
    credit: 'Strymon · blueSky V2',
    usage: 'Official press image for product identification; copyright remains with Strymon. Not an open-source asset license.',
    checkedAt: '2026-10-31',
  },
};

export function pedalPhoto(pedal: Pedal): PedalPhoto | undefined {
  return Object.hasOwn(PEDAL_PHOTOS, pedal.id) ? PEDAL_PHOTOS[pedal.id] : catalogPhoto('pedals', pedal.id);
}

export function containImage(imageWidth: number, imageHeight: number, width: number, height: number) {
  const ratio = Math.min(width / imageWidth, height / imageHeight);
  const w = imageWidth * ratio, h = imageHeight * ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function catalogPhoto(kind: 'pedals' | 'boards', id: string): PedalPhoto | undefined {
  const entry = (kind === 'pedals' ? SOURCE_PEDALS : SOURCE_BOARDS).get(id);
  if (!entry) return undefined;
  const directory = kind === 'pedals' ? 'pedals' : 'pedalboards';
  return {
    src: `/api/catalog-image/${kind}/${id}?v=${CATALOG_META.revision}`,
    sourceUrl: `${CATALOG_META.sourceUrl}/blob/${CATALOG_META.revision}/public/images/${directory}/${encodeURIComponent(entry.image)}`,
    originalUrl: `https://raw.githubusercontent.com/PedalPlayground/pedalplayground/${CATALOG_META.revision}/public/images/${directory}/${encodeURIComponent(entry.image)}`,
    credit: 'PedalPlayground', usage: 'External reference for personal noncommercial prototype; original rights retained. No blanket asset license asserted.', checkedAt: CATALOG_META.syncedAt.slice(0, 10),
  };
}
