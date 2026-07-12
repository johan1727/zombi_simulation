import type { Rng } from './rng';
import { EVENTO, type TipoEvento } from './config';

/** Tick e tipo del giro de semilla — determinista, IDÉNTICO para World y Rival. */
export function elegirEvento(rng: Rng): { tick: number; tipo: TipoEvento } {
  const tick = rng.int(EVENTO.tickMin, EVENTO.tickMax);
  const tipos: readonly TipoEvento[] = ['apagon', 'lluvia', 'helicoptero'];
  return { tick, tipo: rng.pick(tipos) };
}
