import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';

export class Hud {
  private readonly el = document.getElementById('hud') as HTMLDivElement;
  private readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
  }

  update(world: World): void {
    const segs = Math.floor(world.tickCount / TICK_RATE);
    const mm = Math.floor(segs / 60);
    const ss = (segs % 60).toString().padStart(2, '0');
    this.el.textContent =
      `Población: ${world.citizens.length} · Tiempo: ${mm}:${ss} · Semilla: ${this.seed}`;
  }
}
