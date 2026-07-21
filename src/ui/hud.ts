import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';
import type { Partida } from '../game/partida';
import type { RivalComparable } from '../game/rival';
import type { Desafio } from '../game/desafio';
import { escapeHtml } from './resultado';

/** Duración del aviso flotante de brecha del rival. */
const DURACION_AVISO_MS = 3000;
/** Duración del aviso de giro de semilla (apagón/lluvia/helicóptero), pedida por el brief: 4 s. */
const DURACION_AVISO_EVENTO_MS = 4000;

const MENSAJE_EVENTO: Record<'apagon' | 'lluvia' | 'helicoptero', string> = {
  apagon: '¡Apagón en toda la ciudad!',
  lluvia: 'Empieza a llover',
  helicoptero: 'Helicóptero de rescate en camino — azotea del hospital, 60s',
};

export class Hud {
  private readonly el = document.getElementById('hud') as HTMLDivElement;
  private readonly marcadorEl = document.getElementById('marcador-rival') as HTMLDivElement;
  private readonly avisoEl = document.getElementById('aviso-rival') as HTMLDivElement;
  private readonly avisoEventoEl = document.getElementById('aviso-evento') as HTMLDivElement;
  private readonly bannerRetoEl = document.getElementById('banner-reto') as HTMLDivElement | null;
  private readonly btnAudioEl = document.getElementById('btn-audio') as HTMLButtonElement | null;
  private readonly seed: string;
  private ultimo = '';
  private ultimoMarcador = '';
  /** Cuántos avisos de `rival.avisosBrecha` ya se mostraron. */
  private avisosVistos = 0;
  private avisoOcultarEn = 0;
  /** true una vez que ya se mostró el aviso del giro de semilla (evita repetirlo cada frame mientras `evento.activo` siga en true). */
  private avisoEventoMostrado = false;
  private avisoEventoOcultarEn = 0;
  private ultimoAudioHabilitado: boolean | null = null;

  /**
   * `reto` (Task 7): si viene presente (partida cargada con `?reto=`),
   * el banner superior queda fijo desde la construcción — no cambia frame a
   * frame, así que no hace falta tocar `update()` para esto.
   *
   * `onToggleAudio` (Task 8): click en el botón 🔊/🔇 del HUD. El estado
   * real (`Audio.habilitado`) vive en la clase `Audio`; el HUD solo pinta el
   * ícono acorde a lo que le pase `update()` — así el toggle por tecla `M`
   * (cableado en `main.ts`, fuera del HUD) también refleja el ícono.
   */
  constructor(seed: string, reto?: Desafio, onToggleAudio?: () => void) {
    this.seed = seed;
    this.btnAudioEl?.addEventListener('click', () => onToggleAudio?.());
    if (reto && this.bannerRetoEl) {
      const nombre = reto.nombre?.trim() || 'un desconocido';
      // "el N%": el último valor conocido de la curva del reto (vivosPct
      // final), no el índice de ciudad — el índice puede pasar de 100 y el
      // banner promete explícitamente un "%".
      const n = Math.round(reto.curva.length > 0 ? reto.curva[reto.curva.length - 1] : reto.indice);
      this.bannerRetoEl.textContent = `RETO: supera el ${n}% de ${nombre}`;
      this.bannerRetoEl.classList.add('activo');
    }
  }

  /**
   * Sello de anti-trampas (Plan 17 Task 3): `main.ts` llama esto solo si
   * `consultarVerificado()` contra el servidor de verificación (best-effort,
   * con timeout corto) confirmó que ESTE desafío exacto ya fue validado por
   * un replay real al compartirse. Nunca se llama si el servidor no
   * responde o el desafío no está en su caché — el banner simplemente se
   * queda sin sello, sin bloquear ni afectar nada del arranque del juego.
   */
  marcarRetoVerificado(): void {
    if (!this.bannerRetoEl) return;
    this.bannerRetoEl.textContent = `${this.bannerRetoEl.textContent ?? ''} ✅ verificado`;
  }

  /** `partida` y `rival` son opcionales para no romper llamadas existentes. */
  update(world: World, partida?: Partida, rival?: RivalComparable, audioHabilitado?: boolean): void {
    const restantes = partida
      ? Math.max(0, partida.duracionTicks - world.tickCount)
      : world.tickCount;
    const segs = Math.floor(restantes / TICK_RATE);
    const mm = Math.floor(segs / 60);
    const ss = (segs % 60).toString().padStart(2, '0');
    const { vivos, zombis } = world.stats;
    const indice = world.indiceCiudad;
    const rojo = segs < 60;
    const claseReloj = rojo ? 'hud-reloj hud-reloj-rojo' : 'hud-reloj';
    // La semilla puede venir de un ?reto= armado por un desconocido: SIEMPRE escapar antes de innerHTML.
    const html = `Vivos: ${vivos} · Zombis: ${zombis} · Tiempo: <span class="${claseReloj}">${mm}:${ss}</span> · Índice: ${indice} · Semilla: ${escapeHtml(this.seed)}`;
    if (html !== this.ultimo) {
      this.ultimo = html;
      this.el.innerHTML = html;
    }

    if (rival) this.actualizarMarcadorRival(world, rival);
    this.actualizarAvisoEvento(world);

    if (audioHabilitado !== undefined && audioHabilitado !== this.ultimoAudioHabilitado) {
      this.ultimoAudioHabilitado = audioHabilitado;
      if (this.btnAudioEl) {
        this.btnAudioEl.textContent = audioHabilitado ? '🔊' : '🔇';
        this.btnAudioEl.title = audioHabilitado ? 'Silenciar (M)' : 'Activar audio (M)';
      }
    }
  }

  /** Aviso de 4 s cuando `world.evento.activo` pasa a true por primera vez (mismo patrón que `avisoEl` de brecha del rival). */
  private actualizarAvisoEvento(world: World): void {
    if (world.evento.activo && !this.avisoEventoMostrado) {
      this.avisoEventoMostrado = true;
      this.avisoEventoEl.textContent = MENSAJE_EVENTO[world.evento.tipo];
      this.avisoEventoEl.classList.add('activo');
      this.avisoEventoOcultarEn = Date.now() + DURACION_AVISO_EVENTO_MS;
    }
    if (this.avisoEventoOcultarEn > 0 && Date.now() >= this.avisoEventoOcultarEn) {
      this.avisoEventoEl.classList.remove('activo');
      this.avisoEventoOcultarEn = 0;
    }
  }

  private actualizarMarcadorRival(world: World, rival: RivalComparable): void {
    const tuPct = Math.round(world.vivosPct);
    const rivalPct = Math.round(rival.vivosPct);
    const clase =
      tuPct === rivalPct ? '' : tuPct > rivalPct ? 'marcador-arriba' : 'marcador-abajo';
    const texto = `TÚ ${tuPct}% · RIVAL ${rivalPct}%`;
    if (texto !== this.ultimoMarcador || this.marcadorEl.className !== clase) {
      this.ultimoMarcador = texto;
      this.marcadorEl.textContent = texto;
      this.marcadorEl.className = clase;
    }

    if (rival.avisosBrecha.length > this.avisosVistos) {
      this.avisosVistos = rival.avisosBrecha.length;
      this.avisoEl.textContent = '¡Al rival se le cayó un refugio!';
      this.avisoEl.classList.add('activo');
      this.avisoOcultarEn = Date.now() + DURACION_AVISO_MS;
    }
    if (this.avisoOcultarEn > 0 && Date.now() >= this.avisoOcultarEn) {
      this.avisoEl.classList.remove('activo');
      this.avisoOcultarEn = 0;
    }
  }
}
