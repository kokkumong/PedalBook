import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { BossProfile } from '../../domain/boss.ts';

// Local axes: +Y is the control face, -Z is the rear, y=0 is the mounting base.
// Only the overall envelope is specified by BOSS. All subcomponents are visual approximations.
export type LabelFactory = (text: string, color: string, background?: string) => THREE.Texture;
export function createBossGeometry(profile: BossProfile, labelTexture?: LabelFactory) {
  const root = new THREE.Group(); root.name = `boss-${profile.model}`;
  const paint = new THREE.MeshStandardMaterial({color:profile.color,roughness:.48,metalness:.28});
  const rubber = new THREE.MeshStandardMaterial({color:'#17191b',roughness:.95});
  const silver = new THREE.MeshStandardMaterial({color:'#d1d5d8',roughness:.4,metalness:.35});
  const black = new THREE.MeshStandardMaterial({color:'#080b0e',roughness:.55});
  const red = new THREE.MeshStandardMaterial({color:'#e73832',emissive:'#af1006',emissiveIntensity:.4});
  function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number,y: number,z: number, parent=root) {
    const part = new THREE.Mesh(geometry,material); part.name=name; part.position.set(x,y,z);
    part.castShadow=true; part.receiveShadow=true; parent.add(part); return part;
  }
  function box(name: string,w: number,h: number,d: number,x: number,y: number,z: number,material: THREE.Material=paint,parent=root) {
    return mesh(name,new RoundedBoxGeometry(w,h,d,2,Math.min(.8,h/3)),material,x,y,z,parent);
  }
  function cylinder(name: string,r: number,h: number,x: number,y: number,z: number,material: THREE.Material=silver,parent=root,segments=24) {
    return mesh(name,new THREE.CylinderGeometry(r,r,h,segments),material,x,y,z,parent);
  }
  function label(text: string,w: number,d: number,x: number,y: number,z: number,color='#151b20',parent=root,background?: string) {
    if (!labelTexture) return;
    const material = new THREE.MeshBasicMaterial({map:labelTexture(text,color,background),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const part=mesh(`label-${text}`,new THREE.PlaneGeometry(w,d),material,x,y,z,parent);
    part.rotation.x=-Math.PI/2; part.castShadow=false;
  }
  // A side profile extruded across the width, with a bevel on the cast housing.
  function housing(w: number, points: [number,number][]) {
    const shape=new THREE.Shape(); points.forEach(([z,y],index)=>index ? shape.lineTo(-z,y) : shape.moveTo(-z,y)); shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:w-2,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:1,bevelThickness:1});
    geometry.rotateY(Math.PI/2); geometry.translate(-(w-2)/2,0,0);
    return mesh('cast-housing',geometry,paint,0,0,0);
  }
  function knob(x: number,z: number,r=9,base=44,height=15,capMaterial=silver) {
    cylinder('knob',r,height-1,x,base+(height-1)/2,z,black,root,32);
    cylinder('knob-cap',r*.77,1,x,base+height-.5,z,capMaterial);
    box('knob-pointer',1,.3,r*.6,x,base+height-.15,z-r*.36,black);
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6; cylinder('knob-grip',.7,height-4,x+Math.sin(a)*(r-.3),base+(height-4)/2+1,z+Math.cos(a)*(r-.3),rubber,root,6);
    }
  }
  function sideJack(side: -1|1,z: number) {
    const nut=cylinder('jack-nut',5.4,2,side*35.5,27,z,silver,root,6); nut.rotation.z=Math.PI/2;
    const hole=cylinder('jack-opening',3.3,.2,side*36.4,27,z,black); hole.rotation.z=Math.PI/2;
  }
  function rearJack(x: number,z: number,y: number) {
    const nut=cylinder('rear-jack',5,2,x,y,z,silver,root,6); nut.rotation.x=Math.PI/2;
    const hole=cylinder('rear-jack-opening',3.2,.2,x,y,z-1.05,black); hole.rotation.x=Math.PI/2;
  }

  if(profile.model === 'gt1000core') {
    housing(173,[[-63,3],[-63,46],[5,46],[63,37],[63,3]]);
    for(const x of [-70,70]) for(const z of [-51,51]) box('rubber-foot',12,2,12,x,1,z,rubber);
    box('display-bezel',112,1.4,38,-20,47,-32,black);
    box('display-glass',104,.4,31,-20,47.9,-32,new THREE.MeshStandardMaterial({color:'#5974a7',emissive:'#2a4267',emissiveIntensity:.45,roughness:.2}));
    label('01   PREMIUM DRIVE',99,18,-20,48.2,-32,'#ebf2ff');
    label('BOSS  GT-1000CORE',121,7,-18,47.2,-58,'#dee2e2');
    for(const x of [-66,-38,-10,18,46]) knob(x,-3,7.4,47,18);
    knob(64,-48,8,47,18); knob(67,-3,8,47,18);
    for(const [x,z] of [[51,-32],[70,-32],[51,-21],[70,-21],[51,-11]]) box('menu-button',7,2,3,x,48,z,rubber);
    for(const [i,x] of [-57,0,57].entries()) {
      const z=42, base=40.3;
      cylinder('footswitch-washer',7.5,1.8,x,base+1,z,silver,root,6);
      cylinder('footswitch-stem',3.4,9,x,base+6,z,silver);
      cylinder('footswitch-cap',6,3,x,base+12,z,silver);
      box('switch-led',15,.8,2,x,43,29,new THREE.MeshStandardMaterial({color:i===2?'#f15d4b':'#61d3ee',emissive:i===2?'#9a2114':'#168cbe',emissiveIntensity:.6}));
      label(['▼','▲','CTL 1'][i],20,6,x,43.4,24,'#e2e5e7');
    }
    for(const x of [-70,-51,-32,-13,6,25,44,63]) rearJack(x,-65,23);
    box('usb-port',7,3,1,77,26,-64.5,black);
    label('BOSS',54,17,0,2.1,0,'#72777b',root);
  } else {
    housing(69,[[-61,3],[-61,profile.model==='tu3'?54:43],[-17,43],[-10,32],[60,25],[60,3]]);
    box('rubber-base',65,2,118,0,1,0,rubber);
    const tread=new THREE.Group(); tread.name='hinged-pedal'; tread.position.set(0,37,19); tread.rotation.x=.075; root.add(tread);
    box('pedal-plate',65,4,82,0,0,0,paint,tread);
    box('rubber-tread',57,2,43,0,3,15,rubber,tread);
    label('BOSS',46,12,0,4.2,5,'#5a5e60',tread);
    const title={ds1:'Distortion',ce2w:'Chorus',dd8:'Digital Delay',tu3:'Chromatic Tuner'}[profile.model];
    const ink=profile.model==='dd8'?'#172953':profile.model==='tu3'?'#b43e2c':'#152530';
    label(title,56,10,0,2.2,-23,ink,tread);
    label(profile.name,25,6,17,2.2,-13,ink,tread);
    label('OUTPUT         INPUT',59,5,0,2.2,-35,ink,tread);
    for(const side of [-1,1] as const) {
      const hinge=cylinder('pedal-hinge',3,1.5,side*33,36,-17,black); hinge.rotation.z=Math.PI/2;
      sideJack(side,-13);
    }
    if(profile.model!=='ds1') sideJack(-1,8);
    if(profile.model==='dd8') {sideJack(1,8);sideJack(1,29);}
    const screw=cylinder('battery-thumb-screw',4,4,0,20,62.4,black);screw.rotation.x=Math.PI/2;
    box('dc-socket',9,8,1,0,29,-62.3,black);
    if(profile.model==='tu3') {
      const screen=new THREE.Group(); screen.name='tuner-panel'; screen.position.set(0,49,-42); screen.rotation.x=.27; root.add(screen);
      box('tuner-bezel',59,3,37,0,0,0,black,screen);
      label('−20      0      +20',51,5,0,1.7,-11,'#e7e9d9',screen);
      for(let i=0;i<21;i++) box('tuner-led',1.5,.4,3,(i-10)*2.3,1.8,-6+Math.abs(i-10)*.2,i===10?new THREE.MeshBasicMaterial({color:'#83e48e'}):red,screen);
      label('A',14,15,0,1.7,6,'#ff7070',screen);
      for(const x of [-23,23]) box('tuner-button',7,3,4,x,44.5,-20,rubber);
    } else {
      cylinder('check-led',1.8,1,0,44.5,-56,red);
      label('CHECK',12,4,0,44.2,-61);
      if(profile.model==='ds1') {
        knob(-20,-43);knob(20,-43);knob(0,-26,6,44,11);
        label('LEVEL          DIST',57,4,0,44.2,-31);label('TONE',15,4,0,44.2,-17);
      } else if(profile.model==='ce2w') {
        knob(-20,-43);knob(20,-43);
        label('RATE         DEPTH',54,5,0,44.2,-28);
        cylinder('mode-switch',1.2,5,0,46.5,-25,silver);
        label('WAZA CRAFT',34,5,0,4.2,27,'#acb0a8',tread);
      } else {
        box('control-panel',62,.2,40,0,44.1,-42,black);
        const blue=new THREE.MeshStandardMaterial({color:'#429eca',roughness:.4,metalness:.2});
        for(const x of [-24,-8,8,24]) knob(x,-42,6,44,15,blue);
        label('E.LEVEL  F.BACK  TIME  MODE',59,4,0,44.4,-55,'#e4e4dd');
        label('DIGITAL DELAY',45,4,0,44.4,-25,'#e4e4dd');
      }
    }
  }
  // Normalize the photographed reconstruction to the official overall envelope.
  const bounds=new THREE.Box3().setFromObject(root), size=bounds.getSize(new THREE.Vector3());
  root.position.set(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
  const normalized=new THREE.Group();normalized.name=root.name;normalized.add(root);
  normalized.scale.set(profile.widthMm/size.x,profile.heightMm/size.y,profile.depthMm/size.z);
  return normalized;
}

// Generated typography, not a downloaded/repackaged manufacturer photograph.
export function bossLabelTexture(text: string, color: string, background?: string) {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const context=canvas.getContext('2d')!;
  if(background) {context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);}
  context.fillStyle=color;context.font='600 78px Arial, sans-serif';context.textAlign='center';context.textBaseline='middle';
  context.fillText(text,384,66,740);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
