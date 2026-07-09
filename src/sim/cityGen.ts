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
  return { width: CITY_WIDTH, depth: CITY_DEPTH, buildings };
}
