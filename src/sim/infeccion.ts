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
 * Un solo draw adicional, en un stream PROPIO (`world.rngHeridas`) separado
 * del `rng` que decide la transición de estado — nunca el mismo stream que
 * `infectar` recibe para incubación/paciente-cero/combate/mordida. Si
 * compartiera stream, cada infección desplazaría en uno TODOS los draws
 * futuros de ese stream (p. ej. la duración de incubación de la SIGUIENTE
 * infección), resecuenciando la partida entera por un efecto mariposa ajeno
 * al diseño de las heridas (hallazgo de la recalibración de balance, Plan 5
 * Task 6: el balance calibrado en Plan 3 se rompía por esto, no por el
 * diseño de fractura/amputación en sí). Pierna primero, luego brazo, resto
 * torso.
 */
function sortearZonaHerida(c: Citizen, rngHeridas: Rng): void {
  const r = rngHeridas.next();
  c.zonaHerida = r < HERIDAS.probPierna ? 'pierna' : r < HERIDAS.probPierna + HERIDAS.probBrazo ? 'brazo' : 'torso';
  if (c.zonaHerida === 'brazo') c.ventanaAmputarTicks = HERIDAS.ventanaAmputarTicks;
}

export function infectar(c: Citizen, rng: Rng, rngHeridas: Rng): void {
  if (c.esAgente) {
    if (c.salud === 'sano') {
      c.salud = 'caido';
      c.caidoTicks = AGENTES.ventanaCaidoTicks;
      sortearZonaHerida(c, rngHeridas);
    }
    return;
  }
  if (c.salud !== 'sano') return;
  c.salud = 'incubando';
  c.incubacionTicks = rng.int(INFECCION.incubacionMinTicks, INFECCION.incubacionMaxTicks);
  sortearZonaHerida(c, rngHeridas);
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
