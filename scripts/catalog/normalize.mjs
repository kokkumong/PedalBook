import { createHash } from 'node:crypto';

export const UPSTREAM = 'https://github.com/PedalPlayground/pedalplayground';
export const aliases = { 'boss-ds1.png': 'boss-ds1', 'boss-ce2w.png': 'boss-ce2w', 'boss-dd8.png': 'boss-dd8', 'boss-tu3.png': 'boss-tu3', 'strymon-bluesky-v2.png': 'strymon-bluesky' };
export function normalizeCatalog(rows, kind) {
  if (!['pedals', 'boards'].includes(kind) || !Array.isArray(rows) || !rows.length || rows.length > 50000) throw new Error('Invalid catalog');
  const ids = new Set();
  return rows.map((r, index) => {
    if (!r || !['Brand', 'Name', 'Image'].every(k => typeof r[k] === 'string' && r[k].trim().length > 0 && r[k].length <= 160) ||
      !/^[^/\\\x00-\x1f]+$/.test(r.Image) || r.Image.includes('..') ||
      !['Width', 'Height'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]) && r[k] > 0 && r[k] <= 100)) throw new Error(`Invalid ${kind} row ${index}`);
    const id = (kind === 'pedals' && aliases[r.Image]) || `pp-${kind === 'pedals' ? 'p' : 'b'}-${createHash('sha256').update(JSON.stringify([r.Brand, r.Name, r.Image])).digest('hex').slice(0, 20)}`;
    if (ids.has(id)) throw new Error(`Duplicate identity: ${id}`);
    ids.add(id);
    return { id, brand: r.Brand.trim(), name: r.Name.trim(), widthMm: Math.round(r.Width * 25400) / 1000, heightMm: Math.round(r.Height * 25400) / 1000, image: r.Image };
  });
}
export function catalogDiff(before = [], after) {
  const old = new Map(before.map(r => [r.id, r])), next = new Map(after.map(r => [r.id, r]));
  return { added: after.filter(r => !old.has(r.id)).length, removed: before.filter(r => !next.has(r.id)).length, changed: after.filter(r => old.has(r.id) && JSON.stringify(old.get(r.id)) !== JSON.stringify(r)).length };
}
