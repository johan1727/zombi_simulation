import type { Rng } from './rng';
import type { Citizen, Personality } from './types';
import { corridorCenter, corridorIndexAt } from './cityGen';
import { CITY, CITY_WIDTH, CITY_DEPTH, CITIZENS, DT, TICK_RATE } from './config';

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

/** Probabilidad de girar al entrar a un cruce. */
const CRUCE_GIRO = 0.45;
/** Probabilidad por tick de pararse a mirar (≈2.4%/seg). */
const PAUSA_POR_TICK = 0.0008;

export function updateCitizen(c: Citizen, rng: Rng): void {
  c.prevX = c.x;
  c.prevZ = c.z;

  if (c.state === 'quieto') {
    c.idleTicks--;
    if (c.idleTicks <= 0) c.state = 'caminando';
    return;
  }

  if (rng.chance(PAUSA_POR_TICK)) {
    c.state = 'quieto';
    c.idleTicks = rng.int(CITIZENS.idleMin * TICK_RATE, CITIZENS.idleMax * TICK_RATE);
    return;
  }

  const paso = CITIZENS.walkSpeed * DT;
  c.x += c.dirX * paso;
  c.z += c.dirZ * paso;

  // Rebote en los límites del mapa.
  if (c.x < 1) { c.x = 1; c.dirX = 1; c.lastCrossing = -1; }
  if (c.x > CITY_WIDTH - 1) { c.x = CITY_WIDTH - 1; c.dirX = -1; c.lastCrossing = -1; }
  if (c.z < 1) { c.z = 1; c.dirZ = 1; c.lastCrossing = -1; }
  if (c.z > CITY_DEPTH - 1) { c.z = CITY_DEPTH - 1; c.dirZ = -1; c.lastCrossing = -1; }

  // Decisión única por cruce.
  const kx = corridorIndexAt(c.x);
  const kz = corridorIndexAt(c.z);
  if (kx >= 0 && kz >= 0) {
    const idCruce = kx * 1000 + kz;
    if (c.lastCrossing !== idCruce) {
      c.lastCrossing = idCruce;
      if (rng.chance(CRUCE_GIRO)) {
        if (c.dirZ !== 0) {
          // Iba en vertical → gira a horizontal por este cruce.
          c.z = corridorCenter(kz) + c.laneOffset;
          c.dirZ = 0;
          c.dirX = rng.chance(0.5) ? 1 : -1;
        } else {
          // Iba en horizontal → gira a vertical.
          c.x = corridorCenter(kx) + c.laneOffset;
          c.dirX = 0;
          c.dirZ = rng.chance(0.5) ? 1 : -1;
        }
      }
    }
  }
}
