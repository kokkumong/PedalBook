import * as THREE from 'three';
import type { Board } from '../../domain/board.ts';
import { cableWorldPoints, patchCables, portWorld } from '../../domain/signal-chain.ts';

export function createPatchGeometry(board: Board) {
  const group=new THREE.Group();group.name='patch-cables';
  const chain=board.signalChain;if(!chain?.visible)return group;
  const vector=(p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x,p.y,p.z);
  for(const cable of patchCables(board)) {
    const points=cableWorldPoints(cable,board).map(vector);
    if(cable.routed) {
      const path=new THREE.CurvePath<THREE.Vector3>();
      for(let i=1;i<points.length;i++)if(points[i].distanceTo(points[i-1])>.001)path.add(new THREE.LineCurve3(points[i-1],points[i]));
      if(path.curves.length) {
        const mesh=new THREE.Mesh(new THREE.TubeGeometry(path,Math.max(24,Math.min(400,Math.ceil(path.getLength()/3))),chain.cableDiameterMm/2,8,false),new THREE.MeshStandardMaterial({color:cable.color,roughness:.7}));
        mesh.castShadow=true;group.add(mesh);
      }
    } else {
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:'#f18d7c',dashSize:5,gapSize:5}));line.computeLineDistances();group.add(line);
    }
    for(const port of [cable.from,cable.to]) {
      const start=vector(portWorld(port,board)),end=vector(portWorld(port,board,chain.plugLengthMm));
      const body=new THREE.Mesh(new THREE.CylinderGeometry(chain.plugWidthMm/2,chain.plugWidthMm/2,chain.plugLengthMm,12),new THREE.MeshStandardMaterial({color:cable.warnings.length?'#dca48b':'#bfc7bc',metalness:.65,roughness:.35}));
      body.position.copy(start).add(end).multiplyScalar(.5);body.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());body.castShadow=true;group.add(body);
    }
  }
  return group;
}
