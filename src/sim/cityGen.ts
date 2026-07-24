import type { Rng } from './rng';
import { CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH, MARGEN_ACERA, INTERIOR } from './config';

export type BuildingKind = 'fondo' | 'jugable';

export interface Building {
  id: number;
  kind: BuildingKind;
  /** Esquina de menor x,z. */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  /** Solo jugables: hueco de entrada en el centro de una pared (lado 0=oeste, 1=norte, 2=este, 3=sur). */
  puerta?: { x: number; z: number; lado: 0 | 1 | 2 | 3 };
  /** Solo jugables: cuadro de escalera, SIEMPRE en la esquina sureste (nunca pisa la puerta: las puertas van al centro de pared). */
  escalera?: { x: number; z: number; width: number; depth: number };
}

export interface CityLayout {
  width: number;
  depth: number;
  buildings: Building[];
  /** Posiciones de autos estacionados (colisión real, Plan 19) — solo x/z:
   * el modelo/color es puramente visual y se deriva en `carsView.ts`. */
  readonly autos: ReadonlyArray<{ x: number; z: number }>;
}

/** true si (x,z) cae dentro de una banda de calle (y dentro del mapa). */
export function isStreet(x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= CITY_WIDTH || z >= CITY_DEPTH) return false;
  const fx = x % CITY_PERIOD;
  const fz = z % CITY_PERIOD;
  return fx < CITY.streetWidth || fz < CITY.streetWidth;
}

/** Centro de la calle k (k = 0..blocksX para verticales, 0..blocksY para horizontales). */
export function corridorCenter(k: number): number {
  return k * CITY_PERIOD + CITY.streetWidth / 2;
}

/** Índice de la calle que contiene la coordenada v, o -1 si v está en una manzana. */
export function corridorIndexAt(v: number): number {
  const k = Math.floor(v / CITY_PERIOD);
  return v - k * CITY_PERIOD < CITY.streetWidth ? k : -1;
}

export function generateCity(rng: Rng): CityLayout {
  const buildings: Building[] = [];
  const margin = MARGEN_ACERA;
  let id = 0;
  for (let bx = 0; bx < CITY.blocksX; bx++) {
    for (let bz = 0; bz < CITY.blocksY; bz++) {
      const x0 = CITY.streetWidth + bx * CITY_PERIOD;
      const z0 = CITY.streetWidth + bz * CITY_PERIOD;
      const kind: BuildingKind = rng.chance(0.4) ? 'jugable' : 'fondo';
      const height = kind === 'jugable' ? rng.int(8, 12) : rng.int(30, 120);
      const b: Building = {
        id: id++,
        kind,
        x: x0 + margin,
        z: z0 + margin,
        width: CITY.blockSize - margin * 2,
        depth: CITY.blockSize - margin * 2,
        height,
      };
      if (kind === 'jugable') {
        const lado = rng.int(0, 3) as 0 | 1 | 2 | 3;
        const PUERTAS: ReadonlyArray<readonly [number, number]> = [
          [b.x, b.z + b.depth / 2], // oeste
          [b.x + b.width / 2, b.z], // norte
          [b.x + b.width, b.z + b.depth / 2], // este
          [b.x + b.width / 2, b.z + b.depth], // sur
        ];
        b.puerta = { x: PUERTAS[lado][0], z: PUERTAS[lado][1], lado };
        b.escalera = {
          x: b.x + b.width - INTERIOR.escaleraLado,
          z: b.z + b.depth - INTERIOR.escaleraLado,
          width: INTERIOR.escaleraLado,
          depth: INTERIOR.escaleraLado,
        };
      }
      buildings.push(b);
    }
  }
  const autos = posicionesAutos(buildings).map(({ x, z }) => ({ x, z }));
  return { width: CITY_WIDTH, depth: CITY_DEPTH, buildings, autos };
}

// ——— Plan 19: autos estacionados (deterministas, sin RNG — movidos desde
// `src/render/carsView.ts` para que la sim los trate como obstáculo real). ———

/** Nombres de archivo (sin extensión) de los 7 autos decorativos disponibles. */
export const MODELOS_AUTOS = [
  'ambulance', 'hatchback-sports', 'police', 'sedan', 'suv', 'taxi', 'van',
] as const;

/** Autos que van estacionados en la cuadra `bloqueIndex`: 2 en cuadras pares, 1 en impares
 * (determinista, sin aleatoriedad, igual espíritu que `elegirModelo` en buildingModels.ts). */
export function autosPorCuadra(bloqueIndex: number): 1 | 2 {
  return bloqueIndex % 2 === 0 ? 2 : 1;
}

/** Modelo determinista por cuadra y puesto (0 o 1) dentro de la cuadra — puramente visual. */
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
 * de cada cuadra de `buildings` (siempre dentro de la banda de calle, nunca
 * sobre el footprint de un edificio ni sobre una puerta jugable).
 *
 * `bx` no se guarda en `Building`, así que se reconstruye a partir del
 * índice reproduciendo el orden EXACTO del doble bucle de `generateCity`
 * (`bx` externo, `bz` interno, `CITY.blocksY` iteraciones de `bz` por `bx`).
 */
export function posicionesAutos(buildings: readonly Building[]): AutoColocado[] {
  const autos: AutoColocado[] = [];
  buildings.forEach((b, bloqueIndex) => {
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
