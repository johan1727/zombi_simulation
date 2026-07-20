import type { World } from '../sim/world';
import type { Partida } from '../game/partida';
import { INFECCION } from '../sim/config';

/** Clave de localStorage: 'visto' = no volver a mostrar tips en esta máquina. */
const CLAVE = 'pandemia-tutorial';
/** Cada tip queda visible este tiempo, salvo que el siguiente dispare antes. */
const DURACION_MS = 6000;
/** Tick del diseño (8 min a 30 tps): "el hospital del rival ya cayó" — 2:40 literal del plan. */
const TICK_OBRERO = 4800;
/** Más de este número de ciudadanos en pánico A LA VEZ cuenta como "pánico masivo". */
const UMBRAL_PANICO_MASIVO = 30;

/**
 * true si YA hubo un uso de habilidad del JUGADOR. 'disparo'/'rescate'/
 * 'megafono'/'refuerzo' SOLO los empuja `aplicarOrden` (src/sim/agentes.ts),
 * que SOLO corre por una orden encolada vía `world.encolarOrden` — es decir,
 * SIEMPRE originada por el jugador (el rival/fantasma nunca encola órdenes,
 * ver src/game/rival.ts). Por eso un hito de estos tipos, sin más, ya
 * identifica el evento sin tener que enganchar `Controles` directamente.
 */
export function huboHabilidadDeJugador(world: World): boolean {
  return world.hitos.some(
    (h) => h.tipo === 'disparo' || h.tipo === 'rescate' || h.tipo === 'megafono' || h.tipo === 'refuerzo'
  );
}

/** true si en ESTE tick hay más de `UMBRAL_PANICO_MASIVO` ciudadanos en pánico simultáneamente. */
export function hayPanicoMasivo(world: World): boolean {
  let n = 0;
  for (const c of world.citizens) {
    if (c.animo === 'panico' && ++n > UMBRAL_PANICO_MASIVO) return true;
  }
  return false;
}

/**
 * true si en ESTE tick algún agente tiene `ordenControl` — o sea, la última
 * orden que se le aplicó fue una orden 'control' (posesión WASD, ver
 * `aplicarOrden` en src/sim/agentes.ts). Señal de "el jugador ya poseyó a
 * alguien al menos una vez", sin necesitar enganchar `Posesion` directamente
 * (mismo espíritu que `huboHabilidadDeJugador` lee del `world`, no de `Controles`).
 */
export function huboPosesion(world: World): boolean {
  return world.citizens.some((c) => c.esAgente && c.ordenControl);
}

interface Paso {
  texto: string;
  cumplida: (world: World) => boolean;
}

/**
 * Los 5 tips DESPUÉS del de carga (ese no depende del mundo, se muestra
 * directo en el constructor). Orden fijo, un paso solo avanza cuando el
 * anterior ya se mostró.
 *
 * El paso del megáfono lee `vistoPanicoMasivo` — una bandera con memoria que
 * `Tutorial.actualizar` mantiene actualizada TODOS los frames, sin importar
 * en qué paso esté el puntero — en vez de `hayPanicoMasivo` en vivo. El
 * pánico es reversible (la gente se calma) y los pasos se comprueban en
 * orden estricto: un pico de pánico que sube y baja MIENTRAS el jugador
 * todavía no usó ninguna habilidad (paso anterior, sin relación causal con
 * este) se perdería para siempre si solo mirásemos el pánico al llegar al
 * paso 3 — el puntero nunca retrocede a revisarlo.
 */
function crearPasos(vistoPanicoMasivo: () => boolean, vistoPosesion: () => boolean): Paso[] {
  return [
    {
      texto: 'El paciente cero anda suelto. Encuéntralo antes de que estalle',
      cumplida: (world) => world.tickCount >= INFECCION.pacienteCeroTick,
    },
    {
      // Primera transformación: el primer ciudadano se vuelve zombi (0 → >0).
      texto: '¡Empezó! Haz click en tu POLICÍA (tecla 1) y llévalo al brote',
      cumplida: (world) => world.stats.zombis > 0,
    },
    {
      texto: 'Poseíste a un agente: caminá hasta la puerta de un edificio para refugiarlo adentro',
      cumplida: vistoPosesion,
    },
    {
      texto: 'Todo tiene un precio: el disparo atrae a la horda',
      cumplida: huboHabilidadDeJugador,
    },
    {
      texto: 'El del MEGÁFONO (3) puede guiar multitudes… a donde tú quieras',
      cumplida: vistoPanicoMasivo,
    },
    {
      texto: 'El OBRERO (4) refuerza puertas. El hospital de tu rival ya cayó, ¿el tuyo?',
      cumplida: (world) => world.tickCount >= TICK_OBRERO,
    },
  ];
}

/**
 * Tips de una línea para la primera partida (Task 9): toast inferior
 * centrado disparado por estado REAL del mundo, nunca pantallas ni pausas —
 * el juego sigue corriendo debajo. `main.ts` crea UNA instancia y llama
 * `actualizar()` cada frame; se apaga sola en cuanto queda escrito
 * `localStorage['pandemia-tutorial'] === 'visto'` (de una partida anterior,
 * o porque esta terminó).
 */
export class Tutorial {
  private readonly el: HTMLDivElement | null;
  private readonly pasos: readonly Paso[];
  private activo: boolean;
  /** Próximo índice de `pasos` por comprobar. */
  private paso = 0;
  private ocultarEn = 0;
  /** Con memoria: una vez true, queda true (ver comentario en crearPasos). */
  private vistoPanicoMasivo = false;
  /** Con memoria, mismo patrón que vistoPanicoMasivo. */
  private vistoPosesion = false;

  constructor() {
    this.el = document.getElementById('tutorial-toast') as HTMLDivElement | null;
    this.pasos = crearPasos(() => this.vistoPanicoMasivo, () => this.vistoPosesion);
    this.activo = localStorage.getItem(CLAVE) !== 'visto';
    if (this.activo) this.mostrar('Arrastra para mover la cámara · rueda para zoom');
  }

  /** Llamado cada frame desde main.ts; no hace nada si ya se vio el tutorial. */
  actualizar(world: World, partida: Partida): void {
    if (!this.activo) return;
    if (partida.estado === 'terminada') {
      localStorage.setItem(CLAVE, 'visto');
      this.activo = false;
      this.el?.classList.remove('activo');
      return;
    }
    // Se actualiza SIEMPRE, sin importar en qué paso esté el puntero — si
    // solo se comprobara al llegar al paso 3, un pico de pánico que ya pasó
    // mientras el puntero seguía atascado en el paso 2 se perdería.
    if (hayPanicoMasivo(world)) this.vistoPanicoMasivo = true;
    if (huboPosesion(world)) this.vistoPosesion = true;
    // while (no if): si varios pasos se cumplieron entre dos llamadas (p. ej.
    // el gancho de depuración tickea varias veces antes de renderizar), se
    // muestra directo el tip más reciente en vez de quedarse atascado.
    while (this.paso < this.pasos.length && this.pasos[this.paso].cumplida(world)) {
      this.mostrar(this.pasos[this.paso].texto);
      this.paso++;
    }
    if (this.ocultarEn > 0 && Date.now() >= this.ocultarEn) {
      this.el?.classList.remove('activo');
      this.ocultarEn = 0;
    }
  }

  private mostrar(texto: string): void {
    if (!this.el) return;
    this.el.textContent = texto;
    this.el.classList.add('activo');
    this.ocultarEn = Date.now() + DURACION_MS;
  }
}
