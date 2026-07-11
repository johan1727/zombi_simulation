import { World } from '../sim/world';
import { CITIZENS } from '../sim/config';
import { interpolarCurva, type Desafio } from './desafio';

/** Cada cuántos ticks propios se toma una muestra de la curva (5 s a 30 tps). */
const INTERVALO_MUESTRA = 150;
/** Tope de muestras (145 × 5 s ≈ 12 min, más que de sobra para una partida de 8 min). */
const MAX_MUESTRAS = 145;
/** La curva de un `Desafio` se muestrea cada 10 s (`desafio.ts`); la de Rival, cada 5 s. Factor entre ambas. */
const FACTOR_MUESTRA_RETO = 2;

/**
 * El rival fantasma: un `World` con la MISMA semilla que el del jugador,
 * que nunca recibe órdenes, tickeado 1:1 junto al mundo del jugador. Sirve
 * de comparación en vivo ("¿voy ganando?") — no es una IA, es la misma
 * pandemia sin nadie al mando.
 *
 * MODO RETO (Task 7): si se pasa un `Desafio` en el constructor, el rival
 * es ESTÁTICO — su `world` se construye (para no repartir tipos opcionales
 * por todo el proyecto) pero NUNCA se tickea, así que no gasta cómputo
 * simulando un segundo mundo completo. En su lugar, `curva`/`vivosPct`/
 * `indiceCiudad` se derivan de los datos congelados del desafío:
 * `curva` se "revela" a la misma cadencia (5 s) que la del rival en vivo,
 * interpolando linealmente la curva gruesa (10 s) del desafío, para que
 * el gráfico de `Resultado` quede alineado con la curva propia (mismo eje
 * de muestras). `indiceCiudad` es directamente el índice final del desafío
 * (no hay "índice en vivo" de un mundo que no corre). Esto evita duplicar
 * el concepto de "rival" en una clase paralela (`RivalEstatico`): los
 * consumidores (`hud.ts`, `resultado.ts`) siguen usando la misma interfaz
 * pública de `Rival`, solo que sus getters cambian de fuente según el modo.
 */
export class Rival {
  readonly world: World;
  /** Muestra de `vivosPct` cada 5 s (ver INTERVALO_MUESTRA), tope MAX_MUESTRAS. */
  readonly curva: number[] = [];
  /** Tick (del rival) de cada muestra en la que se detectó una brecha nueva desde la muestra anterior. Vacío en modo reto (no hay brechas "en vivo" que detectar). */
  readonly avisosBrecha: number[] = [];
  private brechasPrevias = 0;
  private readonly reto?: Desafio;
  /** Contador de ticks propio del modo reto (no tickeamos `world`, así que no hay `world.tickCount` real que leer). */
  private tickEstatico = 0;

  /**
   * `citizenCount` es un parámetro adicional no exigido por el diseño
   * (el spec original solo pide `constructor(seed)`); se agrega para poder
   * usar poblaciones pequeñas en los tests sin tocar `World`. En producción
   * se omite y usa la población por defecto, igual que el mundo del jugador.
   *
   * `reto`: si viene presente, activa el modo estático (ver doc de la clase).
   */
  constructor(seed: string, citizenCount: number = CITIZENS.count, reto?: Desafio) {
    this.world = new World(seed, citizenCount);
    this.reto = reto;
  }

  /** true si este rival es estático (modo reto): no simula, muestra la curva congelada del desafío. */
  get estatico(): boolean {
    return this.reto !== undefined;
  }

  tick(): void {
    if (this.reto) {
      this.tickEstatico++;
      if (this.tickEstatico % INTERVALO_MUESTRA === 0 && this.curva.length < MAX_MUESTRAS) {
        const numMuestra = this.curva.length + 1; // 1-based: primera muestra a los 5s
        const posicion = numMuestra / FACTOR_MUESTRA_RETO;
        this.curva.push(interpolarCurva(this.reto.curva, posicion));
      }
      return;
    }
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
    if (this.reto) {
      return this.curva.length > 0 ? this.curva[this.curva.length - 1] : (this.reto.curva[0] ?? 100);
    }
    return this.world.vivosPct;
  }

  /** Índice de Ciudad "del rival": en modo reto, el índice final congelado del desafío; si no, el del mundo en vivo. */
  get indiceCiudad(): number {
    return this.reto ? this.reto.indice : this.world.indiceCiudad;
  }
}
