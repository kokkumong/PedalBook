import * as THREE from 'three';
import type { RockboardProfile } from '../../domain/rockboard.ts';
import { rockboardAngle, rockboardBaseHeight, rockboardBays, rockboardBraces, rockboardSlotRuns, ROCKBOARD_SHEET_MM as SHEET, ROCKBOARD_FOOT_MM as FOOT } from '../../domain/rockboard.ts';

function polygon(points: number[][]) {
  return new THREE.Shape(points.map(([x,y]) => new THREE.Vector2(x,y)));
}
function rectangle(x: number, y: number, w: number, h: number) {
  return polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
}
function slot(x: number, y: number, w: number, h: number, radius = 2) {
  const r = Math.min(radius, w/2, h/2), p = new THREE.Path();
  p.moveTo(x+r,y); p.lineTo(x+w-r,y); p.quadraticCurveTo(x+w,y,x+w,y+r);
  p.lineTo(x+w,y+h-r); p.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  p.lineTo(x+r,y+h); p.quadraticCurveTo(x,y+h,x,y+h-r);
  p.lineTo(x,y+r); p.quadraticCurveTo(x,y,x+r,y);
  return new THREE.Path(p.getPoints(3).reverse());
}
const extrude = (shape: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3, steps: 1 });

export function createRockboardGeometry(profile: RockboardProfile) {
  const root = new THREE.Group(); root.name = `rockboard:${profile.slug}`;
  const clearance = new THREE.Group(); clearance.name = 'official-cavity-envelopes'; clearance.visible = false;
  const angle = rockboardAngle(profile), cos = Math.cos(angle), slope = Math.tan(angle);
  const base = rockboardBaseHeight(profile), w = profile.widthMm, d = profile.depthMm;
  const zAt = (yMm: number) => yMm - d/2;
  const topAt = (yMm: number, upper = !!profile.step && yMm <= profile.step.depthMm) => base - (yMm - d/2) * slope + (upper ? profile.step!.riseMm : 0);
  const metal = () => new THREE.MeshStandardMaterial({ color: '#303534', metalness: .45, roughness: .56 });
  const add = (geometry: THREE.BufferGeometry, name: string, material: THREE.Material = metal()) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 35), new THREE.LineBasicMaterial({ color: '#7b8580', transparent: true, opacity: .32 }));
    edges.name = `${name}:edges`; root.add(edges);
    return mesh;
  };

  // Actual through-slots in an extruded sheet; no photograph conceals the underside.
  const runs = rockboardSlotRuns(w - (profile.step ? 6 : 0));
  const segments = profile.step ? [
    { start: 0, end: profile.step.depthMm, rows: 4, raised: profile.step.riseMm },
    { start: profile.step.depthMm, end: d, rows: 6, raised: 0 },
  ] : [{ start: 0, end: d, rows: profile.slotRows, raised: 0 }];
  for (const segment of segments) {
    const shape = rectangle(-w/2, d/2 - segment.end, w, segment.end - segment.start);
    const rowMargin = (segment.end - segment.start - (segment.rows-1)*47)/2;
    for (let row = 0; row < segment.rows; row++) {
      const y = segment.start + rowMargin + row*47;
      for (const run of runs[row%2]) shape.holes.push(slot(run.xMm-w/2+(profile.step ? 3 : 0)-run.lengthMm/2, d/2-y-9, run.lengthMm, 18));
    }
    const geometry = extrude(shape, SHEET);
    // Product dimensions and saved mm are the top-view footprint. Shear the
    // sheet vertically instead of shrinking that footprint by cos(angle).
    geometry.rotateX(-Math.PI/2); geometry.translate(0,-SHEET/cos,0);
    geometry.applyMatrix4(new THREE.Matrix4().set(1,0,0,0, 0,1,-slope,0, 0,0,1,0, 0,0,0,1));
    geometry.translate(0,base+segment.raised,0);
    add(geometry, segment.raised ? 'upper-perforated-deck' : 'perforated-deck');
  }

  // Side walls are folded sheet profiles, open underneath. Shape X maps to -world Z.
  function sideShape(inner = false) {
    const offset = inner ? SHEET/cos + .2 : 0;
    const points = [[-zAt(d),FOOT],[-zAt(0),FOOT],[-zAt(0),topAt(0)-offset]];
    if (profile.step) {
      points.push([-zAt(profile.step.depthMm),topAt(profile.step.depthMm,true)-offset]);
      points.push([-zAt(profile.step.depthMm),topAt(profile.step.depthMm,false)-offset]);
    }
    points.push([-zAt(d),topAt(d)-offset]);
    return polygon(points);
  }
  for (const side of [-1,1]) {
    const shape = sideShape();
    // Cable/LED opening is a simplified detail; its diameter is not dimensioned.
    const hole = new THREE.Path();
    hole.absarc(-zAt(35), (FOOT + topAt(35))/2, 9, 0, Math.PI*2, true);
    shape.holes.push(hole);
    if (profile.step) shape.holes.push(slot(-zAt(profile.step.depthMm-15), FOOT+8, 163, 40.5));
    const geometry = extrude(shape,SHEET); geometry.rotateY(Math.PI/2); geometry.translate(side === -1 ? -w/2 : w/2-SHEET,0,0);
    add(geometry, side === -1 ? 'left-fold' : 'right-fold');
  }

  function crossWall(yMm: number, bottom: number, top: number, name: string, mods: boolean) {
    const shape = rectangle(-w/2+SHEET,bottom,w-2*SHEET,top-bottom);
    if (mods) for (const xMm of profile.modCentersMm) {
      // 163 x 40.5 mm MOD aperture; placement follows the schematic, rounded here.
      shape.holes.push(slot(xMm-w/2-81.5,bottom+8,163,40.5));
      if (profile.step) shape.holes.push(slot(xMm-w/2-81.5,bottom+8+60,163,40.5));
    }
    const geometry = extrude(shape,SHEET); geometry.translate(0,0,zAt(yMm) - (yMm === d ? SHEET : 0));
    add(geometry,name);
  }
  crossWall(0,FOOT,topAt(0),'rear-mod-panel',true);
  crossWall(d,FOOT,topAt(d),'front-fold',false);
  if (profile.step) crossWall(profile.step.depthMm,topAt(profile.step.depthMm,false),topAt(profile.step.depthMm,true),'riser-front',false);

  const braces = rockboardBraces(profile);
  for (const [index, xMm] of braces.entries()) {
    const x = xMm-w/2, braceWidth = profile.braceWidthMm;
    const bottom = rectangle(-braceWidth/2,-zAt(d)+3,braceWidth,zAt(d)-zAt(0)-6);
    for (const across of [-12,12]) for (let y = 40; y < d-20; y += 90) bottom.holes.push(slot(across-3,-zAt(y)-17,6,34,3));
    const geometry = extrude(bottom,SHEET); geometry.rotateX(-Math.PI/2); geometry.translate(x,FOOT,0);
    add(geometry,`brace-${index}:base`);
    for (const offset of [-braceWidth/2,braceWidth/2-SHEET]) {
      const side = sideShape(true);
      // Cable passages are schematic; exact fillets and fastening holes are omitted.
      for (let y = 35; y < d-20; y += 47) {
        const height = topAt(y)-FOOT-SHEET/cos;
        if (height > 23) side.holes.push(slot(-zAt(y)-9,topAt(y)-SHEET/cos-16,18,10));
      }
      const g = extrude(side,SHEET); g.rotateY(Math.PI/2); g.translate(x+offset,0,0);
      add(g,`brace-${index}:web`);
    }
  }
  // End flanges and feet remain separate from the central power-supply cavities.
  for (const side of [-1,1]) {
    const g = new THREE.BoxGeometry(18,SHEET,d-6);
    g.translate(side*(w/2-9),FOOT+SHEET/2,0); add(g,'end-flange');
  }
  for (const x of [-w/2+13,...braces.map(v=>v-w/2),w/2-13]) for (const z of [zAt(0)+12,zAt(d)-12]) {
    const g = new THREE.CylinderGeometry(8,10,FOOT,16); g.translate(x,FOOT/2,z);
    add(g,'rubber-foot',new THREE.MeshStandardMaterial({color:'#171c19',roughness:1}));
  }

  // The manufacturer's mm envelope is shown separately from illustrative hardware.
  // MAX has a conservative 175mm deep upper cavity and a 46mm step (E/F in its PDF).
  for (const bay of rockboardBays(profile)) {
    const inset = (d-profile.cavityDepthMm)/2;
    const cavitySegments = profile.step ? [
      { from: inset, to: inset+profile.step.cavityDepthMm, upper: true },
      { from: inset+profile.step.cavityDepthMm, to: d-inset, upper: false },
    ] : [{ from: inset, to: d-inset, upper: false }];
    for (const segment of cavitySegments) {
      const shape = polygon([
        [-zAt(segment.to),FOOT],[-zAt(segment.from),FOOT],
        [-zAt(segment.from),topAt(segment.from,segment.upper)-SHEET/cos],
        [-zAt(segment.to),topAt(segment.to,segment.upper)-SHEET/cos],
      ]);
      const geometry = extrude(shape,bay.widthMm);
      geometry.rotateY(Math.PI/2); geometry.translate(bay.xMm-w/2-bay.widthMm/2,0,0);
      const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#69d6c1',transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}));
      mesh.name = `cavity-${bay.index}`;
      clearance.add(mesh);
      clearance.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#8ef3d8',transparent:true,opacity:.85})));
    }
  }
  root.add(clearance);
  return { root, clearance };
}
