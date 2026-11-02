'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Pedal } from '../domain/catalog.ts';
import { catalogPhoto, pedalPhoto } from '../domain/photos.ts';
import { pedalImage } from '../domain/artwork.ts';

export function usePedalPhoto(pedal: Pedal) {
  const photo = pedalPhoto(pedal);
  const fallback = pedalImage(pedal);
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [photo?.src, catalogPhoto('pedals', pedal.id)?.src].filter((s): s is string => !!s);
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
