// Framework-independent prototype model. All saved coordinates and sizes are mm.
export const STORAGE_KEY = 'pedalbook.prototype.v1';
export const MAX_PEDALS = 50;
export const CATALOG = [
  { id: 'boss-ds1', brand: 'BOSS', name: 'DS-1', subtitle: 'Distortion', category: '드라이브', width: 73, height: 129, color: '#e58e50', ink: '#372d24', style: 'compact', source: 'https://www.boss.info/global/products/ds-1/specifications/' },
  { id: 'boss-ce2w', brand: 'BOSS', name: 'CE-2W', subtitle: 'Chorus', category: '모듈레이션', width: 73, height: 129, color: '#8fbcc8', ink: '#2d4b50', style: 'compact', source: 'https://www.boss.info/global/products/ce-2w/' },
  { id: 'boss-dd8', brand: 'BOSS', name: 'DD-8', subtitle: 'Digital Delay', category: '공간계', width: 73, height: 129, color: '#e7e9dd', ink: '#425648', style: 'compact', source: 'https://www.boss.info/global/products/dd-8/' },
  { id: 'strymon-bluesky', brand: 'strymon', name: 'blueSky V2', subtitle: 'Reverb', category: '공간계', width: 101.6, height: 114.3, color: '#7fabc0', ink: '#f3f7f3', style: 'wide', source: 'https://www.strymon.net/product/bluesky/' },
  { id: 'boss-tu3', brand: 'BOSS', name: 'TU-3', subtitle: 'Chromatic Tuner', category: '유틸리티', width: 73, height: 129, color: '#e8e7dc', ink: '#414d3d', style: 'tuner', source: 'https://www.boss.info/global/products/tu-3/' },
];
export const copy = value => structuredClone(value);
export const round = value => Math.round(value * 10) / 10;
export const normalizeRotation = rotation => ((rotation % 360) + 360) % 360;

export function defaultBoard() {
  const order = ['boss-tu3', 'boss-ds1', 'boss-ce2w', 'boss-dd8', 'strymon-bluesky'];
  return { schemaVersion: 1, name: 'My first pedalboard', width: 600, height: 320,
    items: order.map((id, i) => ({ id: `sample-${i + 1}`, pedal: copy(CATALOG.find(p => p.id === id)), x: [80, 180, 280, 380, 500][i], y: 160, rotation: 0 })) };
}

export function extents(item) {
  const swapped = normalizeRotation(item.rotation) % 180 === 90;
  return { x: (swapped ? item.pedal.height : item.pedal.width) / 2,
    y: (swapped ? item.pedal.width : item.pedal.height) / 2 };
}

export function clampPosition(item, board, x, y, snap = false) {
  const size = extents(item);
  const bound = (value, half, length) => length < half * 2 ? length / 2 : Math.min(length - half, Math.max(half, value));
  return { x: round(bound(snap ? Math.round(x / 5) * 5 : x, size.x, board.width)),
    y: round(bound(snap ? Math.round(y / 5) * 5 : y, size.y, board.height)) };
}

export function overlaps(a, b) {
  const ae = extents(a), be = extents(b);
  return Math.abs(a.x - b.x) < ae.x + be.x - 0.01 && Math.abs(a.y - b.y) < ae.y + be.y - 0.01;
}

export function warnings(board) {
  const ids = new Set();
  let outside = 0, pairs = 0;
  board.items.forEach((item, i) => {
    const e = extents(item);
    if (item.x - e.x < -0.1 || item.y - e.y < -0.1 || item.x + e.x > board.width + 0.1 || item.y + e.y > board.height + 0.1) { outside++; ids.add(item.id); }
    board.items.slice(i + 1).forEach(other => { if (overlaps(item, other)) { pairs++; ids.add(item.id); ids.add(other.id); } });
  });
  return { ids, outside, pairs };
}

export function findFreePosition(item, board) {
  const e = extents(item);
  for (let y = e.y + 10; y <= board.height - e.y; y += 10) {
    for (let x = e.x + 10; x <= board.width - e.x; x += 10) {
      const candidate = { ...item, x, y };
      if (!board.items.some(other => overlaps(candidate, other))) return { x: round(x), y: round(y) };
    }
  }
  return { x: board.width / 2, y: board.height / 2 };
}

export function validateBoard(raw) {
  const fail = () => { throw new Error('올바른 PedalBook 보드 파일이 아닙니다.'); };
  const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!raw || raw.schemaVersion !== 1 || !text(raw.name, 60) || !num(raw.width, 150, 1500) || !num(raw.height, 150, 1000) || !Array.isArray(raw.items) || raw.items.length > MAX_PEDALS) fail();
  const ids = new Set();
  const items = raw.items.map(item => {
    const p = item?.pedal;
    if (!item || !text(item.id, 100) || ids.has(item.id) || !p || !text(p.id, 100) || !text(p.name, 40) || !text(p.brand, 40) || !text(p.subtitle, 60) || !text(p.category, 20) || !num(p.width, 20, 400) || !num(p.height, 20, 500) || !/^#[a-f0-9]{6}$/i.test(p.color) || !num(item.x, -2000, 3000) || !num(item.y, -2000, 2000) || !num(item.rotation, 0, 270) || item.rotation % 90 !== 0) fail();
    ids.add(item.id);
    const known = CATALOG.find(entry => entry.id === p.id);
    // Imported strings never become markup or arbitrary URLs. Only catalog sources survive.
    return { id: item.id, pedal: { id: p.id, brand: p.brand, name: p.name, subtitle: p.subtitle, category: p.category,
      width: p.width, height: p.height, color: p.color, ink: known?.ink ?? '#302c35',
      style: known?.style ?? 'custom', source: known?.source ?? null }, x: round(item.x), y: round(item.y), rotation: item.rotation };
  });
  return { schemaVersion: 1, name: raw.name.trim(), width: raw.width, height: raw.height, items };
}
