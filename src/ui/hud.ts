import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';

export class Hud {
  private readonly el = document.getElementById('hud') as HTMLDivElement;
  private readonly seed: string;
  private ultimo = '';

  constructor(seed: string) {
    this.seed = seed;
  }

  update(world: World): void {
    const segs = Math.floor(world.tickCount / TICK_RATE);
    const mm = Math.floor(segs / 60);
    const ss = (segs % 60).toString().padStart(2, '0');
    const { vivos, zombis } = world.stats;
    const texto = `Vivos: ${vivos} · Zombis: ${zombis} · Tiempo: ${mm}:${ss} · Semilla: ${this.seed}`;
    if (texto !== this.ultimo) {
      this.ultimo = texto;
      this.el.textContent = texto;
    }
  }
}
