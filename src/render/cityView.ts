import * as THREE from 'three';
import type { CityLayout, Building } from '../sim/cityGen';
import { elegirModelo } from './buildingModels';

/** Edificios `fondo` a partir de esta altura (m) usan el pool de rascacielos.
 * cityGen genera `fondo` en [30, 120] m — un umbral bajo (p. ej. 12, la
 * altura de un `jugable`) mandaría TODOS los fondo al pool de rascacielos y
 * el pool `MODELOS_FONDO` nunca se usaría. 70 parte el rango a la mitad
 * (30-70 edificio normal, 70-120 rascacielos), dando una mezcla visible de
 * ambos pools en el skyline. */
const UMBRAL_RASCACIELOS = 70;

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
  private readonly fondos: Building[];
  /** Un `THREE.Object3D` real (clon de un GLB) por edificio de fondo. */
  private readonly grupos: THREE.Object3D[];
  /**
   * Escala Y que corresponde a la ALTURA COMPLETA de cada edificio (la que
   * tenía al construirse). Los modelos Kenney tienen el pivote en la base
   * (y=0), a diferencia del `BoxGeometry` centrado que usaba este archivo
   * antes — por eso aplanar/restaurar solo toca `scale.y` y NUNCA
   * `position.y` (con pivote en la base, escalar en Y ya deja la base en
   * el suelo, sin recentrar).
   */
  private readonly escalaYCompleta: number[];
  private readonly aplanados = new Set<number>();

  constructor(scene: THREE.Scene, city: CityLayout, modelos: Map<string, THREE.Object3D>) {
    this.fondos = city.buildings.filter((b) => b.kind === 'fondo');

    const suelo = new THREE.Mesh(
      new THREE.PlaneGeometry(city.width, city.depth),
      new THREE.MeshLambertMaterial({ color: 0x2b2f36 })
    );
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.set(city.width / 2, 0, city.depth / 2);
    scene.add(suelo);

    // Suelo extendido más allá del borde real de la ciudad (Plan 13): sin
    // esto, panear la cámara hasta el límite del mapa corta del suelo
    // (parcialmente neblinoso, todavía con silueta visible) a la nada
    // (color plano de fondo) de golpe — se ve como un muro. Reusa el MISMO
    // material que el suelo real (color idéntico, sin costear un segundo
    // material) y queda un poco más abajo en Y para no z-fighting con él.
    // MARGEN_SUELO_EXTENDIDO cubre de sobra el offset diagonal de la cámara
    // isométrica al zoom máximo (`MAX_DIST` en cameraRig.ts) desde una
    // esquina del mapa; junto con el fog más cercano (scene.ts) su propio
    // borde queda siempre oculto en la niebla, nunca visible.
    const MARGEN_SUELO_EXTENDIDO = 300;
    const sueloExtendido = new THREE.Mesh(
      new THREE.PlaneGeometry(city.width + MARGEN_SUELO_EXTENDIDO * 2, city.depth + MARGEN_SUELO_EXTENDIDO * 2),
      suelo.material
    );
    sueloExtendido.rotation.x = -Math.PI / 2;
    sueloExtendido.position.set(city.width / 2, -0.05, city.depth / 2);
    scene.add(sueloExtendido);

    this.escalaYCompleta = [];
    this.grupos = this.fondos.map((b) => {
      const nombre = elegirModelo(b.id, b.height > UMBRAL_RASCACIELOS);
      const base = modelos.get(nombre);
      if (!base) throw new Error(`Modelo de edificio no cargado: ${nombre}`);
      const clon = base.clone(true); // clone(true): recursivo, comparte geometría/material (barato)
      // Kenney exporta sus kits con el pivote en la base; reescalar al
      // footprint real del edificio (ancho/profundidad del layout) y a la
      // altura ya calculada por cityGen, igual que hacía BoxGeometry antes.
      const bbox = new THREE.Box3().setFromObject(clon);
      const tam = new THREE.Vector3();
      bbox.getSize(tam);
      const escalaY = b.height / tam.y;
      clon.scale.set(b.width / tam.x, escalaY, b.depth / tam.z);
      clon.position.set(b.x + b.width / 2, 0, b.z + b.depth / 2);
      scene.add(clon);
      this.escalaYCompleta.push(escalaY);
      return clon;
    });
  }

  /** Escala visualmente un edificio a la altura `h` (m), manteniendo la base en el suelo. */
  private setAltura(i: number, h: number): void {
    const b = this.fondos[i];
    this.grupos[i].scale.y = this.escalaYCompleta[i] * (h / b.height);
  }

  /** Aplana a 3 m los edificios altos que cruzan la línea cámara→foco. */
  updateOcclusion(camX: number, camZ: number, focoX: number, focoZ: number): void {
    this.fondos.forEach((b, i) => {
      const debe = b.height > 6 && segmentoCruzaRect(camX, camZ, focoX, focoZ, b);
      const estaba = this.aplanados.has(i);
      if (debe === estaba) return;
      if (debe) this.aplanados.add(i);
      else this.aplanados.delete(i);
      this.setAltura(i, debe ? 3 : b.height);
    });
  }
}
