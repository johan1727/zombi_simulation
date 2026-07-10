import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

describe('estado del brote (Task 1)', () => {
  it('los ciudadanos nacen sanos, tranquilos y fuera de edificios', () => {
    const w = new World('estado', 100);
    for (const c of w.citizens) {
      expect(c.salud).toBe('sano');
      expect(c.animo).toBe('tranquilo');
      expect(c.dentroDe).toBe(-1);
      expect(c.incubacionTicks).toBe(0);
      expect(c.cdMordida).toBe(0);
    }
    // Plan 4: World añade 4 agentes del jugador (sanos) al final del array,
    // sin importar citizenCount — 100 civiles + 4 agentes = 104 vivos.
    expect(w.stats).toEqual({ vivos: 104, zombis: 0 });
    expect(w.splats).toEqual([]);
    expect(w.ruidos).toEqual([]);
    expect(w.ocupantes.length).toBe(w.city.buildings.length);
    expect(w.brecha.length).toBe(w.city.buildings.length);
  });

  it('los streams por subsistema mantienen el determinismo', () => {
    const a = new World('streams', 200);
    const b = new World('streams', 200);
    for (let t = 0; t < 300; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
