import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CityLayout } from '../sim/cityGen';
import { MODELOS_AUTOS, autosPorCuadra, elegirAuto } from '../sim/cityGen';

/** Carga los 7 GLB de autos una sola vez; devuelve la escena por nombre (mismo patrón que `cargarModelosFondo`). */
export async function cargarModelosAutos(): Promise<Map<string, THREE.Object3D>> {
  const loader = new GLTFLoader();
  const entradas = await Promise.all(
    MODELOS_AUTOS.map(async (n) => {
      const gltf = await loader.loadAsync(`/models/props/autos/${n}.glb`);
      return [n, gltf.scene] as const;
    })
  );
  return new Map(entradas);
}

/**
 * Vista puramente decorativa: planta un clon de cada auto en su posición y
 * ya. Las posiciones (`x`/`z`) viven en `city.autos` (`src/sim/cityGen.ts`,
 * Plan 19) — la sim ya las trata como obstáculo real de colisión
 * (`src/sim/collision.ts`); esta vista solo LEE esas posiciones, nunca las
 * recalcula. El modelo/color de cada auto sigue siendo puramente visual
 * (`elegirAuto`, determinista por cuadra/puesto, sin RNG), así que se
 * re-deriva aquí recorriendo `city.buildings` en el MISMO orden en que
 * `posicionesAutos` construyó `city.autos` (un cursor lineal alcanza,
 * mismo patrón que usan los tests de `cityGen`).
 */
export class CarsView {
  constructor(scene: THREE.Scene, city: CityLayout, modelos: Map<string, THREE.Object3D>) {
    let cursor = 0;
    city.buildings.forEach((_b, bloqueIndex) => {
      const cantidad = autosPorCuadra(bloqueIndex);
      for (let puesto = 0; puesto < cantidad; puesto++) {
        const auto = city.autos[cursor];
        const nombre = elegirAuto(bloqueIndex, puesto);
        const base = modelos.get(nombre);
        if (!base) throw new Error(`Modelo de auto no cargado: ${nombre}`);
        const clon = base.clone(true);
        clon.position.set(auto.x, 0, auto.z);
        scene.add(clon);
        cursor++;
      }
    });
  }
}
