import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';

/** Umbral de colapso: menos del 10% de la población original con vida. */
const UMBRAL_COLAPSO = 0.1;

/**
 * Estado de la partida: reloj de 8 minutos y condición de fin (reloj o
 * colapso demográfico). La sim no sabe qué es "perder"; esa noción vive aquí.
 */
export class Partida {
  estado: 'jugando' | 'terminada' = 'jugando';
  readonly duracionTicks = 8 * 60 * TICK_RATE;
  motivoFin: 'reloj' | 'colapso' | '' = '';

  update(world: World): void {
    if (this.estado === 'terminada') return;
    if (world.tickCount >= this.duracionTicks) {
      this.estado = 'terminada';
      this.motivoFin = 'reloj';
    } else if (world.stats.vivos < world.citizens.length * UMBRAL_COLAPSO) {
      this.estado = 'terminada';
      this.motivoFin = 'colapso';
    }
  }
}
