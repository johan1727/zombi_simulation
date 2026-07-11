import type { Rng } from './rng';
import type { Citizen } from './types';
import type { World } from './world';
import { AGENTES, HERIDAS, INFECCION } from './config';

export function elegirPacienteCero(citizens: readonly Citizen[], rng: Rng): number {
  // Los agentes del jugador (siempre al final del array) NUNCA son el
  // paciente cero: si se contaran, citizens.length cambiaría el rango de
  // rng.int y con él QUÉ civil sale sorteado para el mismo seed — una fuga
  // de determinismo/balance a través del tamaño del array, no del rng en sí.
  let n = citizens.length;
  while (n > 0 && citizens[n - 1].esAgente) n--;
  return rng.int(0, n - 1);
}

/**
 * Un solo draw adicional con el MISMO rng recibido por `infectar`, siempre
 * que el estado de `c` acaba de cambiar por una mordida (sano→incubando o
 * agente sano→caído). Pierna primero, luego brazo, resto torso.
 */
function sortearZonaHerida(c: Citizen, rng: Rng): void {
  const r = rng.next();
  c.zonaHerida = r < HERIDAS.probPierna ? 'pierna' : r < HERIDAS.probPierna + HERIDAS.probBrazo ? 'brazo' : 'torso';
  if (c.zonaHerida === 'brazo') c.ventanaAmputarTicks = HERIDAS.ventanaAmputarTicks;
}

export function infectar(c: Citizen, rng: Rng): void {
  if (c.esAgente) {
    if (c.salud === 'sano') {
      c.salud = 'caido';
      c.caidoTicks = AGENTES.ventanaCaidoTicks;
      sortearZonaHerida(c, rng);
    }
    return;
  }
  if (c.salud !== 'sano') return;
  c.salud = 'incubando';
  c.incubacionTicks = rng.int(INFECCION.incubacionMinTicks, INFECCION.incubacionMaxTicks);
  sortearZonaHerida(c, rng);
}

export function actualizarIncubacion(c: Citizen, world: World): void {
  if (c.salud !== 'incubando') return;
  if (c.ventanaAmputarTicks > 0) c.ventanaAmputarTicks--;
  c.incubacionTicks--;
  if (c.incubacionTicks > 0) return;
  c.salud = 'zombi';
  c.animo = 'tranquilo';
  c.cdMordida = 0;
  world.splats.push({ x: c.x, z: c.z, tono: world.rngInfeccion.next() });
  world.registrarPeligro(c.x, c.z);
  if (c.familia >= 0 && c.cabezaFamilia === c.id && world.hitos.length <= 300) {
    world.hitos.push({ tick: world.tickCount, tipo: 'transformacion_cabeza', a: c.id, b: -1 });
  }
}
