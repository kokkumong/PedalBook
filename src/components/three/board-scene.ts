import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boardModel, placementWarnings } from '../../domain/board.ts';
import type { Board, BoardItem, Point } from '../../domain/board.ts';
import { boardToWorld, worldToBoard, worldRotation, dragOnBoard, fitDistance, pedalElevation } from '../../domain/board-3d.ts';
import { catalogPhoto, containImage, PEDAL_PHOTOS, pedalPhoto } from '../../domain/photos.ts';
import { pedalImage } from '../../domain/artwork.ts';

type Callbacks = {
  onSelect: (id: string | null) => void;
  onMove: (id: string, point: Point) => void;
  onDragging: (dragging: boolean) => void;
  onZoom: (zoom: number) => void;
  onError: () => void;
};
type Visual = { group: THREE.Group; body: THREE.Mesh; outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>; key: string; dispose: () => void };
type Drag = { pointerId: number; item: BoardItem; board: Board; start: THREE.Vector3; plane: THREE.Plane; screenX: number; screenY: number; moved: boolean; point: Point };

function disposeTree(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      }
    }
  });
  root.removeFromParent();
}

// Requests only the same trusted image candidates as the 2D editor. Late loads
// cannot attach textures to disposed scenes when changing modes or deleting items.
function addPhoto(group: THREE.Group, width: number, depth: number, elevation: number, sources: string[], render: () => void) {
  let disposed = false;
  let image: HTMLImageElement | undefined;
  const load = (index: number) => {
    if (disposed || index >= sources.length) return;
    image = new Image();
    image.onload = () => {
      if (disposed || !image) return;
      const bounds = containImage(image.width, image.height, width, depth);
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(bounds.width, bounds.height), material);
      top.rotation.x = -Math.PI / 2;
      top.position.y = elevation + .15;
      group.add(top);
      render();
    };
    image.onerror = () => load(index + 1);
    image.src = sources[index];
  };
  load(0);
  return () => { disposed = true; if (image) { image.onload = null; image.onerror = null; } };
}

export function createBoardScene(host: HTMLDivElement, callbacks: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '3D 페달보드: 배경 드래그로 시점 회전, 페달 드래그로 이동');
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 50000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; // Render on change, not in an idle animation loop.
  controls.enablePan = false;
  controls.minPolarAngle = .04;
  controls.maxPolarAngle = Math.PI / 2 - .09;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .8;
  const ambient = new THREE.HemisphereLight(0xfff7e6, 0x788574, 2.6);
  scene.add(ambient);
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(-350, 850, 450);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -.0003;
  light.shadow.normalBias = .6;
  scene.add(light);
  const surface = new THREE.Group();
  scene.add(surface);
  const pedals = new Map<string, Visual>();
  const raycaster = new THREE.Raycaster();
  let board: Board | undefined;
  let surfaceKey = '';
  let cancelBoardPhoto: (() => void) | undefined;
  let grid: THREE.LineSegments | undefined;
  let drag: Drag | null = null;
  let snap = true;
  let disposed = false;
  let baseDistance = 1000;
  let zoom = 1;
  let frame = 0;
  const render = () => {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed) renderer.render(scene, camera);
    });
  };
  const change = () => {
    const next = baseDistance / camera.position.distanceTo(controls.target);
    if (Number.isFinite(next) && Math.abs(next - zoom) > .0001) {
      zoom = next;
      callbacks.onZoom(next);
    }
    render();
  };
  controls.addEventListener('change', change);

  function setZoom(next: number) {
    zoom = Math.min(2, Math.max(.5, next));
    camera.position.sub(controls.target).normalize().multiplyScalar(baseDistance / zoom).add(controls.target);
    controls.update();
    render();
  }
  function fit(reset = true) {
    if (!board) return;
    // Include oversized/outside items in the complete-board view.
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(surface);
    pedals.forEach(visual => bounds.expandByObject(visual.group));
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    baseDistance = fitDistance(sphere.radius, camera.aspect, camera.fov);
    const direction = reset ? new THREE.Vector3(.42, .95, 1.15).normalize() : camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(sphere.center);
    controls.minDistance = baseDistance / 2;
    controls.maxDistance = baseDistance * 2;
    camera.position.copy(controls.target).addScaledVector(direction, baseDistance / (reset ? 1 : zoom));
    zoom = reset ? 1 : zoom;
    controls.update();
    callbacks.onZoom(zoom);
    render();
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    fit(false);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  function rebuildSurface(next: Board) {
    cancelBoardPhoto?.();
    for (const child of [...surface.children]) disposeTree(child);
    const w = next.widthMm, d = next.heightMm;
    const material = new THREE.MeshStandardMaterial({ color: '#303a32', roughness: .8, metalness: .2 });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(w, 16, d, 2, 3), material);
    slab.position.y = -8;
    slab.receiveShadow = true;
    slab.castShadow = true;
    surface.add(slab);
    const model = boardModel(next);
    if (model) {
      const photo = catalogPhoto('boards', model.id);
      if (photo) cancelBoardPhoto = addPhoto(surface, w, d, 0, [photo.src], render);
    } else {
      const count = Math.max(2, Math.round(d / 62));
      for (let i = 1; i < count; i++) {
        const gap = new THREE.Mesh(new THREE.BoxGeometry(w - 12, .3, Math.min(10, d / count / 3)), new THREE.MeshStandardMaterial({ color: '#111a15', roughness: 1 }));
        gap.position.set(0, .2, -d / 2 + d * i / count);
        surface.add(gap);
      }
    }
    const vertices: number[] = [];
    for (let x = 0; x <= w; x += 25) vertices.push(x - w / 2, .6, -d / 2, x - w / 2, .6, d / 2);
    for (let z = 0; z <= d; z += 25) vertices.push(-w / 2, .6, z - d / 2, w / 2, .6, z - d / 2);
    grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), new THREE.LineBasicMaterial({ color: '#b9c7b0', transparent: true, opacity: .12 }));
    surface.add(grid);
    const size = Math.max(w, d) * .75 + 100;
    Object.assign(light.shadow.camera, { left: -size, right: size, top: size, bottom: -size, far: size * 6 });
    light.position.set(-size * .6, size * 2, size);
    light.shadow.camera.updateProjectionMatrix();
  }

  function createPedal(item: BoardItem, key: string): Visual {
    const { widthMm: width, heightMm: depth } = item.pedal;
    const elevation = pedalElevation(item.pedalId).mm;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(width, elevation, depth, 2, Math.min(3, width / 6, depth / 6)), new THREE.MeshStandardMaterial({ color: item.pedal.color, roughness: .65, metalness: .18 }));
    body.position.y = elevation / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.instanceId = item.instanceId;
    group.add(body);
    const outlineBox = new THREE.BoxGeometry(width + 4, elevation + 2, depth + 4);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(outlineBox), new THREE.LineBasicMaterial({ color: '#ffb68d' }));
    outlineBox.dispose();
    outline.position.y = elevation / 2;
    group.add(outline);
    const official = Object.hasOwn(PEDAL_PHOTOS, item.pedalId) ? PEDAL_PHOTOS[item.pedalId] : undefined;
    const local = official?.src.startsWith('/images/') ? official.src : undefined;
    const sources = [...new Set([pedalPhoto(item.pedal)?.src, local, pedalImage(item.pedal)].filter((src): src is string => !!src))];
    const cancel = addPhoto(group, width, depth, elevation, sources, render);
    scene.add(group);
    return { group, body, outline, key, dispose: () => { cancel(); disposeTree(group); } };
  }

  function update(next: Board, selectedId: string | null, showGrid: boolean, useSnap: boolean) {
    if (disposed) return;
    if (drag && next !== board) finishDrag(false);
    board = next;
    snap = useSnap;
    const nextKey = `${next.widthMm}/${next.heightMm}/${boardModel(next)?.id ?? ''}`;
    const changedSurface = nextKey !== surfaceKey;
    if (changedSurface) { surfaceKey = nextKey; rebuildSurface(next); }
    if (grid) grid.visible = showGrid;
    const ids = new Set(next.items.map(item => item.instanceId));
    for (const [id, visual] of pedals) if (!ids.has(id)) { visual.dispose(); pedals.delete(id); }
    const warnings = placementWarnings(next);
    for (const item of next.items) {
      const key = JSON.stringify(item.pedal);
      let visual = pedals.get(item.instanceId);
      if (!visual || visual.key !== key) {
        visual?.dispose();
        visual = createPedal(item, key);
        pedals.set(item.instanceId, visual);
      }
      if (drag?.item.instanceId !== item.instanceId) {
        const world = boardToWorld(item, next);
        visual.group.position.set(world.x, 0, world.z);
      }
      visual.group.rotation.y = worldRotation(item.rotationDeg);
      visual.outline.visible = selectedId === item.instanceId || warnings.ids.has(item.instanceId);
      visual.outline.material.color.set(selectedId === item.instanceId ? '#ffc098' : '#d19167');
    }
    if (changedSurface) { resize(); fit(); }
    render();
  }

  function setRay(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
  }
  function project(clientX: number, clientY: number): Point | undefined {
    if (!board || disposed) return;
    setRay(clientX, clientY);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit ? worldToBoard(hit, board) : undefined;
  }
  function down(event: PointerEvent) {
    if (drag) { event.stopImmediatePropagation(); return; }
    if (!board || !event.isPrimary || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
    setRay(event.clientX, event.clientY);
    const hit = raycaster.intersectObjects([...pedals.values()].map(v => v.body), false)[0];
    if (!hit) { callbacks.onSelect(null); return; }
    const item = board.items.find(i => i.instanceId === hit.object.userData.instanceId);
    if (!item) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    // Capture-phase interception keeps OrbitControls out of the pedal gesture.
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    drag = { pointerId: event.pointerId, item, board, start: hit.point.clone(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), screenX: event.clientX, screenY: event.clientY, moved: false, point: { xMm: item.xMm, yMm: item.yMm } };
    callbacks.onSelect(item.instanceId);
    callbacks.onDragging(true);
    host.parentElement?.focus({ preventScroll: true });
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopImmediatePropagation();
    if (!drag.moved && Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) < 3) return;
    setRay(event.clientX, event.clientY);
    const hit = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!hit) return;
    drag.moved = true;
    drag.point = dragOnBoard(drag.item, drag.board, drag.start, hit, snap);
    const world = boardToWorld(drag.point, drag.board);
    pedals.get(drag.item.instanceId)?.group.position.set(world.x, 0, world.z);
    render();
  }
  function finishDrag(commit: boolean) {
    const current = drag;
    if (!current) return;
    drag = null;
    controls.enabled = true;
    canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId);
    callbacks.onDragging(false);
    if (commit && current.moved) callbacks.onMove(current.item.instanceId, current.point);
    else {
      const world = boardToWorld(current.item, current.board);
      pedals.get(current.item.instanceId)?.group.position.set(world.x, 0, world.z);
      render();
    }
  }
  const up = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) { pointerMove(event); event.stopImmediatePropagation(); finishDrag(true); }
  };
  const cancel = (event: PointerEvent) => { if (drag?.pointerId === event.pointerId) finishDrag(false); };
  const blur = () => finishDrag(false);
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && drag) { event.stopImmediatePropagation(); finishDrag(false); } };
  const contextLost = (event: Event) => { event.preventDefault(); finishDrag(false); callbacks.onError(); };
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', pointerMove, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', cancel, true);
  canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('webglcontextlost', contextLost);
  window.addEventListener('blur', blur);
  window.addEventListener('keydown', escape, true);

  return {
    update, setZoom, fit, project,
    dispose() {
      finishDrag(false);
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', pointerMove, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('webglcontextlost', contextLost);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', escape, true);
      controls.removeEventListener('change', change);
      controls.dispose();
      cancelBoardPhoto?.();
      pedals.forEach(visual => visual.dispose());
      disposeTree(surface);
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
