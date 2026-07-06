import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { TICK_RATE } from '../src/sim/config';

describe('balance del brote (sin intervención del jugador)', () => {
  it(
    'la ciudad colapsa (<20% vivos) entre 1:30 y 8:00',
    () => {
      const w = new World('balance-1');
      const limite = 8 * 60 * TICK_RATE;
      let colapso = -1;
      for (let t = 0; t < limite; t++) {
        w.tick();
        if (w.stats.vivos <= w.citizens.length * 0.2) {
          colapso = t;
          break;
        }
      }
      expect(colapso).toBeGreaterThan(90 * TICK_RATE);
      expect(colapso).toBeLessThan(limite);
    },
    180_000
  );

  it(
    'con otra semilla también colapsa dentro de la ventana',
    () => {
      const w = new World('balance-2');
      const limite = 8 * 60 * TICK_RATE;
      let colapso = -1;
      for (let t = 0; t < limite; t++) {
        w.tick();
        if (w.stats.vivos <= w.citizens.length * 0.2) {
          colapso = t;
          break;
        }
      }
      expect(colapso).toBeGreaterThan(90 * TICK_RATE);
      expect(colapso).toBeLessThan(limite);
    },
    180_000
  );
});
