import type { Pedal } from './catalog.ts';
const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function pedalArt(p: Pedal) {
  const w = p.widthMm, h = p.heightMm, ink = p.ink, cx = w / 2;
  const knob = (x: number, y: number, r = 6) => `<circle cx="${x}" cy="${y + .8}" r="${r + .6}" fill="#000" opacity=".18"/><circle cx="${x}" cy="${y}" r="${r}" fill="#242a29" stroke="#111" stroke-width=".6"/><path d="M${x} ${y - r + 1.5}v${r / 2}" stroke="#cdd3c8" stroke-width="1.1" stroke-linecap="round"/>`;
  const text = (x: number, y: number, content: string, size: number, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" ${extra.includes('fill=') ? '' : `fill="${ink}"`} ${extra}>${esc(content)}</text>`;
  let detail = '';
  if (p.style === 'compact') {
    const count = p.id === 'boss-dd8' ? 4 : p.id === 'boss-ce2w' ? 2 : 3;
    detail += Array.from({ length: count }, (_, i) => knob(12 + i * (w - 24) / (count - 1), 15, count === 4 ? 5 : 6)).join('');
    detail += `<circle cx="${cx}" cy="35" r="1.7" fill="#a84d3a"/><circle cx="${cx}" cy="34.7" r=".7" fill="#e9b19a"/>`;
    detail += text(cx, h * .4, p.subtitle, 6.2) + text(cx, h * .49, p.name, 10, 'font-weight="700"');
    detail += `<rect x="6" y="${h * .57}" width="${w - 12}" height="${h * .35}" rx="3" fill="#222b28"/><rect x="9" y="${h * .59}" width="${w - 18}" height="${h * .28}" rx="2" fill="#2a322e"/>`;
    for (let y = h * .62; y < h * .77; y += 3) detail += `<path d="M13 ${y}h${w - 26}" stroke="#343d36" stroke-width="1"/>`;
    detail += text(cx, h * .845, 'BOSS', 7, 'font-weight="900" fill="#737b6b"') + text(cx, h * .97, 'INPUT     OUTPUT', 2.8);
  } else if (p.style === 'tuner') {
    detail += `<rect x="7" y="8" width="${w - 14}" height="43" rx="3" fill="#25312d"/>`;
    for (let i = 0; i < 13; i++) detail += `<rect x="${12 + i * 3.9}" y="14" width="2" height="${i === 6 ? 7 : 4}" fill="${i === 6 ? '#d4dca7' : '#6b8761'}"/>`;
    detail += text(cx, 39, 'E', 17, 'fill="#c5d4ad"') + text(cx, 63, 'Chromatic Tuner', 5.7) + text(cx, 75, 'TU-3', 10, 'font-weight="700"');
    detail += `<rect x="6" y="84" width="${w - 12}" height="34" rx="3" fill="#2b3430"/>` + text(cx, 106, 'BOSS', 7, 'font-weight="900" fill="#89917f"');
  } else if (p.style === 'wide') {
    detail += [20, 50, 80].map(x => knob(x, 19, 6.5)).join('') + [30, 70].map(x => knob(x, 43, 5)).join('');
    detail += text(cx, 68, 'blueSky', 12, 'font-style="italic" font-weight="600"') + text(cx, 77, 'REVERBERATOR', 3.5, 'letter-spacing="1.8"') + text(cx, h - 5, 'strymon', 6);
    [22, w - 22].forEach(x => { detail += `<circle cx="${x}" cy="${h - 21}" r="6.5" fill="#4e6d79"/><circle cx="${x}" cy="${h - 22}" r="5" fill="#d0d9d8" stroke="#64818b" stroke-width="1.5"/><circle cx="${x}" cy="${h - 22}" r="3" fill="#b5c0bf"/>`; });
  } else {
    detail += knob(w * .3, h * .16, Math.min(6, w * .08)) + knob(w * .7, h * .16, Math.min(6, w * .08));
    detail += text(cx, h * .46, p.name.slice(0, 15), Math.min(9, w / 9), 'font-weight="700"') + text(cx, h * .54, p.id.startsWith('custom-') ? 'CUSTOM PEDAL' : 'IMAGE UNAVAILABLE', Math.min(4, w / 16));
    detail += `<circle cx="${cx}" cy="${h * .79}" r="${Math.min(w * .13, 8)}" fill="#c9cbc3" stroke="#6c7165" stroke-width="1.5"/>`;
  }
  return `<rect width="${w}" height="${h}" rx="4" fill="${p.color}" stroke="#0005" stroke-width=".8"/><rect x="1.3" y="1.3" width="${w - 2.6}" height="${h - 2.6}" rx="3" fill="none" stroke="#fff4" stroke-width=".7"/>${detail}`;
}

export function pedalImage(pedal: Pedal): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pedal.widthMm * 3}" height="${pedal.heightMm * 3}" viewBox="0 0 ${pedal.widthMm} ${pedal.heightMm}">${pedalArt(pedal)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
