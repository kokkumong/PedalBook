import * as THREE from 'three';
import type { Board } from '../../domain/board.ts';
import { endpointWorld } from '../../domain/manual-cables.ts';

export function createPatchGeometry(board:Board) {
  const group=new THREE.Group();group.name='patch-cables';
  const layout=board.cableLayout;if(!layout?.visible)return group;
  for(const cable of layout.cables) {
    const a=endpointWorld(cable.start,cable.side,board),b=endpointWorld(cable.end,cable.side,board);
    const start=new THREE.Vector3(a.x,a.y,a.z),end=new THREE.Vector3(b.x,b.y,b.z),direction=end.clone().sub(start).normalize();
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(start,end),1,layout.cableDiameterMm/2,8,false),new THREE.MeshStandardMaterial({color:cable.color,roughness:.7}));
    tube.castShadow=true;group.add(tube);
    [start,end].forEach((p,i)=>{
      const axis=direction.clone().multiplyScalar(i===0?1:-1);
      const body=new THREE.Mesh(new THREE.CylinderGeometry(layout.plugWidthMm/2,layout.plugWidthMm/2,layout.plugLengthMm,12),new THREE.MeshStandardMaterial({color:'#bfc7bc',metalness:.6,roughness:.35}));
      body.position.copy(p).addScaledVector(axis,layout.plugLengthMm/2);body.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);body.castShadow=true;group.add(body);
    });
  }
  return group;
}
