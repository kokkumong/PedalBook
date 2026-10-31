'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Pedal } from '../domain/catalog.ts';
import { pedalPhoto } from '../domain/photos.ts';
import { pedalImage } from '../domain/artwork.ts';

export function usePedalPhoto(pedal: Pedal) {
  const photo = pedalPhoto(pedal);
  const fallback = pedalImage(pedal);
  const [failed, setFailed] = useState<string | null>(null);
  const source = photo && failed !== photo.src ? photo.src : fallback;
  const fail = useCallback(() => setFailed(source), [source]);
  return { source, isPhoto: source === photo?.src, photo, fail };
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
