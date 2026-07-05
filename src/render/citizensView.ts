import * as THREE from 'three';
import type { Citizen } from '../sim/types';

export class CitizensView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.CapsuleGeometry(0.3, 1.1, 3, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    // Variación sutil y determinista de color por índice.
    const base = new THREE.Color(0x9fd8ff);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = ((i * 2654435761) >>> 0) / 4294967296;
      tmp.copy(base).offsetHSL((t - 0.5) * 0.08, 0, (t - 0.5) * 0.15);
      this.mesh.setColorAt(i, tmp);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  update(citizens: Citizen[], alpha: number): void {
    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i];
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      this.dummy.position.set(x, 0.85, z);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
