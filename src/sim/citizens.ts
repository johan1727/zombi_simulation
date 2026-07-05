import type { Rng } from './rng';
import type { Citizen, Personality } from './types';
import { corridorCenter } from './cityGen';
import { CITY, CITY_WIDTH, CITY_DEPTH } from './config';

const NOMBRES = [
  'María', 'José', 'Carmen', 'Luis', 'Ana', 'Miguel', 'Sofía', 'Carlos',
  'Elena', 'Diego', 'Lucía', 'Marcos', 'Valeria', 'Andrés', 'Paula', 'Jorge',
  'Rosa', 'Iván', 'Clara', 'Óscar', 'Nadia', 'Pedro', 'Irene', 'Tomás',
  'Alma', 'Bruno', 'Celia', 'Hugo', 'Noa', 'Raúl',
] as const;

const APELLIDOS = [
  'García', 'Smith', 'Rodríguez', 'Johnson', 'Lee', 'Martínez', 'Brown',
  'Nguyen', 'López', 'Cohen', 'Rivera', 'Kim', 'Torres', 'Murphy', 'Díaz',
  'Rossi', 'Chen', 'Álvarez', 'Novak', 'Silva',
] as const;

/** Pesos según el diseño (sección 3.1). */
const PERSONALIDADES: ReadonlyArray<readonly [Personality, number]> = [
  ['lider', 8],
  ['valiente', 12],
  ['protector', 20],
  ['egoista', 18],
  ['imprudente', 20],
  ['cobarde', 22],
];

export function pickPersonality(rng: Rng): Personality {
  const total = PERSONALIDADES.reduce((s, [, w]) => s + w, 0);
  let resto = rng.next() * total;
  for (const [p, w] of PERSONALIDADES) {
    resto -= w;
    if (resto < 0) return p;
  }
  return 'cobarde';
}

/** Margen para no caminar pegado al borde de la calle. */
const LANE_MARGIN = 1.2;

export function spawnCitizens(rng: Rng, count: number): Citizen[] {
  const citizens: Citizen[] = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng.chance(0.5);
    const laneOffset = (rng.next() - 0.5) * (CITY.streetWidth - LANE_MARGIN * 2);
    let x: number;
    let z: number;
    let dirX = 0;
    let dirZ = 0;
    if (vertical) {
      const k = rng.int(0, CITY.blocksX); // calles verticales: 0..blocksX
      x = corridorCenter(k) + laneOffset;
      z = 1 + rng.next() * (CITY_DEPTH - 2);
      dirZ = rng.chance(0.5) ? 1 : -1;
    } else {
      const k = rng.int(0, CITY.blocksY); // calles horizontales: 0..blocksY
      z = corridorCenter(k) + laneOffset;
      x = 1 + rng.next() * (CITY_WIDTH - 2);
      dirX = rng.chance(0.5) ? 1 : -1;
    }
    citizens.push({
      id: i,
      name: `${rng.pick(NOMBRES)} ${rng.pick(APELLIDOS)}`,
      personality: pickPersonality(rng),
      x,
      z,
      prevX: x,
      prevZ: z,
      dirX,
      dirZ,
      laneOffset,
      state: 'caminando',
      idleTicks: 0,
      lastCrossing: -1,
    });
  }
  return citizens;
}
