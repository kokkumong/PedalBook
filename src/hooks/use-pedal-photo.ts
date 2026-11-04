'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Pedal } from '../domain/catalog.ts';
import { PEDAL_PHOTOS, pedalPhoto } from '../domain/photos.ts';
import { pedalImage } from '../domain/artwork.ts';

export function usePedalPhoto(pedal: Pedal) {
  const photo = pedalPhoto(pedal);
  const fallback = pedalImage(pedal);
  const [failed, setFailed] = useState<string[]>([]);
  // The catalog endpoint already tries the official URL on failure. Keep the bundled official asset as an offline fallback.
  const official = Object.hasOwn(PEDAL_PHOTOS, pedal.id) ? PEDAL_PHOTOS[pedal.id] : undefined;
  const local = official?.src.startsWith('/images/') ? official.src : undefined;
  const candidates = [...new Set([photo?.src, local].filter((s): s is string => !!s))];
  const source = candidates.find(s => !failed.includes(s)) ?? fallback;
  const fail = useCallback(() => setFailed(current => current.includes(source) ? current : [...current, source]), [source]);
  return { source, isPhoto: source !== fallback, photo, fail };
}

export function useCanvasPedalPhoto(pedal: Pedal) {
  const visual = usePedalPhoto(pedal);
  const [loaded, setLoaded] = useState<{ source: string; image: HTMLImageElement } | null>(null);
  const { source, fail } = visual;
  useEffect(() => {
    let active = true;
    const image = new window.Image();
    image.onload = () => { if (active) setLoaded({ source, image }); };
    image.onerror = () => { if (active) fail(); };
    image.src = source;
    return () => { active = false; };
  }, [source, fail]);
  return { ...visual, image: loaded?.source === source ? loaded.image : undefined };
}
