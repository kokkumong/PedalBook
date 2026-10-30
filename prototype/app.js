import { CATALOG, STORAGE_KEY, MAX_PEDALS, copy, round, defaultBoard, clampPosition, warnings, findFreePosition, validateBoard } from './model.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const uid = () => crypto.randomUUID();
let board = defaultBoard(), selectedId = board.items[1].id, zoom = 1, pan = { x: 0, y: 0 };
let category = '전체', snap = true, grid = true, drag = null, undoStack = [], redoStack = [];
let toastTimer, saveTimer, restoreError = false;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { board = validateBoard(JSON.parse(raw)); selectedId = null; }
} catch { restoreError = true; }

const selected = () => board.items.find(item => item.id === selectedId);
const toast = message => { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3000); };
function save() {
  clearTimeout(saveTimer);
  const status = $('#save-state');
  status.textContent = '저장 중'; status.classList.remove('error');
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); status.textContent = '자동 저장됨'; }
    catch { status.textContent = '저장 실패 · 파일로 내보내세요'; status.classList.add('error'); toast('브라우저 저장 공간을 사용할 수 없어요. 보드를 파일로 내보내 주세요.'); }
  }, 200);
}
function record(previous) {
  if (JSON.stringify(previous) === JSON.stringify(board)) return;
  undoStack.push(previous); if (undoStack.length > 60) undoStack.shift(); redoStack = []; save();
}
function change(fn) { const previous = copy(board); fn(); record(previous); render(); }

// Original vector sketches: no external product images or dependencies.
function pedalArt(p) {
  const w = p.width, h = p.height, ink = p.ink, cx = w / 2;
  const knob = (x, y, r = 6) => `<circle cx="${x}" cy="${y + .8}" r="${r + .6}" fill="#000" opacity=".18"/><circle cx="${x}" cy="${y}" r="${r}" fill="#242a29" stroke="#111" stroke-width=".6"/><path d="M${x} ${y - r + 1.5}v${r / 2}" stroke="#cdd3c8" stroke-width="1.1" stroke-linecap="round"/>`;
  const text = (x, y, content, size, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" ${extra.includes('fill=') ? '' : `fill="${ink}"`} ${extra}>${esc(content)}</text>`;
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
    detail += text(cx, h * .46, p.name.slice(0, 15), Math.min(9, w / 9), 'font-weight="700"') + text(cx, h * .54, 'CUSTOM PEDAL', Math.min(4, w / 16));
    detail += `<circle cx="${cx}" cy="${h * .79}" r="${Math.min(w * .13, 8)}" fill="#c9cbc3" stroke="#6c7165" stroke-width="1.5"/>`;
  }
  return `<rect width="${w}" height="${h}" rx="4" fill="${p.color}" stroke="#0005" stroke-width=".8"/><rect x="1.3" y="1.3" width="${w - 2.6}" height="${h - 2.6}" rx="3" fill="none" stroke="#fff4" stroke-width=".7"/>${detail}`;
}
const thumbnail = p => `<span class="thumbnail" aria-hidden="true"><svg viewBox="-2 -2 ${p.width + 4} ${p.height + 4}" xmlns="http://www.w3.org/2000/svg">${pedalArt(p)}</svg></span>`;

function renderCatalog() {
  const query = $('#search').value.toLowerCase().replace(/[\s-]/g, '');
  const pedals = CATALOG.filter(p => (category === '전체' || p.category === category) && `${p.brand}${p.name}${p.subtitle}${p.category}`.toLowerCase().replace(/[\s-]/g, '').includes(query));
  $('#catalog-count').textContent = CATALOG.length;
  $('#result-count').textContent = `${pedals.length} PEDALS`;
  $('#catalog').innerHTML = pedals.length ? pedals.map(p => `<button class="pedal-card" draggable="true" data-pedal="${p.id}" aria-label="${esc(p.brand)} ${esc(p.name)} 보드에 추가">${thumbnail(p)}<span class="card-copy"><span class="card-brand">${esc(p.brand)}</span><strong>${esc(p.name)}</strong><span class="card-category">${esc(p.category)} · ${p.width} × ${p.height}</span></span><span class="card-add" aria-hidden="true">＋</span></button>`).join('') : '<p class="empty-results">검색 결과가 없어요.<br>내 페달을 직접 추가해 보세요.</p>';
}

function renderFilters() {
  $('#filters').innerHTML = ['전체', ...new Set(CATALOG.map(p => p.category))].map(c => `<button class="filter ${c === category ? 'active' : ''}" data-category="${c}" aria-pressed="${c === category}">${c}</button>`).join('');
}

function renderBoard() {
  const svg = $('#board-canvas'), w = board.width, h = board.height;
  // Aspect-aware world viewport preserves mm geometry and fits rulers above/below the board.
  const ratio = (svg.clientWidth || 700) / (svg.clientHeight || 500);
  const worldWidth = Math.max(w + 130, (h + 145) * ratio) / zoom;
  const worldHeight = worldWidth / ratio;
  svg.setAttribute('viewBox', `${w / 2 - worldWidth / 2 + pan.x} ${h / 2 - worldHeight / 2 + pan.y} ${worldWidth} ${worldHeight}`);
  const warning = warnings(board);
  let marks = '';
  for (let x = 0; x <= w; x += 50) marks += `<path d="M${x} -16v${x % 100 === 0 ? -6 : -3}" stroke="#5f6c63" stroke-width=".6"/>${x % 100 === 0 ? `<text x="${x}" y="-30" text-anchor="middle" fill="#859583" font-size="6" font-family="monospace">${x}</text>` : ''}`;
  for (let y = 0; y <= h; y += 50) marks += `<path d="M-16 ${y}h${y % 100 === 0 ? -6 : -3}" stroke="#5f6c63" stroke-width=".6"/>${y % 100 === 0 ? `<text x="-29" y="${y + 2}" text-anchor="end" fill="#859583" font-size="6" font-family="monospace">${y}</text>` : ''}`;
  const railCount = Math.max(2, Math.round(h / 62)), gap = 13;
  const railH = (h - gap * (railCount - 1) - 10) / railCount;
  let rails = '';
  for (let i = 0; i < railCount; i++) rails += `<rect x="4" y="${5 + i * (railH + gap)}" width="${w - 8}" height="${railH}" rx="2" fill="url(#rail)" stroke="#535d55" stroke-width=".5"/>`;
  const corners = [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="#161d18" stroke="#798572" stroke-width=".5"/>`).join('');
  $('#scene').innerHTML = `${marks}<g filter="url(#board-shadow)"><rect width="${w}" height="${h}" rx="5" fill="#141b19" stroke="#626e63" stroke-width="1"/>${rails}${corners}</g>${grid ? `<rect width="${w}" height="${h}" rx="5" fill="url(#dots)" pointer-events="none"/>` : ''}<text x="${w - 14}" y="${h - 10}" text-anchor="end" fill="#7c8973" font-size="4.5" letter-spacing="1.8" font-family="monospace">PEDALBOOK / ${w} × ${h}</text>${board.items.map(item => {
    const p = item.pedal, isSelected = item.id === selectedId, hasWarning = warning.ids.has(item.id);
    return `<g data-instance="${esc(item.id)}" tabindex="0" role="button" aria-label="${esc(p.brand)} ${esc(p.name)}, ${item.rotation}도, 선택 및 이동" aria-pressed="${isSelected}" transform="translate(${item.x} ${item.y}) rotate(${item.rotation}) translate(${-p.width / 2} ${-p.height / 2})"><g filter="url(#pedal-shadow)">${pedalArt(p)}</g><rect class="pedal-outline" x="-4" y="-4" width="${p.width + 8}" height="${p.height + 8}" rx="6" fill="none" stroke="${isSelected ? '#f6ac83' : hasWarning ? '#b7785c' : 'transparent'}" stroke-width="${isSelected ? 1.6 : 1}" ${hasWarning && !isSelected ? 'stroke-dasharray="3 3"' : ''}/>${isSelected ? [[-4, -4], [p.width + 4, -4], [-4, p.height + 4], [p.width + 4, p.height + 4]].map(([x, y]) => `<rect x="${x - 1.8}" y="${y - 1.8}" width="3.6" height="3.6" rx=".8" fill="#ffba94"/>`).join('') : ''}</g>`;
  }).join('')}`;
  $('#board-dimensions').textContent = `${w} × ${h} MM`;
  $('#pedal-count').textContent = `${board.items.length}개 페달 배치됨`;
  $('#warning-count').textContent = [warning.pairs ? `겹침 ${warning.pairs}곳` : '', warning.outside ? `보드 밖 ${warning.outside}개` : ''].filter(Boolean).join(' · ');
  $('#zoom-value').textContent = `${Math.round(zoom * 100)}%`;
}

function renderSelection() {
  const item = selected(), container = $('#selection-content');
  $('#selection-badge').hidden = !item;
  if (!item) { container.innerHTML = '<div class="selection-empty"><span>⌖</span>보드 위 페달을 선택하면<br>자세히 살펴볼 수 있어요.</div>'; return; }
  const p = item.pedal;
  container.innerHTML = `<div class="selected-preview">${thumbnail(p)}<span class="card-copy"><span class="card-brand">${esc(p.brand)}</span><strong>${esc(p.name)}</strong><span class="card-category">${esc(p.subtitle)}</span></span></div><div class="selected-dimensions"><span>가로 × 세로</span><strong>${p.width} × ${p.height} mm</strong></div><div class="selected-controls"><button class="button light" data-action="rotate">↻ 90° 회전</button><button class="button light" data-action="duplicate">⧉ 복제</button><button class="button light full delete-button" data-action="remove" style="grid-column:1/-1">선택한 페달 삭제</button></div><div class="pedal-position"><span>X ${item.x}</span><span>Y ${item.y}</span><span>${item.rotation}°</span></div>${p.source ? `<a class="source-link" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">제조사 규격 참고 ↗</a>` : '<span class="source-link">직접 입력한 규격</span>'}`;
}

function render() {
  renderBoard(); renderSelection();
  $('#board-name').value = board.name;
  $('#board-width').value = board.width; $('#board-height').value = board.height;
  const preset = `${board.width},${board.height}`;
  $('#board-preset').value = ['450,250', '600,320', '800,400'].includes(preset) ? preset : 'custom';
  $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length;
}

function addPedal(pedal, position) {
  if (board.items.length >= MAX_PEDALS) { toast(`프로토타입은 최대 ${MAX_PEDALS}개까지 배치할 수 있어요.`); return; }
  change(() => {
    const item = { id: uid(), pedal: copy(pedal), x: 0, y: 0, rotation: 0 };
    Object.assign(item, position ? clampPosition(item, board, position.x, position.y, snap) : findFreePosition(item, board));
    board.items.push(item); selectedId = item.id;
  });
  toast(`${pedal.name} 페달을 추가했어요.`);
}
function act(action) {
  const item = selected(); if (!item) return;
  if (action === 'duplicate') { addPedal(item.pedal); return; }
  change(() => {
    if (action === 'remove') { board.items = board.items.filter(i => i.id !== item.id); selectedId = null; }
    if (action === 'rotate') { item.rotation = (item.rotation + 90) % 360; Object.assign(item, clampPosition(item, board, item.x, item.y)); }
  });
}
function history(direction) {
  const stack = direction === 'undo' ? undoStack : redoStack;
  if (!stack.length) return;
  (direction === 'undo' ? redoStack : undoStack).push(copy(board)); board = stack.pop();
  if (!selected()) selectedId = null;
  save(); render();
}
function resetView() { zoom = 1; pan = { x: 0, y: 0 }; renderBoard(); }
function pointerMm(event) {
  const svg = $('#board-canvas'), point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

$('#catalog').addEventListener('click', event => { const el = event.target.closest('[data-pedal]'); if (el) addPedal(CATALOG.find(p => p.id === el.dataset.pedal)); });
$('#catalog').addEventListener('dragstart', event => { const el = event.target.closest('[data-pedal]'); if (el) { event.dataTransfer.setData('application/x-pedalbook', el.dataset.pedal); event.dataTransfer.effectAllowed = 'copy'; } });
$('#filters').addEventListener('click', event => { const el = event.target.closest('[data-category]'); if (el) { category = el.dataset.category; renderFilters(); renderCatalog(); } });
$('#search').addEventListener('input', renderCatalog);
$('#viewport').addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('application/x-pedalbook')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
$('#viewport').addEventListener('drop', event => { const p = CATALOG.find(p => p.id === event.dataTransfer.getData('application/x-pedalbook')); if (p) { event.preventDefault(); addPedal(p, pointerMm(event)); } });

const canvas = $('#board-canvas');
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || drag) return;
  const el = event.target.closest('[data-instance]');
  const point = pointerMm(event);
  if (el) {
    selectedId = el.dataset.instance; const item = selected();
    drag = { id: event.pointerId, type: 'pedal', before: copy(board), startX: point.x, startY: point.y, x: item.x, y: item.y };
  } else { selectedId = null; if (zoom > 1) drag = { id: event.pointerId, type: 'pan', startX: event.clientX, startY: event.clientY, x: pan.x, y: pan.y, scale: canvas.getScreenCTM().a }; }
  canvas.focus({ preventScroll: true });
  if (drag) canvas.setPointerCapture(event.pointerId);
  renderBoard(); renderSelection();
});
canvas.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  if (drag.type === 'pan') { pan = { x: drag.x - (event.clientX - drag.startX) / drag.scale, y: drag.y - (event.clientY - drag.startY) / drag.scale }; renderBoard(); return; }
  const item = selected(); if (!item) return;
  const point = pointerMm(event);
  Object.assign(item, clampPosition(item, board, drag.x + point.x - drag.startX, drag.y + point.y - drag.startY, snap));
  renderBoard(); renderSelection();
});
function finishDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const previous = drag; drag = null;
  if (event.type === 'pointercancel' && previous.type === 'pedal') board = previous.before;
  else if (previous.type === 'pedal') record(previous.before);
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  render();
}
canvas.addEventListener('pointerup', finishDrag);
canvas.addEventListener('pointercancel', finishDrag);
canvas.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    const el = event.target.closest('[data-instance]');
    if (el) { event.preventDefault(); selectedId = el.dataset.instance; renderBoard(); renderSelection(); canvas.focus(); }
  }
});
$('#selection-content').addEventListener('click', event => { const el = event.target.closest('[data-action]'); if (el) act(el.dataset.action); });
$('#undo').addEventListener('click', () => history('undo')); $('#redo').addEventListener('click', () => history('redo'));
$('#zoom-in').addEventListener('click', () => { zoom = Math.min(2, Math.round((zoom + .25) * 100) / 100); renderBoard(); });
$('#zoom-out').addEventListener('click', () => { zoom = Math.max(.5, Math.round((zoom - .25) * 100) / 100); if (zoom <= 1) pan = { x: 0, y: 0 }; renderBoard(); });
$('#zoom-fit').addEventListener('click', resetView);
$('#grid-toggle').addEventListener('click', event => { grid = !grid; const b = event.currentTarget; b.classList.toggle('active', grid); b.setAttribute('aria-pressed', grid); renderBoard(); });
$('#snap-toggle').addEventListener('click', event => { snap = !snap; const b = event.currentTarget; b.classList.toggle('active', snap); b.setAttribute('aria-pressed', snap); });
$('#board-name').addEventListener('change', event => { const name = event.target.value.trim() || 'Untitled board'; change(() => { board.name = name; }); });
function resizeBoard(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 150 || w > 1500 || h < 150 || h > 1000) { toast('보드 가로는 150~1500mm, 세로는 150~1000mm로 입력해 주세요.'); return; }
  change(() => { board.width = w; board.height = h; board.items.forEach(item => Object.assign(item, clampPosition(item, board, item.x, item.y))); }); resetView();
}
$('#board-preset').addEventListener('change', event => { if (event.target.value !== 'custom') resizeBoard(...event.target.value.split(',').map(Number)); else $('#board-width').focus(); });
$('#board-size-form').addEventListener('submit', event => { event.preventDefault(); resizeBoard(Number($('#board-width').value), Number($('#board-height').value)); });

$('#export-button').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${board.name.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'pedalboard'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('보드를 JSON 파일로 내보냈어요.');
});
$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error('파일 크기는 256KB 이하로 선택해 주세요.');
    const next = validateBoard(JSON.parse(await file.text()));
    change(() => { board = next; selectedId = null; }); resetView(); toast('보드를 불러왔어요. 되돌리기로 이전 보드를 복구할 수 있어요.');
  } catch (error) { toast(error instanceof SyntaxError ? 'JSON 파일을 읽을 수 없어요.' : error.message); }
  event.target.value = '';
});

$('#custom-button').addEventListener('click', () => $('#custom-dialog').showModal());
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
$('#custom-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.target), name = data.get('name').trim();
  if (!name) return;
  const pedal = { id: `custom-${uid()}`, brand: 'CUSTOM', name, subtitle: '나의 커스텀 페달', category: '커스텀', width: Number(data.get('width')), height: Number(data.get('height')), color: data.get('color'), ink: '#302c35', style: 'custom', source: null };
  addPedal(pedal); $('#custom-dialog').close();
});

document.addEventListener('keydown', event => {
  if (event.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('dialog[open]') || drag) return;
  if (event.key === '/') { event.preventDefault(); $('#search').focus(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(event.shiftKey ? 'redo' : 'undo'); return; }
  if (event.key === 'Escape') { selectedId = null; renderBoard(); renderSelection(); return; }
  const item = selected(); if (!item) return;
  if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); act('rotate'); }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); act('remove'); }
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (delta) { event.preventDefault(); const step = event.shiftKey ? 5 : 1; change(() => Object.assign(item, clampPosition(item, board, item.x + delta[0] * step, item.y + delta[1] * step))); }
});
window.addEventListener('pagehide', () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); } catch { /* Existing visible save failure message handles this. */ } });
new ResizeObserver(renderBoard).observe($('#viewport'));
renderFilters(); renderCatalog(); render();
$('#save-state').textContent = '자동 저장 켜짐';
if (restoreError) toast('저장된 보드를 읽지 못해 샘플 보드를 열었어요. 파일 백업이 있다면 불러와 주세요.');
