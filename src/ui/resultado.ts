import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';
import { UMBRAL_COLAPSO, type Partida } from '../game/partida';
import type { RivalComparable } from '../game/rival';
import { codificarDesafio, muestrearParaUrl } from '../game/desafio';
import { componerHistorias } from './historias';

/**
 * Igual que en Partida/Rival (5 s a 30 tps): se duplica aquí porque es un
 * detalle de muestreo privado de cada uno — no vale la pena un módulo
 * compartido para una sola constante repetida tres veces en el proyecto.
 */
const INTERVALO_MUESTRA = 150;

type Ganador = 'tu' | 'rival' | 'empate';

interface Veredicto {
  ganador: Ganador;
  motivo: string;
}

/** Aproxima el tick de colapso (primera muestra con vivosPct < 10) a partir de una curva de 5 en 5 s. */
function tickDeColapso(curva: readonly number[]): number {
  for (let i = 0; i < curva.length; i++) {
    if (curva[i] < 10) return (i + 1) * INTERVALO_MUESTRA;
  }
  return Infinity; // no se detectó en las muestras: colapsó muy cerca del final, entre dos muestras
}

/**
 * Veredicto según los desempates del diseño §2: colapso = derrota inmediata
 * para quien colapsa (si el otro no colapsó); si ambos colapsan, gana quien
 * aguantó más (se aproxima con `tickDeColapso` sobre las curvas muestreadas
 * de `partida`/`rival` — no hay un tick exacto guardado en ningún lado); si
 * no hay colapso claro (o el colapso "simultáneo" es indistinguible con la
 * resolución de 5 s de las curvas), gana el mayor Índice de Ciudad; empate
 * de índice → más vivos; empate exacto → empate.
 *
 * Modo reto (Task 7): `rival.world` no simula cuando `rival.estatico` es
 * true (ver `rival.ts`), así que aquí NUNCA se lee `rival.world.*`
 * directamente — solo `rival.vivosPct`/`rival.indiceCiudad`, que ya saben
 * elegir entre el mundo en vivo o la curva congelada del desafío.
 */
export function calcularVeredicto(world: World, partida: Partida, rival: RivalComparable): Veredicto {
  const tuColapsado = world.stats.vivos < world.citizens.length * UMBRAL_COLAPSO;
  const rivalColapsado = rival.vivosPct < UMBRAL_COLAPSO * 100;

  if (tuColapsado && !rivalColapsado) {
    return { ganador: 'rival', motivo: 'Tu ciudad colapsó; la del rival, no.' };
  }
  if (rivalColapsado && !tuColapsado) {
    return { ganador: 'tu', motivo: 'La ciudad del rival colapsó; la tuya, no.' };
  }
  if (tuColapsado && rivalColapsado) {
    const tuTick = tickDeColapso(partida.curva);
    const rivalTick = tickDeColapso(rival.curva);
    if (tuTick !== rivalTick) {
      return tuTick > rivalTick
        ? { ganador: 'tu', motivo: 'Ambas ciudades colapsaron; la tuya aguantó más tiempo.' }
        : { ganador: 'rival', motivo: 'Ambas ciudades colapsaron; la del rival aguantó más tiempo.' };
    }
    // colapso indistinguible con la resolución de la curva: cae al desempate por índice/vivos de abajo.
  }

  const tuIndice = world.indiceCiudad;
  const rivalIndice = rival.indiceCiudad;
  if (tuIndice !== rivalIndice) {
    return tuIndice > rivalIndice
      ? { ganador: 'tu', motivo: 'Mayor Índice de Ciudad.' }
      : { ganador: 'rival', motivo: 'El rival tuvo mayor Índice de Ciudad.' };
  }
  const tuVivosPct = world.vivosPct;
  const rivalVivosPct = rival.vivosPct;
  if (tuVivosPct !== rivalVivosPct) {
    return tuVivosPct > rivalVivosPct
      ? { ganador: 'tu', motivo: 'Índice empatado; ganaste por más población viva.' }
      : { ganador: 'rival', motivo: 'Índice empatado; el rival tuvo más población viva.' };
  }
  return { ganador: 'empate', motivo: 'Empate exacto.' };
}

function puntosSvg(curva: readonly number[], n: number, w: number, h: number): string {
  if (curva.length === 0) return '';
  const stepX = n > 1 ? w / (n - 1) : 0;
  return curva
    .map((v, i) => {
      const pct = Math.max(0, Math.min(100, v));
      return `${(i * stepX).toFixed(1)},${(h - (pct / 100) * h).toFixed(1)}`;
    })
    .join(' ');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const ANCHO_SVG = 260;
const ALTO_SVG = 90;

/**
 * Overlay a pantalla completa al terminar la partida: marcador, veredicto,
 * curvas de ambas ciudades, historias emergentes, estadísticas y botones de
 * revancha. Se muestra UNA sola vez (guardia `mostrado`); `main.ts` llama a
 * `update()` cada frame y esta clase decide cuándo activarse.
 */
export class Resultado {
  private readonly el: HTMLDivElement;
  private mostrado = false;
  /**
   * Último desafío generado por COPIAR DESAFÍO, expuesto para verificación
   * programática (`window.pandemia.resultado.ultimoDesafio`): el entorno de
   * preview no siempre concede permiso de portapapeles sin gesto real de
   * usuario, así que esto permite comprobar que la URL/código se generaron
   * bien aunque `navigator.clipboard.writeText` falle o esté ausente.
   */
  ultimoDesafio: { codigo: string; url: string; mensaje: string } | null = null;

  constructor(
    private readonly world: World,
    private readonly partida: Partida,
    private readonly rival: RivalComparable
  ) {
    this.el = document.getElementById('resultado') as HTMLDivElement;
  }

  /** true una vez que el overlay ya se mostró (para que main.ts pueda, p. ej., soltar los controles). */
  get visible(): boolean {
    return this.mostrado;
  }

  update(): void {
    if (this.mostrado || this.partida.estado !== 'terminada') return;
    this.mostrado = true;
    this.el.innerHTML = this.armarHtml();
    this.el.classList.add('activo');
    this.conectarBotones();
  }

  private armarHtml(): string {
    const { world, partida, rival } = this;
    const v = calcularVeredicto(world, partida, rival);
    const titulo = v.ganador === 'tu' ? '¡GANASTE!' : v.ganador === 'rival' ? 'PERDISTE' : 'EMPATE';
    const claseTitulo =
      v.ganador === 'tu' ? 'resultado-gano' : v.ganador === 'rival' ? 'resultado-perdio' : 'resultado-empate';
    const motivoFin = partida.motivoFin === 'reloj' ? 'Se acabó el tiempo.' : 'Tu ciudad colapsó.';

    const { vivos } = world.stats;
    const zombisEliminados = world.hitos.filter((h) => h.tipo === 'disparo').length;
    const rescates = world.hitos.filter((h) => h.tipo === 'rescate').length;
    const refuerzos = world.hitos.filter((h) => h.tipo === 'refuerzo').length;

    const historias = componerHistorias(world, 4);

    const n = Math.max(partida.curva.length, rival.curva.length, 2);
    const propia = puntosSvg(partida.curva, n, ANCHO_SVG, ALTO_SVG);
    const rivalPts = puntosSvg(rival.curva, n, ANCHO_SVG, ALTO_SVG);
    const yUmbral = (ALTO_SVG - (10 / 100) * ALTO_SVG).toFixed(1);

    return `
      <div class="resultado-caja">
        <div class="resultado-veredicto ${claseTitulo}">${titulo}</div>
        <div class="resultado-motivo">${motivoFin} ${escapeHtml(v.motivo)}</div>
        <div class="resultado-marcador">TÚ ${world.indiceCiudad} · RIVAL ${rival.indiceCiudad}</div>
        <svg class="resultado-svg" viewBox="0 0 ${ANCHO_SVG} ${ALTO_SVG}" width="${ANCHO_SVG}" height="${ALTO_SVG}">
          <line x1="0" y1="${ALTO_SVG}" x2="${ANCHO_SVG}" y2="${ALTO_SVG}" class="resultado-eje" />
          <line x1="0" y1="${yUmbral}" x2="${ANCHO_SVG}" y2="${yUmbral}" class="resultado-umbral" />
          ${propia ? `<polyline points="${propia}" class="resultado-curva-tu" />` : ''}
          ${rivalPts ? `<polyline points="${rivalPts}" class="resultado-curva-rival" />` : ''}
        </svg>
        <div class="resultado-leyenda">
          <span class="resultado-leyenda-tu">■ Tú</span>
          <span class="resultado-leyenda-rival">■ Rival</span>
        </div>
        <ul class="resultado-historias">
          ${historias.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
        </ul>
        <div class="resultado-stats">
          Vivos: ${vivos} · Zombis eliminados: ${zombisEliminados} · Rescates: ${rescates} · Refuerzos usados: ${refuerzos}
        </div>
        <div class="resultado-botones">
          <button id="btn-revancha" type="button">REVANCHA</button>
          <button id="btn-otra-pandemia" type="button">OTRA PANDEMIA</button>
          <button id="btn-copiar-desafio" type="button">COPIAR DESAFÍO</button>
        </div>
        <div id="resultado-manual" class="resultado-manual">
          No se pudo copiar automáticamente. Copiá el texto:
          <input id="resultado-manual-input" type="text" readonly />
        </div>
      </div>`;
  }

  private conectarBotones(): void {
    const seed = this.world.seed;
    this.el
      .querySelector('#btn-revancha')
      ?.addEventListener('click', () => {
        location.href = `${location.pathname}?seed=${encodeURIComponent(seed)}`;
      });
    this.el
      .querySelector('#btn-otra-pandemia')
      ?.addEventListener('click', () => {
        location.href = location.pathname;
      });
    const btnCopiar = this.el.querySelector('#btn-copiar-desafio') as HTMLButtonElement | null;
    btnCopiar?.addEventListener('click', () => this.copiarDesafio(btnCopiar));
  }

  /**
   * Codifica la partida propia (Task 7) y copia al portapapeles el mensaje
   * de reto. La curva propia es la de `Partida` (5 s) recortada a 10 s con
   * `muestrearParaUrl` — más gruesa que la del gráfico de este overlay, es
   * una representación distinta hecha exclusivamente para caber en la URL.
   *
   * Fallback de copiado (hallazgo de revisión, Task 10): `navigator.clipboard`
   * puede faltar o fallar sin gesto real de usuario, permiso denegado o
   * contexto no seguro (http sin TLS). Antes fallaba en silencio; ahora se
   * intenta primero `execCommand('copy')` (más permisivo, aunque obsoleto) y,
   * si también falla, se revela un campo de texto seleccionable para copiar
   * a mano — sin usar `window.prompt` (bloquea la pestaña y complica las
   * pruebas automatizadas).
   */
  private copiarDesafio(btn: HTMLButtonElement): void {
    const { world, partida } = this;
    const curva = muestrearParaUrl(partida.curva);
    const codigo = codificarDesafio({ seed: world.seed, curva, indice: world.indiceCiudad });
    const url = `${location.origin}${location.pathname}?reto=${codigo}`;
    const segsTotales = Math.floor(world.tickCount / TICK_RATE);
    const mm = Math.floor(segsTotales / 60);
    const ss = (segsTotales % 60).toString().padStart(2, '0');
    const mensaje = `Sobreviví ${mm}:${ss} con Índice ${world.indiceCiudad}. Misma pandemia, supérame: ${url}`;
    this.ultimoDesafio = { codigo, url, mensaje };

    const textoOriginal = btn.textContent ?? 'COPIAR DESAFÍO';
    const marcarCopiado = (): void => {
      btn.textContent = '¡Copiado!';
      window.setTimeout(() => {
        btn.textContent = textoOriginal;
      }, 2000);
    };
    const mostrarCopiaManual = (): void => {
      const panel = this.el.querySelector('#resultado-manual');
      const input = this.el.querySelector('#resultado-manual-input') as HTMLInputElement | null;
      if (!panel || !input) return;
      panel.classList.add('activo');
      input.value = mensaje;
      input.focus();
      input.select();
    };
    const intentarExecCommand = (): boolean => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = mensaje;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(mensaje)
        .then(marcarCopiado)
        .catch(() => {
          if (intentarExecCommand()) marcarCopiado();
          else mostrarCopiaManual();
        });
    } else if (intentarExecCommand()) {
      marcarCopiado();
    } else {
      mostrarCopiaManual();
    }
  }
}
