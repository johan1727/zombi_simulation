import { World } from '../sim/world';
import { CITIZENS } from '../sim/config';
import { interpolarCurva, type Desafio } from './desafio';

/** Cada cuántos ticks propios se toma una muestra de la curva (5 s a 30 tps). Exportada: Plan 10 la reusa en `main.ts` para saber cuándo enviar la muestra propia por red. */
export const INTERVALO_MUESTRA = 150;
/** Tope de muestras (145 × 5 s ≈ 12 min, más que de sobra para una partida de 8 min). Exportada para que `RivalEnVivo` (src/net/rivalEnVivo.ts) use el mismo tope. */
export const MAX_MUESTRAS = 145;
/** La curva de un `Desafio` se muestrea cada 10 s (`desafio.ts`); la de Rival, cada 5 s. Factor entre ambas. */
const FACTOR_MUESTRA_RETO = 2;

/**
 * Contrato público mínimo que `hud.ts`/`resultado.ts`/`audio.ts` necesitan de
 * un "rival" — extraído para Plan 10 (matchmaking en vivo): `RivalEnVivo`
 * (src/net/rivalEnVivo.ts) implementa este mismo contrato con SUS PROPIOS
 * campos privados, y TypeScript no la aceptaría donde se pida el tipo de
 * clase `Rival` a secas (los miembros privados de una clase cuentan para su
 * identidad nominal). Tipando los parámetros de los consumidores como esta
 * interfaz (estructural, sin privados) en vez de la clase `Rival`, cualquier
 * modo — fantasma, reto o en vivo — es intercambiable sin cambiar una línea
 * de comportamiento.
 */
export interface RivalComparable {
  tick(): void;
  readonly vivosPct: number;
  readonly curva: number[];
  readonly avisosBrecha: number[];
  readonly indiceCiudad: number;
}

/** Cuenta cuántas zonas de `world.brecha` están activas ahora mismo. Compartida entre el modo fantasma de `Rival` y el cálculo de la muestra PROPIA que `main.ts` envía por red para el modo en vivo (Plan 10 Task 2) — mismo criterio, un solo bucle. */
export function contarBrechas(world: World): number {
  let n = 0;
  for (const b of world.brecha) if (b) n++;
  return n;
}

/**
 * Calcula la muestra `{vivosPct, indiceCiudad, brecha}` del `world` propio en
 * el instante actual, dado cuántas brechas había en la muestra anterior
 * (`brechasPrevias` — el llamador es quien guarda ese contador entre
 * llamadas, mismo patrón que `Rival.brechasPrevias`). `brecha` es true si
 * apareció una brecha NUEVA desde la última muestra. Usada por el modo
 * fantasma de `Rival` (abajo) y por `main.ts` para construir el mensaje que
 * `ConexionSala.enviarMuestra` manda al rival remoto — un solo lugar con
 * este cálculo, no duplicado.
 */
export function calcularMuestraPropia(
  world: World,
  brechasPrevias: number
): { vivosPct: number; indiceCiudad: number; brecha: boolean; brechasActuales: number } {
  const brechasActuales = contarBrechas(world);
  return {
    vivosPct: world.vivosPct,
    indiceCiudad: world.indiceCiudad,
    brecha: brechasActuales > brechasPrevias,
    brechasActuales,
  };
}

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
export class Rival implements RivalComparable {
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
      const m = calcularMuestraPropia(this.world, this.brechasPrevias);
      this.curva.push(m.vivosPct);
      if (m.brecha) {
        this.avisosBrecha.push(this.world.tickCount);
      }
      this.brechasPrevias = m.brechasActuales;
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
