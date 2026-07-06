import * as THREE from 'three';
import type { Splat } from '../sim/types';

const MAX = 3000;
const PALETA = [0xff3ea5, 0x3bff9d, 0x3ec9ff, 0xffe93e, 0xa63eff, 0xff6b3e];

/** Manchas de pintura en el suelo: la "sangre" del juego. */
export class SplatsView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private count = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CircleGeometry(0.7, 9);
    const mat = new THREE.MeshBasicMaterial({ depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    // La malla nace vacía: si Three.js calcula la esfera de culling en ese
    // primer frame, queda inválida (radio -1) para siempre y las manchas
    // futuras se recortan del frustum aunque estén a la vista. Se desactiva
    // el culling porque el conjunto crece con el tiempo y su extensión real
    // no se conoce de antemano.
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(splats: readonly Splat[]): void {
    const limite = Math.min(splats.length, MAX);
    if (this.count >= limite) return;
    while (this.count < limite) {
      const s = splats[this.count];
      this.dummy.position.set(s.x, 0.02 + this.count * 0.0002, s.z);
      this.dummy.rotation.set(-Math.PI / 2, 0, s.tono * Math.PI * 2);
      this.dummy.scale.setScalar(1.2 + s.tono * 1.6);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(this.count, this.dummy.matrix);
      this.tmp.setHex(PALETA[Math.floor(s.tono * PALETA.length) % PALETA.length]);
      this.mesh.setColorAt(this.count, this.tmp);
      this.count++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
