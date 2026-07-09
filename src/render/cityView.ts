import * as THREE from 'three';
import type { CityLayout, Building } from '../sim/cityGen';

/** ¿El segmento (x1,z1)→(x2,z2) cruza el rectángulo del edificio? (Liang-Barsky) */
function segmentoCruzaRect(x1: number, z1: number, x2: number, z2: number, b: Building): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - b.x, b.x + b.width - x1, z1 - b.z, b.z + b.depth - z1];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return false;
      continue;
    }
    const r = q[k] / p[k];
    if (p[k] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

export class CityView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly fondos: Building[];
  private readonly m = new THREE.Matrix4();
  private readonly aplanados = new Set<number>();

  constructor(scene: THREE.Scene, city: CityLayout) {
    this.fondos = city.buildings.filter((b) => b.kind === 'fondo');

    const suelo = new THREE.Mesh(
      new THREE.PlaneGeometry(city.width, city.depth),
      new THREE.MeshLambertMaterial({ color: 0x2b2f36 })
    );
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.set(city.width / 2, 0, city.depth / 2);
    scene.add(suelo);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, this.fondos.length);
    const colorFondo = new THREE.Color(0x3a4150);
    this.fondos.forEach((_b, i) => {
      this.setAltura(i, this.fondos[i].height);
      this.mesh.setColorAt(i, colorFondo);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  private setAltura(i: number, h: number): void {
    const b = this.fondos[i];
    this.m.makeScale(b.width, h, b.depth);
    this.m.setPosition(b.x + b.width / 2, h / 2, b.z + b.depth / 2);
    this.mesh.setMatrixAt(i, this.m);
  }

  /** Aplana a 3 m los edificios altos que cruzan la línea cámara→foco. */
  updateOcclusion(camX: number, camZ: number, focoX: number, focoZ: number): void {
    let sucio = false;
    this.fondos.forEach((b, i) => {
      const debe = b.height > 6 && segmentoCruzaRect(camX, camZ, focoX, focoZ, b);
      const estaba = this.aplanados.has(i);
      if (debe === estaba) return;
      if (debe) this.aplanados.add(i);
      else this.aplanados.delete(i);
      this.setAltura(i, debe ? 3 : b.height);
      sucio = true;
    });
    if (sucio) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
