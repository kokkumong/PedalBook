'use client';

import type { Pedal } from '../domain/catalog.ts';
import { usePedalPhoto } from '../hooks/use-pedal-photo';

export function PedalThumb({ pedal }: { pedal: Pedal }) {
  const { source, isPhoto, fail } = usePedalPhoto(pedal);
  return <span className="thumbnail">
    <img loading="lazy" src={source} alt={`${pedal.brand} ${pedal.name} ${isPhoto ? '제품 사진' : '일러스트'}`} draggable={false} onError={fail}/>
  </span>;
}
