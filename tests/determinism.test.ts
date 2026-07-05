import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { isStreet } from '../src/sim/cityGen';

// EL test más importante del proyecto (ver CLAUDE.md).
describe('determinismo del mundo', () => {
  it('misma semilla → estado idéntico tras 30 segundos simulados', () => {
    const a = new World('duelo-1', 300);
    const b = new World('duelo-1', 300);
    for (let t = 0; t < 900; t++) {
      a.tick();
      b.tick();
    }
    expect(a.tickCount).toBe(900);
    expect(a.hashState()).toBe(b.hashState());
  });

  it('semillas distintas → estados distintos', () => {
    const a = new World('duelo-1', 300);
    const b = new World('duelo-2', 300);
    for (let t = 0; t < 900; t++) {
      a.tick();
      b.tick();
    }
    expect(a.hashState()).not.toBe(b.hashState());
  });

  it('los ciudadanos siguen sobre las calles tras 30 segundos caminando', () => {
    const w = new World('caminata', 300);
    for (let t = 0; t < 900; t++) w.tick();
    for (const c of w.citizens) expect(isStreet(c.x, c.z)).toBe(true);
  });

  it('los ciudadanos se mueven de verdad (no están congelados)', () => {
    const w = new World('caminata', 300);
    const inicioX = w.citizens.map((c) => c.x);
    for (let t = 0; t < 300; t++) w.tick();
    const movidos = w.citizens.filter((c, i) => Math.abs(c.x - inicioX[i]) > 0.01);
    expect(movidos.length).toBeGreaterThan(50);
  });
});
