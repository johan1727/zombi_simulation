import { World } from '../sim/world';
import { CITIZENS } from '../sim/config';

/** Cada cuántos ticks propios se toma una muestra de la curva (5 s a 30 tps). */
const INTERVALO_MUESTRA = 150;
/** Tope de muestras (145 × 5 s ≈ 12 min, más que de sobra para una partida de 8 min). */
const MAX_MUESTRAS = 145;

/**
 * El rival fantasma: un `World` con la MISMA semilla que el del jugador,
 * que nunca recibe órdenes, tickeado 1:1 junto al mundo del jugador. Sirve
 * de comparación en vivo ("¿voy ganando?") — no es una IA, es la misma
 * pandemia sin nadie al mando.
 */
export class Rival {
  readonly world: World;
  /** Muestra de `vivosPct` cada 5 s (ver INTERVALO_MUESTRA), tope MAX_MUESTRAS. */
  readonly curva: number[] = [];
  /** Tick (del rival) de cada muestra en la que se detectó una brecha nueva desde la muestra anterior. */
  readonly avisosBrecha: number[] = [];
  private brechasPrevias = 0;

  /**
   * `citizenCount` es un parámetro adicional no exigido por el diseño
   * (el spec original solo pide `constructor(seed)`); se agrega para poder
   * usar poblaciones pequeñas en los tests sin tocar `World`. En producción
   * se omite y usa la población por defecto, igual que el mundo del jugador.
   */
  constructor(seed: string, citizenCount: number = CITIZENS.count) {
    this.world = new World(seed, citizenCount);
  }

  tick(): void {
    this.world.tick();
    if (
      this.world.tickCount % INTERVALO_MUESTRA === 0 &&
      this.curva.length < MAX_MUESTRAS
    ) {
      this.curva.push(this.world.vivosPct);
      let brechasActuales = 0;
      for (const b of this.world.brecha) if (b) brechasActuales++;
      if (brechasActuales > this.brechasPrevias) {
        this.avisosBrecha.push(this.world.tickCount);
      }
      this.brechasPrevias = brechasActuales;
    }
  }

  get vivosPct(): number {
    return this.world.vivosPct;
  }
}
