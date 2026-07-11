import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';
import type { Partida } from '../game/partida';
import type { Rival } from '../game/rival';

/** Duración del aviso flotante de brecha del rival. */
const DURACION_AVISO_MS = 3000;

export class Hud {
  private readonly el = document.getElementById('hud') as HTMLDivElement;
  private readonly marcadorEl = document.getElementById('marcador-rival') as HTMLDivElement;
  private readonly avisoEl = document.getElementById('aviso-rival') as HTMLDivElement;
  private readonly seed: string;
  private ultimo = '';
  private ultimoMarcador = '';
  /** Cuántos avisos de `rival.avisosBrecha` ya se mostraron. */
  private avisosVistos = 0;
  private avisoOcultarEn = 0;

  constructor(seed: string) {
    this.seed = seed;
  }

  /** `partida` y `rival` son opcionales para no romper llamadas existentes. */
  update(world: World, partida?: Partida, rival?: Rival): void {
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
    const html = `Vivos: ${vivos} · Zombis: ${zombis} · Tiempo: <span class="${claseReloj}">${mm}:${ss}</span> · Índice: ${indice} · Semilla: ${this.seed}`;
    if (html !== this.ultimo) {
      this.ultimo = html;
      this.el.innerHTML = html;
    }

    if (rival) this.actualizarMarcadorRival(world, rival);
  }

  private actualizarMarcadorRival(world: World, rival: Rival): void {
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
