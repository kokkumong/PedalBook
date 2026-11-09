import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boardModel, placementWarnings } from '../../domain/board.ts';
import type { Board, BoardItem, Point } from '../../domain/board.ts';
import { boardSurfaceAngle, boardSurfacePoint, surfaceToBoard, boardRockboard, pedalSurfacePoint, pedalCrossesStep, worldRotation, dragOnBoard, fitDistance, itemElevation, undersideWarnings } from '../../domain/board-3d.ts';
import { catalogPhoto, containImage, PEDAL_PHOTOS, pedalPhoto } from '../../domain/photos.ts';
import { pedalImage } from '../../domain/artwork.ts';
import { createPatchGeometry } from './patch-geometry.ts';
import { createRockboardGeometry } from './rockboard-geometry.ts';
import { bossProfile } from '../../domain/boss.ts';
import { bossLabelTexture, createBossGeometry } from './boss-geometry.ts';

type Callbacks = {
  onSelect: (id: string | null) => void;
  onMove: (id: string, point: Point) => void;
  onDragging: (dragging: boolean) => void;
  onZoom: (zoom: number) => void;
  onError: () => void;
  onViewSide: (side: 'top' | 'bottom') => void;
};
type Visual = { group: THREE.Group; pickMeshes: THREE.Mesh[]; outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>; key: string; dispose: () => void };
type Drag = { pointerId: number; item: BoardItem; board: Board; start: THREE.Vector3; plane: THREE.Plane; screenX: number; screenY: number; moved: boolean; point: Point };

function disposeTree(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
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
  let cables = new THREE.Group();
  scene.add(cables);
  let cableKey = '';
  const pedals = new Map<string, Visual>();
  const raycaster = new THREE.Raycaster();
  let board: Board | undefined;
  let surfaceKey = '';
  let cancelBoardPhoto: (() => void) | undefined;
  let grid: THREE.LineSegments | undefined;
  let clearance: THREE.Group | undefined;
  let showClearance = false;
  let structureTransparent = false;
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
    callbacks.onViewSide(surfaceNormal().dot(camera.position.clone().sub(controls.target)) < 0 ? 'bottom' : 'top');
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
    cancelBoardPhoto?.(); cancelBoardPhoto = undefined;
    for (const child of [...surface.children]) disposeTree(child);
    clearance = undefined;
    const w = next.widthMm, d = next.heightMm;
    const profile = boardRockboard(next);
    controls.maxPolarAngle = Math.PI - .04;
    if (profile) {
      const model = createRockboardGeometry(profile);
      surface.add(model.root);
      clearance = model.clearance;
      clearance.visible = showClearance;
    } else {
      const material = new THREE.MeshStandardMaterial({ color: '#303a32', roughness: .8, metalness: .2 });
      const slab = new THREE.Mesh(new RoundedBoxGeometry(w, 16, d, 2, 3), material);
      slab.position.y = -8; slab.receiveShadow = true; slab.castShadow = true;
      surface.add(slab);
      const model = boardModel(next);
      if (model) {
        const photo = catalogPhoto('boards', model.id);
        if (photo) cancelBoardPhoto = addPhoto(surface, w, d, 0, [photo.src], render);
      } else {
        const count = Math.max(2, Math.round(d / 62));
        for (let i = 1; i < count; i++) {
          const gap = new THREE.Mesh(new THREE.BoxGeometry(w - 12, .3, Math.min(10, d / count / 3)), new THREE.MeshStandardMaterial({ color: '#111a15', roughness: 1 }));
          gap.position.set(0, .2, -d / 2 + d * i / count); surface.add(gap);
        }
      }
    }
    const vertices: number[] = [];
    const line = (x1: number, y1: number, x2: number, y2: number, upper: boolean) => {
      for (const [xMm,yMm] of [[x1,y1],[x2,y2]]) {
        const p = boardSurfacePoint({ xMm,yMm },next,upper); vertices.push(p.x,p.y+.6,p.z);
      }
    };
    const regions = profile?.step ? [[0,profile.step.depthMm,true],[profile.step.depthMm,d,false]] as const : [[0,d,false]] as const;
    for (const [from,to,upper] of regions) {
      for (let x=0;x<=w;x+=25) line(x,from,x,to,upper);
      for (let y=Math.ceil(from/25)*25;y<=to;y+=25) line(0,y,w,y,upper);
    }
    grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices,3)), new THREE.LineBasicMaterial({ color:'#b9c7b0',transparent:true,opacity:.12 }));
    surface.add(grid);
    const size = Math.max(w,d)*.75+100;
    Object.assign(light.shadow.camera,{left:-size,right:size,top:size,bottom:-size,far:size*6});
    light.position.set(-size*.6,size*2,size); light.shadow.camera.updateProjectionMatrix();
    applyStructureOpacity();
  }

  function applyStructureOpacity() {
    surface.traverse(object=>{
      if (!(object instanceof THREE.Mesh) || object.parent === clearance) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const original = material.userData.originalAppearance ??= { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite };
        material.transparent = structureTransparent || original.transparent;
        material.opacity = structureTransparent ? .2 : original.opacity;
        material.depthWrite = structureTransparent ? false : original.depthWrite;
        material.needsUpdate = true;
      }
    });
  }

  function positionPedal(item: BoardItem, next: Board, group: THREE.Group) {
    const p = pedalSurfacePoint(item,next);
    group.position.set(p.x,p.y,p.z);
    group.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),boardSurfaceAngle(next));
    group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),worldRotation(item.rotationDeg)));
    if (item.mountSide === 'bottom') group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI));
  }

  function createPedal(item: BoardItem, key: string): Visual {
    const { widthMm: width, heightMm: depth } = item.pedal;
    const elevation = itemElevation(item).mm;
    const group = new THREE.Group();
    const profile = bossProfile(item.pedalId);
    let cancel = () => {};
    if (profile) {
      const model = createBossGeometry(profile,bossLabelTexture);
      // Preserve existing saved footprint, including older catalog dimensions.
      model.scale.multiply(new THREE.Vector3(width/profile.widthMm,elevation/profile.heightMm,depth/profile.depthMm));
      group.add(model);
    } else {
      const body = new THREE.Mesh(new RoundedBoxGeometry(width, elevation, depth, 2, Math.min(3, width / 6, depth / 6)), new THREE.MeshStandardMaterial({ color: item.pedal.color, roughness: .65, metalness: .18 }));
      body.position.y = elevation / 2; body.castShadow = true; body.receiveShadow = true; group.add(body);
      const official = Object.hasOwn(PEDAL_PHOTOS, item.pedalId) ? PEDAL_PHOTOS[item.pedalId] : undefined;
      const local = official?.src.startsWith('/images/') ? official.src : undefined;
      const sources = [...new Set([pedalPhoto(item.pedal)?.src, local, pedalImage(item.pedal)].filter((src): src is string => !!src))];
      cancel = addPhoto(group, width, depth, elevation, sources, render);
    }
    const pickMeshes: THREE.Mesh[] = [];
    group.traverse(part=>{if(part instanceof THREE.Mesh) {part.userData.instanceId=item.instanceId;pickMeshes.push(part);}});
    const outlineBox = new THREE.BoxGeometry(width + 4, elevation + 2, depth + 4);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(outlineBox), new THREE.LineBasicMaterial({ color: '#ffb68d' }));
    outlineBox.dispose();
    outline.position.y = elevation / 2;
    group.add(outline);
    scene.add(group);
    return { group, pickMeshes, outline, key, dispose: () => { cancel(); disposeTree(group); } };
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
      const key = JSON.stringify([item.pedal,itemElevation(item).mm]);
      let visual = pedals.get(item.instanceId);
      if (!visual || visual.key !== key) {
        visual?.dispose();
        visual = createPedal(item, key);
        pedals.set(item.instanceId, visual);
      }
      if (drag?.item.instanceId !== item.instanceId) {
        positionPedal(item,next,visual.group);
      }
      const stepWarning = pedalCrossesStep(item,next) || undersideWarnings(item,next).length > 0;
      visual.outline.visible = selectedId === item.instanceId || warnings.ids.has(item.instanceId) || stepWarning;
      visual.outline.material.color.set(selectedId === item.instanceId ? '#ffc098' : '#d19167');
    }
    const nextCableKey=JSON.stringify([next.widthMm,next.heightMm,next.modelId,next.cableLayout]);
    if(nextCableKey!==cableKey){cableKey=nextCableKey;disposeTree(cables);cables=createPatchGeometry(next);scene.add(cables);}
    if (changedSurface) { resize(); fit(); }
    render();
  }

  function setRay(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
  }
  function surfaceNormal() {
    const angle = board ? boardSurfaceAngle(board) : 0;
    return new THREE.Vector3(0,Math.cos(angle),Math.sin(angle));
  }
  function project(clientX: number, clientY: number): Point | undefined {
    if (!board || disposed) return;
    setRay(clientX, clientY);
    const step = boardRockboard(board)?.step;
    let fallback: Point | undefined;
    for (const upper of step ? [true,false] : [false]) {
      const p = boardSurfacePoint({ xMm:board.widthMm/2,yMm:board.heightMm/2 },board,upper);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(surfaceNormal(),new THREE.Vector3(p.x,p.y,p.z));
      const hit = raycaster.ray.intersectPlane(plane,new THREE.Vector3());
      if (!hit) continue;
      const point = surfaceToBoard(hit,board);
      if (!upper) fallback = point;
      if (point.yMm >= 0 && point.yMm <= board.heightMm && (!step || (upper ? point.yMm <= step.depthMm : point.yMm >= step.depthMm))) return point;
    }
    return fallback;
  }

  function down(event: PointerEvent) {
    if (drag) { event.stopImmediatePropagation(); return; }
    if (!board || !event.isPrimary || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
    const fromBelow = surfaceNormal().dot(camera.position.clone().sub(controls.target)) <= 0;
    setRay(event.clientX, event.clientY);
    const candidates = board.items.filter(item => (item.mountSide === 'bottom') === fromBelow).flatMap(item=>pedals.get(item.instanceId)!.pickMeshes);
    const hit = raycaster.intersectObjects(candidates, false)[0];
    if (!hit) { callbacks.onSelect(null); return; }
    const item = board.items.find(i => i.instanceId === hit.object.userData.instanceId);
    if (!item) return;
    // Solid folds/braces occlude equipment; transparent clearance overlays do not.
    const hardware: THREE.Mesh[] = [];
    surface.traverse(object => { if (object instanceof THREE.Mesh && object.parent !== clearance) hardware.push(object); });
    const obstruction = raycaster.intersectObjects(hardware,false)[0];
    if (!structureTransparent && obstruction && obstruction.distance < hit.distance - .1) { callbacks.onSelect(null); return; }
    event.stopImmediatePropagation();
    event.preventDefault();
    // Capture-phase interception keeps OrbitControls out of the pedal gesture.
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    drag = { pointerId: event.pointerId, item, board, start: hit.point.clone(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(surfaceNormal(),hit.point), screenX: event.clientX, screenY: event.clientY, moved: false, point: { xMm: item.xMm, yMm: item.yMm } };
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
    const visual = pedals.get(drag.item.instanceId);
    if (visual) positionPedal({ ...drag.item, ...drag.point },drag.board,visual.group);
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
      const visual = pedals.get(current.item.instanceId);
      if (visual) positionPedal(current.item,current.board,visual.group);
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
    setStructureTransparent(value: boolean) { structureTransparent = value; applyStructureOpacity(); render(); },
    setClearance(value: boolean) { showClearance = value; if (clearance) clearance.visible = value; render(); },
    viewUnderside() {
      if (!board) return;
      finishDrag(false); fit();
      camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(.35,-.9,1).normalize(),baseDistance);
      controls.update(); render();
    },
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
      disposeTree(cables);
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
