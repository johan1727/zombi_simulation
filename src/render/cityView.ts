import * as THREE from 'three';
import type { CityLayout } from '../sim/cityGen';

export function buildCityView(scene: THREE.Scene, city: CityLayout): void {
  // Suelo: las calles son el plano base.
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(city.width, city.depth),
    new THREE.MeshLambertMaterial({ color: 0x2b2f36 })
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.set(city.width / 2, 0, city.depth / 2);
  scene.add(suelo);

  // Edificios instanciados: una sola llamada de dibujo para todos.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, city.buildings.length);
  const m = new THREE.Matrix4();
  const colorFondo = new THREE.Color(0x3a4150);
  const colorJugable = new THREE.Color(0x5a6b7d);
  city.buildings.forEach((b, i) => {
    m.makeScale(b.width, b.height, b.depth);
    m.setPosition(b.x + b.width / 2, b.height / 2, b.z + b.depth / 2);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, b.kind === 'jugable' ? colorJugable : colorFondo);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}
