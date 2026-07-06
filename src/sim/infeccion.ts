import type { Rng } from './rng';
import type { Citizen } from './types';
import type { World } from './world';
import { INFECCION } from './config';

export function elegirPacienteCero(citizens: readonly Citizen[], rng: Rng): number {
  return rng.int(0, citizens.length - 1);
}

export function infectar(c: Citizen, rng: Rng): void {
  if (c.salud !== 'sano') return;
  c.salud = 'incubando';
  c.incubacionTicks = rng.int(INFECCION.incubacionMinTicks, INFECCION.incubacionMaxTicks);
}

export function actualizarIncubacion(c: Citizen, world: World): void {
  if (c.salud !== 'incubando') return;
  c.incubacionTicks--;
  if (c.incubacionTicks > 0) return;
  c.salud = 'zombi';
  c.animo = 'tranquilo';
  c.cdMordida = 0;
  world.splats.push({ x: c.x, z: c.z, tono: world.rngInfeccion.next() });
}
