import type { Building } from './cityGen';
import type { Citizen } from './types';
import type { World } from './world';
import { DIRECCIONES, DT, INFECCION, INTERIOR, INTERIOR_VISION, PANICO, ZOMBIS } from './config';
import { infectar } from './infeccion';

/** Normal hacia dentro del edificio, por lado de la puerta. */
export const NORMAL_INTERIOR: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // puerta oeste → dentro es +x
  [0, 1], // norte → +z
  [-1, 0], // este → -x
  [0, -1], // sur → -z
];

export function enEscalera(b: Building, x: number, z: number): boolean {
  const e = b.escalera!;
  return x >= e.x && x < e.x + e.width && z >= e.z && z < e.z + e.depth;
}

export function enPuerta(b: Building, x: number, z: number): boolean {
  const p = b.puerta!;
  const medio = INTERIOR.anchoPuerta / 2;
  if (p.lado === 0 || p.lado === 2) {
    return Math.abs(z - p.z) <= medio && Math.abs(x - p.x) <= 0.8;
  }
  return Math.abs(x - p.x) <= medio && Math.abs(z - p.z) <= 0.8;
}

const MARGEN_PARED = 0.3;

/** Movimiento dentro del edificio: perímetro sólido salvo el hueco de la puerta (solo piso 0). */
export function moverInterior(b: Building, c: Citizen, nx: number, nz: number): void {
  const minX = b.x + MARGEN_PARED;
  const maxX = b.x + b.width - MARGEN_PARED;
  const minZ = b.z + MARGEN_PARED;
  const maxZ = b.z + b.depth - MARGEN_PARED;
  const saldria = nx < minX || nx > maxX || nz < minZ || nz > maxZ;
  if (saldria && c.piso === 0 && enPuerta(b, nx, nz)) {
    const p = b.puerta!;
    const [inx, inz] = NORMAL_INTERIOR[p.lado];
    // salir SIEMPRE claramente fuera del muro real (la franja de 0.3 m de
    // MARGEN_PARED sigue siendo "dentro" para buildingAt): 0.5 m a la calle
    if (p.lado === 0 || p.lado === 2) {
      c.x = p.x - inx * 0.5;
      c.z = nz;
    } else {
      c.x = nx;
      c.z = p.z - inz * 0.5;
    }
    c.dentroDe = -1;
    c.pisoObjetivo = 0;
    return;
  }
  c.x = Math.min(Math.max(nx, minX), maxX);
  c.z = Math.min(Math.max(nz, minZ), maxZ);
}

/** En la escalera y con objetivo distinto: cambia de piso tras INTERIOR.escaleraTicks. */
export function avanzarEscalera(b: Building, c: Citizen): boolean {
  if (c.pisoObjetivo === c.piso || !enEscalera(b, c.x, c.z)) {
    c.escaleraTicks = 0;
    return false;
  }
  c.escaleraTicks++;
  if (c.escaleraTicks >= INTERIOR.escaleraTicks) {
    c.piso += c.pisoObjetivo > c.piso ? 1 : -1;
    c.escaleraTicks = 0;
  }
  return true; // subiendo: no se mueve
}

function haciaEscalera(b: Building, c: Citizen): void {
  const e = b.escalera!;
  const dx = e.x + e.width / 2 - c.x;
  const dz = e.z + e.depth / 2 - c.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0.001) {
    c.dirX = dx / len;
    c.dirZ = dz / len;
  }
}

export function updateInterior(c: Citizen, world: World): void {
  c.prevX = c.x;
  c.prevZ = c.z;
  const b = world.city.buildings[c.dentroDe];

  if (c.salud === 'zombi') {
    updateInteriorZombi(c, world, b);
    return;
  }

  let amenaza: Citizen | null = null;
  let mejorD2 = INTERIOR_VISION * INTERIOR_VISION;
  for (const i of world.dentroPorEdificio[b.id]) {
    const o = world.citizens[i];
    if (o.salud !== 'zombi' || o.piso !== c.piso) continue;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      amenaza = o;
    }
  }
  if (amenaza) {
    c.animo = 'panico';
    c.animoTicks = 0;
    if (c.piso === 0) {
      // huir por la puerta
      const p = b.puerta!;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
      c.pisoObjetivo = 0;
    } else if (c.piso < INTERIOR.azotea) {
      c.pisoObjetivo = c.piso + 1;
      haciaEscalera(b, c);
    } else {
      // azotea: huir del zombi dentro del rect — última resistencia
      const dx = c.x - amenaza.x;
      const dz = c.z - amenaza.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
      c.pisoObjetivo = c.piso;
    }
    moverInterior(b, c, c.x + c.dirX * PANICO.velocidadHuida * DT, c.z + c.dirZ * PANICO.velocidadHuida * DT);
    return;
  }

  if (avanzarEscalera(b, c)) return;

  if (c.animo === 'panico') {
    c.animoTicks++;
    if (c.animoTicks >= PANICO.ticksCalmarse) {
      c.animo = 'tranquilo';
    } else if (c.piso !== c.pisoObjetivo) {
      haciaEscalera(b, c);
      moverInterior(b, c, c.x + c.dirX * PANICO.velocidadHuida * DT, c.z + c.dirZ * PANICO.velocidadHuida * DT);
    }
    return;
  }

  // escondido: si aún quiere cambiar de piso, sigue hacia la escalera
  if (c.pisoObjetivo !== c.piso) {
    haciaEscalera(b, c);
    moverInterior(b, c, c.x + c.dirX * 0.9 * DT, c.z + c.dirZ * 0.9 * DT);
    return;
  }
  // escondido: deambula lento por su piso
  if (world.rngCiudadanos.chance(0.01)) {
    const [dx0, dz0] = DIRECCIONES[world.rngCiudadanos.int(0, DIRECCIONES.length - 1)];
    c.dirX = dx0;
    c.dirZ = dz0;
  }
  moverInterior(b, c, c.x + c.dirX * 0.5 * DT, c.z + c.dirZ * 0.5 * DT);
}

function updateInteriorZombi(c: Citizen, world: World, b: Building): void {
  if (c.cdMordida > 0) c.cdMordida--;
  if (avanzarEscalera(b, c)) return;

  let presa: Citizen | null = null;
  let mejorD2 = Infinity;
  let pisoConHumanos = -1;
  let mejorDistPiso = Infinity;
  for (const i of world.dentroPorEdificio[b.id]) {
    const o = world.citizens[i];
    if (o.salud === 'zombi') continue;
    const distPiso = Math.abs(o.piso - c.piso);
    if (distPiso < mejorDistPiso || (distPiso === mejorDistPiso && (pisoConHumanos === -1 || o.piso < pisoConHumanos))) {
      mejorDistPiso = distPiso;
      pisoConHumanos = o.piso;
    }
    if (o.piso !== c.piso) continue;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      presa = o;
    }
  }

  if (presa) {
    const dx = presa.x - c.x;
    const dz = presa.z - c.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
    moverInterior(b, c, c.x + c.dirX * ZOMBIS.velocidad * 0.8 * DT, c.z + c.dirZ * ZOMBIS.velocidad * 0.8 * DT);
    if (mejorD2 <= INFECCION.radioMordida ** 2 && c.cdMordida === 0) {
      infectar(presa, world.rngInfeccion);
      presa.animo = 'panico';
      presa.animoTicks = 0;
      world.ruidos.push({ x: presa.x, z: presa.z, radio: PANICO.radioGrito / 2, ticks: PANICO.duracionGritoTicks });
      c.cdMordida = ZOMBIS.enfriamientoMordidaTicks;
    }
    return;
  }

  if (pisoConHumanos >= 0) {
    c.pisoObjetivo = pisoConHumanos;
    haciaEscalera(b, c);
  } else if (c.piso === 0) {
    // edificio sin humanos: salir a la calle
    const p = b.puerta!;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
  } else {
    c.pisoObjetivo = 0;
    haciaEscalera(b, c);
  }
  moverInterior(b, c, c.x + c.dirX * ZOMBIS.velocidad * 0.8 * DT, c.z + c.dirZ * ZOMBIS.velocidad * 0.8 * DT);
}
