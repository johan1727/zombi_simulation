import type { Rng } from './rng';
import type { Citizen, Personality } from './types';
import type { Building, CityLayout } from './cityGen';
import { corridorCenter, corridorIndexAt } from './cityGen';
import { CITY, CITY_WIDTH, CITY_DEPTH, CITY_PERIOD, CITIZENS, CITIZENS_INDOOR, DT, HERIDAS, TICK_RATE } from './config';

export const NOMBRES = [
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

/** Separación del muro real para un punto interior "razonable" al nacer
 * (mismo espíritu que MARGEN_PARED en interior.ts, duplicado a propósito
 * para no crear un acoplamiento citizens.ts↔interior.ts por una constante). */
const MARGEN_INTERIOR_NACER = 1;

/** Mismo patrón de "candidatos por bloque" que `refugio.ts` usa para buscar
 * puertas cercanas, pero sin exigir estar a distancia de entrada de una: acá
 * solo hace falta un edificio jugable cercano a una posición de calle recién
 * calculada, para que una familia completa nazca ya adentro. */
function edificioJugableCercano(city: CityLayout, x: number, z: number): Building | null {
  const bx = Math.floor(x / CITY_PERIOD);
  const bz = Math.floor(z / CITY_PERIOD);
  const candidatos: ReadonlyArray<readonly [number, number]> = [
    [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
  ];
  for (const [ix, iz] of candidatos) {
    if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
    const b = city.buildings[ix * CITY.blocksY + iz];
    if (b.kind === 'jugable') return b;
  }
  return null;
}

/** Posición interior "razonable" (no en la puerta exacta) para el miembro
 * `offset` de una familia dentro de `b`: centro del edificio con un pequeño
 * desvío por miembro, siempre dentro de los márgenes reales. */
function posicionInteriorFamilia(b: Building, offset: number): { x: number; z: number } {
  const minX = b.x + MARGEN_INTERIOR_NACER;
  const maxX = b.x + b.width - MARGEN_INTERIOR_NACER;
  const minZ = b.z + MARGEN_INTERIOR_NACER;
  const maxZ = b.z + b.depth - MARGEN_INTERIOR_NACER;
  const x = Math.min(Math.max(b.x + b.width / 2 + offset * 1.0, minX), maxX);
  const z = Math.min(Math.max(b.z + b.depth / 2, minZ), maxZ);
  return { x, z };
}

export function spawnCitizens(rng: Rng, count: number, city: CityLayout): Citizen[] {
  const citizens: Citizen[] = [];
  let grupoRestante = 0;
  let apellidoGrupo = '';
  let familiaId = -1;
  let siguienteFamilia = 0;
  let cabezaActual = -1;

  for (let i = 0; i < count; i++) {
    if (grupoRestante === 0) {
      const r = rng.next();
      grupoRestante = r < 0.45 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : 4;
      apellidoGrupo = rng.pick(APELLIDOS);
      familiaId = grupoRestante > 1 ? siguienteFamilia++ : -1;
      cabezaActual = i;
    }

    let x: number;
    let z: number;
    let dirX = 0;
    let dirZ = 0;
    let laneOffset: number;
    let dentroDe = -1;

    if (i === cabezaActual) {
      // la cabeza elige calle como siempre
      const vertical = rng.chance(0.5);
      laneOffset = (rng.next() - 0.5) * (CITY.streetWidth - LANE_MARGIN * 2);
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
      // una fracción de las familias (o solitarios: una "familia" de uno)
      // arranca ya adentro de un edificio jugable cercano a su calle —
      // misma rng que el resto de decisiones de esta función, sin stream
      // propio (parte de la misma familia de decisiones de inicialización).
      if (rng.chance(CITIZENS_INDOOR.fraccionFamiliasEnCasa)) {
        const b = edificioJugableCercano(city, x, z);
        if (b) {
          dentroDe = b.id;
          const pos = posicionInteriorFamilia(b, 0);
          x = pos.x;
          z = pos.z;
        }
      }
    } else {
      const cabeza = citizens[cabezaActual];
      if (cabeza.dentroDe >= 0) {
        // la cabeza nació adentro: toda la familia entra con ella, mismo edificio.
        const b = city.buildings[cabeza.dentroDe];
        dentroDe = cabeza.dentroDe;
        laneOffset = cabeza.laneOffset;
        dirX = cabeza.dirX;
        dirZ = cabeza.dirZ;
        const pos = posicionInteriorFamilia(b, i - cabezaActual);
        x = pos.x;
        z = pos.z;
      } else {
        // los familiares nacen pegados a la cabeza, sobre su misma calle
        const paso = (i - cabezaActual) * 1.5;
        laneOffset = cabeza.laneOffset;
        x = Math.min(Math.max(cabeza.x + cabeza.dirX * paso, 1), CITY_WIDTH - 1);
        z = Math.min(Math.max(cabeza.z + cabeza.dirZ * paso, 1), CITY_DEPTH - 1);
        dirX = cabeza.dirX;
        dirZ = cabeza.dirZ;
      }
    }

    citizens.push({
      id: i,
      name: `${rng.pick(NOMBRES)} ${apellidoGrupo}`,
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
      salud: 'sano',
      incubacionTicks: 0,
      animo: 'tranquilo',
      animoTicks: 0,
      dentroDe,
      piso: 0,
      pisoObjetivo: 0,
      escaleraTicks: 0,
      cdMordida: 0,
      familia: familiaId,
      cabezaFamilia: cabezaActual,
      familiares: [],
      esAgente: false,
      rolAgente: '',
      ordenX: NaN,
      ordenZ: NaN,
      caidoTicks: 0,
      cdHabilidad: 0,
      diagnosticadoTicks: 0,
      forzadoX: NaN,
      forzadoZ: NaN,
      forzadoTicks: 0,
      zonaHerida: '',
      ventanaAmputarTicks: 0,
      brazoAmputado: false,
      ticksSprintando: 0,
      corriendoOrden: false,
      ordenControl: false,
    });
    grupoRestante--;
  }

  // llenar familiares (dos bucles por índice; nada de Map)
  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    if (c.familia < 0) continue;
    for (let j = 0; j < citizens.length; j++) {
      if (j !== i && citizens[j].familia === c.familia) c.familiares.push(j);
    }
  }
  // el último grupo del array puede quedar cortado por el límite `count`
  // (p. ej. arranca en el penúltimo índice con tamaño 4 pero solo cabe 1):
  // esos huérfanos sin familiares reales vuelven a ser "solo".
  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    if (c.familia >= 0 && c.familiares.length === 0) {
      c.familia = -1;
      c.cabezaFamilia = c.id;
    }
  }
  return citizens;
}

/** Probabilidad de girar al entrar a un cruce. */
const CRUCE_GIRO = 0.45;
/** Probabilidad por tick de pararse a mirar (≈2.4%/seg). */
const PAUSA_POR_TICK = 0.0008;

export function updateCitizen(
  c: Citizen,
  rng: Rng,
  factorVelocidad = 1,
  peligroEn?: (x: number, z: number) => number
): void {
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

  const factorFractura = c.zonaHerida === 'pierna' ? HERIDAS.factorVelocidadFractura : 1;
  const paso = CITIZENS.walkSpeed * DT * factorVelocidad * factorFractura;
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
      const quiereGirar = rng.chance(CRUCE_GIRO);
      let giroForzado = 0; // 0 = no; ±1 = sentido forzado por peligro
      if (peligroEn) {
        const pFrente = peligroEn(c.x + c.dirX * CITY_PERIOD, c.z + c.dirZ * CITY_PERIOD);
        // las dos perpendiculares al eje de marcha
        const pA = c.dirZ !== 0 ? peligroEn(c.x - CITY_PERIOD, c.z) : peligroEn(c.x, c.z - CITY_PERIOD);
        const pB = c.dirZ !== 0 ? peligroEn(c.x + CITY_PERIOD, c.z) : peligroEn(c.x, c.z + CITY_PERIOD);
        if (Math.min(pA, pB) + 20 < pFrente) giroForzado = pA <= pB ? -1 : 1;
      }
      if (giroForzado !== 0 || quiereGirar) {
        if (c.dirZ !== 0) {
          // Iba en vertical → gira a horizontal por este cruce.
          c.z = corridorCenter(kz) + c.laneOffset;
          c.dirZ = 0;
          c.dirX = giroForzado !== 0 ? giroForzado : rng.chance(0.5) ? 1 : -1;
        } else {
          // Iba en horizontal → gira a vertical.
          c.x = corridorCenter(kx) + c.laneOffset;
          c.dirX = 0;
          c.dirZ = giroForzado !== 0 ? giroForzado : rng.chance(0.5) ? 1 : -1;
        }
      }
    }
  }
}
