import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';
import type { Partida } from '../game/partida';

export class Hud {
  private readonly el = document.getElementById('hud') as HTMLDivElement;
  private readonly seed: string;
  private ultimo = '';

  constructor(seed: string) {
    this.seed = seed;
  }

  /** `partida` es opcional para no romper llamadas existentes; sin ella el reloj cuenta hacia arriba. */
  update(world: World, partida?: Partida): void {
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
  }
}
