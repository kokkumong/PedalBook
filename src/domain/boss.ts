// Overall dimensions: BOSS product specifications, checked 2026-11-04.
// Component shapes/positions are photo-based approximations, not manufacturer CAD.
export type BossModel = 'ds1' | 'ce2w' | 'dd8' | 'tu3' | 'gt1000core';
export type BossProfile = { model: BossModel; name: string; widthMm: number; depthMm: number; heightMm: number; color: string; sourceUrl: string };
export const BOSS_PROFILES: Readonly<Record<string, BossProfile>> = {
  'boss-ds1': { model:'ds1',name:'DS-1',widthMm:73,depthMm:129,heightMm:59,color:'#ed791c',sourceUrl:'https://www.boss.info/us/products/ds-1/' },
  'boss-ce2w': { model:'ce2w',name:'CE-2W',widthMm:73,depthMm:129,heightMm:59,color:'#77b8cf',sourceUrl:'https://www.boss.info/us/products/ce-2w/' },
  'boss-dd8': { model:'dd8',name:'DD-8',widthMm:73,depthMm:129,heightMm:59,color:'#e0e0d7',sourceUrl:'https://www.boss.info/us/products/dd-8/' },
  'boss-tu3': { model:'tu3',name:'TU-3',widthMm:73,depthMm:129,heightMm:59,color:'#e8e7df',sourceUrl:'https://www.boss.info/us/products/tu-3/' },
  // Official 65mm includes rubber feet; 63mm without feet. Existing saved footprint is retained.
  'pp-p-e2e2132201ccf16752ad': { model:'gt1000core',name:'GT-1000CORE',widthMm:173,depthMm:135,heightMm:65,color:'#23272b',sourceUrl:'https://www.boss.info/us/products/gt-1000core/' },
};
export function bossProfile(id: string) { return Object.hasOwn(BOSS_PROFILES,id) ? BOSS_PROFILES[id] : undefined; }
