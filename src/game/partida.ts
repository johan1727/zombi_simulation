import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';

/** Umbral de colapso: menos del 10% de la población original con vida. */
export const UMBRAL_COLAPSO = 0.1;

/**
 * Cada cuántos ticks se muestrea la curva propia (5 s a 30 tps) — igual que
 * Rival. Exportada (Plan 17 Task 2): `server/verificar.ts` la reusa para
 * reconstruir la MISMA curva fina durante un replay server-side, sin
 * duplicar el número a mano ni arriesgar que diverjan.
 */
export const INTERVALO_MUESTRA = 150;
/** Tope de muestras — igual que Rival. Exportada, ver `INTERVALO_MUESTRA`. */
export const MAX_MUESTRAS = 145;

/**
 * Estado de la partida: reloj de 8 minutos y condición de fin (reloj o
 * colapso demográfico). La sim no sabe qué es "perder"; esa noción vive aquí.
 */
export class Partida {
  estado: 'jugando' | 'terminada' = 'jugando';
  readonly duracionTicks = 8 * 60 * TICK_RATE;
  motivoFin: 'reloj' | 'colapso' | '' = '';
  /** Muestra de `vivosPct` propia cada 5 s, muestreada igual que `Rival.curva`. */
  readonly curva: number[] = [];

  update(world: World): void {
    if (
      world.tickCount % INTERVALO_MUESTRA === 0 &&
      world.tickCount > 0 &&
      this.curva.length < MAX_MUESTRAS
    ) {
      this.curva.push(world.vivosPct);
    }
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
