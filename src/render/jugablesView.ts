import * as THREE from 'three';
import type { Building, CityLayout } from '../sim/cityGen';
import type { World } from '../sim/world';
import { INTERIOR } from '../sim/config';

const GROSOR = 0.3;
const COLOR_PARED = 0x5a6b7d;
const COLOR_LOSA = 0x49566b;
const COLOR_TECHO = 0x424e5f;
const COLOR_ESCALERA = 0x8091a5;

interface Piezas {
  techo: THREE.Mesh;
  ocultables: THREE.Mesh[];
}

export class JugablesView {
  private readonly piezas: Array<Piezas | null>;
  private readonly jugables: Building[];
  private readonly enAzotea: boolean[];

  constructor(scene: THREE.Scene, city: CityLayout) {
    this.piezas = city.buildings.map(() => null);
    this.jugables = city.buildings.filter((b) => b.kind === 'jugable');
    this.enAzotea = city.buildings.map(() => false);
    for (const b of this.jugables) scene.add(this.construir(b));
  }

  private construir(b: Building): THREE.Group {
    const g = new THREE.Group();
    const h = INTERIOR.alturaPiso;
    const matPared = new THREE.MeshLambertMaterial({ color: COLOR_PARED });
    const ocultables: THREE.Mesh[] = [];

    const losa = new THREE.Mesh(
      new THREE.BoxGeometry(b.width, 0.2, b.depth),
      new THREE.MeshLambertMaterial({ color: COLOR_LOSA })
    );
    losa.position.set(b.x + b.width / 2, h, b.z + b.depth / 2);
    g.add(losa);

    const techo = new THREE.Mesh(
      new THREE.BoxGeometry(b.width, 0.25, b.depth),
      new THREE.MeshLambertMaterial({ color: COLOR_TECHO })
    );
    techo.position.set(b.x + b.width / 2, h * 2, b.z + b.depth / 2);
    g.add(techo);

    for (let nivel = 0; nivel < 2; nivel++) {
      const y = nivel * h + h / 2;
      for (let lado = 0; lado < 4; lado++) {
        const conPuerta = nivel === 0 && b.puerta!.lado === lado;
        for (const [mx, mz, mw, md] of this.murosDeLado(b, lado, conPuerta)) {
          if (mw <= 0.01 || md <= 0.01) continue;
          const muro = new THREE.Mesh(new THREE.BoxGeometry(mw, h, md), matPared);
          muro.position.set(mx, y, mz);
          g.add(muro);
          if (lado === 0 || lado === 1) ocultables.push(muro); // caras a la cámara (yaw fijo 45°)
        }
      }
    }

    const e = b.escalera!;
    const esc = new THREE.Mesh(
      new THREE.BoxGeometry(e.width - 1, 1.2, e.depth - 1),
      new THREE.MeshLambertMaterial({ color: COLOR_ESCALERA })
    );
    esc.position.set(e.x + e.width / 2, 0.6, e.z + e.depth / 2);
    g.add(esc);

    this.piezas[b.id] = { techo, ocultables };
    return g;
  }

  /** Segmentos de muro [centroX, centroZ, anchoX, anchoZ] de un lado, con o sin hueco de puerta. */
  private murosDeLado(b: Building, lado: number, conPuerta: boolean): Array<[number, number, number, number]> {
    const p = b.puerta!;
    const medio = INTERIOR.anchoPuerta / 2;
    if (lado === 0 || lado === 2) {
      const x = lado === 0 ? b.x : b.x + b.width;
      if (!conPuerta) return [[x, b.z + b.depth / 2, GROSOR, b.depth]];
      const l1 = p.z - medio - b.z;
      const l2 = b.z + b.depth - (p.z + medio);
      return [
        [x, b.z + l1 / 2, GROSOR, l1],
        [x, p.z + medio + l2 / 2, GROSOR, l2],
      ];
    }
    const z = lado === 1 ? b.z : b.z + b.depth;
    if (!conPuerta) return [[b.x + b.width / 2, z, b.width, GROSOR]];
    const l1 = p.x - medio - b.x;
    const l2 = b.x + b.width - (p.x + medio);
    return [
      [b.x + l1 / 2, z, l1, GROSOR],
      [p.x + medio + l2 / 2, z, l2, GROSOR],
    ];
  }

  update(world: World, focoX: number, focoZ: number): void {
    this.enAzotea.fill(false);
    for (const c of world.citizens) {
      if (c.dentroDe >= 0 && c.piso === INTERIOR.azotea && c.salud !== 'eliminado') {
        this.enAzotea[c.dentroDe] = true;
      }
    }
    for (const b of this.jugables) {
      const activo =
        focoX >= b.x - 3 && focoX <= b.x + b.width + 3 &&
        focoZ >= b.z - 3 && focoZ <= b.z + b.depth + 3;
      const piezas = this.piezas[b.id]!;
      piezas.techo.visible = !activo || this.enAzotea[b.id];
      for (const m of piezas.ocultables) m.visible = !activo;
    }
  }
}
