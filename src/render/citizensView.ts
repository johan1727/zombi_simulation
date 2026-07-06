import * as THREE from 'three';
import type { Citizen, Salud } from '../sim/types';

const COLORES: Record<Salud, number> = {
  sano: 0x9fd8ff,
  incubando: 0xffc46b,
  zombi: 0x8bff5a,
  eliminado: 0x8bff5a,
};

export class CitizensView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private readonly saludCache: Array<Salud | null>;

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.CapsuleGeometry(0.3, 1.1, 3, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.saludCache = new Array<Salud | null>(count).fill(null);
    scene.add(this.mesh);
  }

  update(citizens: Citizen[], alpha: number): void {
    let colorSucio = false;
    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i];
      const oculto = c.salud === 'eliminado' || c.dentroDe >= 0;
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      this.dummy.position.set(x, 0.85, z);
      this.dummy.scale.setScalar(oculto ? 0.0001 : 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      if (this.saludCache[i] !== c.salud) {
        this.saludCache[i] = c.salud;
        this.tmp.setHex(COLORES[c.salud]);
        this.mesh.setColorAt(i, this.tmp);
        colorSucio = true;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorSucio && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
