import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CityLayout } from '../sim/cityGen';
import { corridorCenter } from '../sim/cityGen';
import { CITY } from '../sim/config';

/** Nombres de archivo (sin extensión) de los 7 autos decorativos disponibles. */
export const MODELOS_AUTOS = [
  'ambulance', 'hatchback-sports', 'police', 'sedan', 'suv', 'taxi', 'van',
] as const;

/** Autos que van estacionados en la cuadra `bloqueIndex`: 2 en cuadras pares, 1 en impares
 * (determinista, sin `Math.random`, igual espíritu que `elegirModelo` en buildingModels.ts). */
export function autosPorCuadra(bloqueIndex: number): 1 | 2 {
  return bloqueIndex % 2 === 0 ? 2 : 1;
}

/** Modelo determinista por cuadra y puesto (0 o 1) dentro de la cuadra. */
export function elegirAuto(bloqueIndex: number, puesto: number): string {
  return MODELOS_AUTOS[(bloqueIndex + puesto) % MODELOS_AUTOS.length];
}

export interface AutoColocado {
  nombre: string;
  x: number;
  z: number;
}

/** Separación desde el centro de la calle hacia el lado de la cuadra: deja al
 * auto "pegado" a la acera de su cuadra sin invadir el carril central ni
 * cruzar hacia la vereda/edificio (la calle mide `CITY.streetWidth`=8 m; la
 * cuadra empieza justo después, en `streetWidth + MARGEN_ACERA`). */
const OFFSET_BORDE = 2.5;

/** Margen desde cada borde de la cuadra (en el eje de la calle) para que
 * ningún auto quede cerca de una intersección — el cruce con la calle
 * perpendicular empieza justo `MARGEN_ACERA` (2 m) más allá del borde de la
 * cuadra, así que 8 m de margen deja de sobra ~10 m de aire hasta el cruce. */
const INSET_ESQUINA = 8;

/**
 * Posiciones deterministas de autos estacionados junto a la calle al OESTE
 * de cada cuadra de `city.buildings` (siempre dentro de la banda de calle,
 * nunca sobre el footprint de un edificio ni sobre una puerta jugable: la
 * banda de calle termina donde empieza la cuadra, con `OFFSET_BORDE` bien
 * adentro de ese límite — ver decisión en el reporte de la task).
 *
 * `bx`/`bz` no se guardan en `Building`, así que se reconstruyen a partir del
 * índice reproduciendo el orden EXACTO del doble bucle de `generateCity`
 * (`bx` externo, `bz` interno, `CITY.blocksY` iteraciones de `bz` por `bx`).
 */
export function posicionesAutos(city: CityLayout): AutoColocado[] {
  const autos: AutoColocado[] = [];
  city.buildings.forEach((b, bloqueIndex) => {
    const bx = Math.floor(bloqueIndex / CITY.blocksY);
    const calleX = corridorCenter(bx) + OFFSET_BORDE;
    const cantidad = autosPorCuadra(bloqueIndex);
    const zMin = b.z + INSET_ESQUINA;
    const zMax = b.z + b.depth - INSET_ESQUINA;
    for (let puesto = 0; puesto < cantidad; puesto++) {
      const t = cantidad === 1 ? 0.5 : (puesto + 1) / (cantidad + 1);
      const z = zMin + (zMax - zMin) * t;
      autos.push({ nombre: elegirAuto(bloqueIndex, puesto), x: calleX, z });
    }
  });
  return autos;
}

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
 * ya. SIN colisión, SIN AABB, SIN referencia a `src/sim` más allá de leer
 * `CityLayout` (datos, no lógica) — los ciudadanos/zombis/agentes caminan
 * "a través" de los autos, es una simplificación aceptada (ver brief).
 */
export class CarsView {
  constructor(scene: THREE.Scene, city: CityLayout, modelos: Map<string, THREE.Object3D>) {
    for (const auto of posicionesAutos(city)) {
      const base = modelos.get(auto.nombre);
      if (!base) throw new Error(`Modelo de auto no cargado: ${auto.nombre}`);
      const clon = base.clone(true);
      clon.position.set(auto.x, 0, auto.z);
      scene.add(clon);
    }
  }
}
