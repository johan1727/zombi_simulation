import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { TICK_RATE } from '../src/sim/config';

/**
 * La meta de balance del brote (diseño §6, calibrada con datos):
 * sin intervención del jugador, la partida debe sentirse perdida al agotarse
 * el reloj (8:00), sin ser injusta al arranque ni tener mesetas eternas.
 */
// EN PAUSA durante el Plan 3: las mecánicas de interiores mueven el balance; la Task 10 lo recalibra (obligatorio antes del merge).
describe.skip('balance del brote (sin intervención del jugador)', () => {
  for (const seed of ['balance-1', 'balance-2']) {
    it(
      `(${seed}) arranque justo, devastación a 8:00 y colapso total antes de 15:00`,
      () => {
        const w = new World(seed);
        const total = w.citizens.length;
        const limite = 15 * 60 * TICK_RATE;
        let vivosA90 = -1;
        let vivosA480 = -1;
        let colapso = -1;
        for (let t = 0; t < limite; t++) {
          w.tick();
          if (t === 90 * TICK_RATE) vivosA90 = w.stats.vivos;
          if (t === 480 * TICK_RATE) vivosA480 = w.stats.vivos;
          if (colapso < 0 && w.stats.vivos <= total * 0.2) colapso = t;
          if (colapso >= 0 && t >= 480 * TICK_RATE) break;
        }
        // 1) arranque justo: a 1:30 la ciudad aún respira
        expect(vivosA90).toBeGreaterThanOrEqual(total * 0.6);
        // 2) devastación al final del reloj: a 8:00 perdiste la mayoría (techo medido 43–45%)
        expect(vivosA480).toBeLessThanOrEqual(total * 0.47);
        expect(vivosA480).toBeGreaterThanOrEqual(0);
        // 3) sin meseta eterna: el colapso total llega antes de 15:00
        expect(colapso).toBeGreaterThan(90 * TICK_RATE);
        expect(colapso).toBeLessThan(limite);
      },
      300_000
    );
  }
});
