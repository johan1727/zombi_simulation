import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { INFECCION, TICK_RATE } from '../src/sim/config';

describe('infección', () => {
  it('el paciente cero aparece en el tick configurado y es determinista', () => {
    const a = new World('brote-1', 300);
    const b = new World('brote-1', 300);
    for (let t = 0; t <= INFECCION.pacienteCeroTick; t++) { a.tick(); b.tick(); }
    const infA = a.citizens.findIndex((c) => c.salud === 'incubando');
    const infB = b.citizens.findIndex((c) => c.salud === 'incubando');
    expect(infA).toBeGreaterThanOrEqual(0);
    expect(infA).toBe(infB);
  });

  it('la incubación dura entre 10 y 20 segundos y termina en zombi con salpicadura', () => {
    const w = new World('brote-2', 300);
    for (let t = 0; t <= INFECCION.pacienteCeroTick; t++) w.tick();
    const c = w.citizens.find((x) => x.salud === 'incubando')!;
    expect(c.incubacionTicks).toBeGreaterThanOrEqual(10 * TICK_RATE - 1);
    expect(c.incubacionTicks).toBeLessThanOrEqual(20 * TICK_RATE);
    for (let t = 0; t < 20 * TICK_RATE + 5; t++) w.tick();
    expect(c.salud).toBe('zombi');
    expect(w.splats.length).toBeGreaterThanOrEqual(1);
    expect(w.stats.zombis).toBeGreaterThanOrEqual(1);
  });

  it('infectar es idempotente sobre no-sanos', () => {
    const w = new World('brote-3', 10);
    const c = w.citizens[0];
    c.salud = 'zombi';
    const antes = w.hashState();
    // infectar no debe tocar a un zombi
    // (se importa aquí para probar la función pura)
    return import('../src/sim/infeccion').then(({ infectar }) => {
      infectar(c, w.rngInfeccion);
      expect(c.salud).toBe('zombi');
      expect(w.hashState()).toBe(antes);
    });
  });
});
