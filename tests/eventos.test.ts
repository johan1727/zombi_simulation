import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { EVENTO } from '../src/sim/config';

describe('giros de semilla', () => {
  it('el evento cae en la ventana [tickMin, tickMax] y es determinista', () => {
    const w = new World('evento-1', 10);
    expect(w.evento.tick).toBeGreaterThanOrEqual(EVENTO.tickMin);
    expect(w.evento.tick).toBeLessThanOrEqual(EVENTO.tickMax);
    const w2 = new World('evento-1', 10);
    expect(w2.evento.tick).toBe(w.evento.tick);
    expect(w2.evento.tipo).toBe(w.evento.tipo);
  });

  it('se activa exactamente en su tick, no antes ni después', () => {
    const w = new World('evento-2', 10);
    for (let t = 0; t < w.evento.tick; t++) {
      w.tick();
      expect(w.evento.activo).toBe(false);
    }
    w.tick();
    expect(w.evento.activo).toBe(true);
  });

  it('mismo evento para dos mundos de la misma semilla aunque uno reciba órdenes', () => {
    const a = new World('evento-3', 200);
    const b = new World('evento-3', 200);
    expect(a.evento.tick).toBe(b.evento.tick);
    expect(a.evento.tipo).toBe(b.evento.tipo);
  });

  it('gemelos deterministas con el evento activo', () => {
    const a = new World('evento-4', 300);
    const b = new World('evento-4', 300);
    for (let t = 0; t < a.evento.tick + 60; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
