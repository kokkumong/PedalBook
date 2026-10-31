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
  return Object.hasOwn(PEDAL_PHOTOS, pedal.id) ? PEDAL_PHOTOS[pedal.id] : undefined;
}

export function containImage(imageWidth: number, imageHeight: number, width: number, height: number) {
  const ratio = Math.min(width / imageWidth, height / imageHeight);
  const w = imageWidth * ratio, h = imageHeight * ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
