import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, Vector3, Raycaster } from 'three';
import { BOSS_PROFILES, bossProfile } from '../src/domain/boss.ts';
import { pedalElevation } from '../src/domain/board-3d.ts';
import { createBossGeometry } from '../src/components/three/boss-geometry.ts';

test('five verified BOSS models have official height and unambiguous catalog identities',()=>{
  assert.equal(Object.keys(BOSS_PROFILES).length,5);
  for(const [id,profile] of Object.entries(BOSS_PROFILES)) {
    assert.equal(pedalElevation(id).mm,profile.heightMm); assert.equal(pedalElevation(id).estimated,false);
    assert.match(profile.sourceUrl,/^https:\/\/www\.boss\.info\/us\/products\//);
  }
  assert.equal(bossProfile('boss-ds1w'),undefined); assert.equal(bossProfile('toString'),undefined);
});
test('BOSS reconstructions fit their official envelope and controls are selectable meshes',()=>{
  for(const profile of Object.values(BOSS_PROFILES)) {
    const root=createBossGeometry(profile);root.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(root),size=bounds.getSize(new Vector3());
    for(const [actual,expected] of [[size.x,profile.widthMm],[size.y,profile.heightMm],[size.z,profile.depthMm],[bounds.min.y,0]]) assert.ok(Math.abs(actual-expected)<.001,`${profile.name}: ${actual} != ${expected}`);
    const parts:Mesh[]=[];root.traverse(part=>{if(part instanceof Mesh)parts.push(part);});
    assert.ok(parts.some(p=>p.name==='cast-housing'));
    assert.ok(parts.some(p=>p.name==='rubber-base'||p.name==='rubber-foot'));
    const knobs=parts.filter(p=>p.name==='knob');
    assert.equal(knobs.length,({ds1:3,ce2w:2,dd8:4,tu3:0,gt1000core:7})[profile.model]);
    assert.equal(parts.filter(p=>p.name==='footswitch-cap').length,profile.model==='gt1000core'?3:0);
    const control=knobs[0]??parts.find(p=>p.name==='tuner-bezel')!;
    const center=new Box3().setFromObject(control).getCenter(new Vector3());
    const ray=new Raycaster(new Vector3(center.x,100,center.z),new Vector3(0,-1,0));
    assert.ok(ray.intersectObjects(parts,false).length>0);
    for(const part of parts) {part.geometry.dispose();(Array.isArray(part.material)?part.material:[part.material]).forEach(m=>m.dispose());}
  }
});
