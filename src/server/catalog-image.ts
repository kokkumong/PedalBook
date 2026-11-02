import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { catalogPhoto, PEDAL_PHOTOS } from '../domain/photos.ts';

const root = join(process.cwd(), '.cache', 'catalog-images');
const pending = new Map<string, Promise<Buffer>>();
let active = 0;
const queue: (() => void)[] = [];
async function slot() {
  if (active >= 6) await new Promise<void>(resolve => queue.push(resolve));
  else active++;
}
function release() { const next = queue.shift(); if (next) next(); else active--; }
const failures = new Map<string, number>();
export function imageSources(kind: string, id: string): string[] {
  if (kind !== 'pedals' && kind !== 'boards') return [];
  const fallback = catalogPhoto(kind, id);
  if (!fallback) return [];
  const official = kind === 'pedals' && Object.hasOwn(PEDAL_PHOTOS, id) ? PEDAL_PHOTOS[id] : undefined;
  return [...new Set([official?.originalUrl, fallback.originalUrl].filter((url): url is string => !!url))];
}
async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { 'User-Agent': 'PedalBook-image-cache' } });
  if (!response.ok || !response.body) throw new Error('Image unavailable');
  if (Number(response.headers.get('content-length')) > 8_000_000) { await response.body.cancel(); throw new Error('Image too large'); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 8_000_000) throw new Error('Image too large'); chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return sharp(Buffer.concat(chunks), { limitInputPixels: 25_000_000 }).resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}
export async function cachedCatalogImage(sources: string[]): Promise<Buffer> {
  const key = createHash('sha256').update(JSON.stringify(sources) + ':700-v1').digest('hex');
  const path = join(root, `${key}.webp`);
  try { return await readFile(path); } catch { /* first request or read-only cache */ }
  if ((failures.get(key) ?? 0) > Date.now()) throw new Error('Retry later');
  const existing = pending.get(key); if (existing) return existing;
  if (pending.size >= 128) throw new Error('Image queue busy');
  const task = (async () => {
    await slot();
    try {
      for (const url of sources) {
        try {
          const bytes = await download(url);
          try { await mkdir(root, { recursive: true }); await writeFile(`${path}.tmp`, bytes); await rename(`${path}.tmp`, path); } catch { /* serving still works without writable disk */ }
          return bytes;
        } catch { /* official source can fall back to catalog */ }
      }
      if (failures.size > 1000) failures.clear();
      failures.set(key, Date.now() + 60_000);
      throw new Error('No available image');
    } finally { release(); }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
