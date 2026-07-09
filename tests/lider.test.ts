import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { PANICO } from '../src/sim/config';

function escena(seed: string, conLider: boolean): { w: World; asustado: World['citizens'][0] } {
  const w = new World(seed, 3);
  const [asustado, lider, otro] = w.citizens;
  asustado.x = 50; asustado.z = 4; asustado.prevX = 50; asustado.prevZ = 4;
  asustado.animo = 'panico';
  asustado.animoTicks = 0;
  asustado.personality = 'cobarde';
  lider.x = 53; lider.z = 4; lider.prevX = 53; lider.prevZ = 4;
  lider.personality = conLider ? 'lider' : 'cobarde';
  otro.x = 200; otro.z = 200; otro.prevX = 200; otro.prevZ = 200;
  return { w, asustado };
}

describe('líder', () => {
  it('con un líder cerca, el pánico se pasa antes', () => {
    const sin = escena('lider-1', false);
    const con = escena('lider-1', true);
    let ticksSin = -1;
    let ticksCon = -1;
    for (let t = 0; t < PANICO.ticksCalmarse + 60; t++) {
      sin.w.tick();
      con.w.tick();
      if (ticksSin < 0 && sin.asustado.animo === 'tranquilo') ticksSin = t;
      if (ticksCon < 0 && con.asustado.animo === 'tranquilo') ticksCon = t;
    }
    expect(ticksCon).toBeGreaterThanOrEqual(0);
    expect(ticksSin < 0 || ticksCon < ticksSin).toBe(true);
  });

  it('los asustados sin zombis a la vista siguen al líder', () => {
    const { w, asustado } = escena('lider-2', true);
    const lider = w.citizens[1];
    const d0 = Math.abs(asustado.x - lider.x);
    w.tick();
    const d1 = Math.sqrt((asustado.x - lider.x) ** 2 + (asustado.z - lider.z) ** 2);
    expect(d1).toBeLessThanOrEqual(d0 + 0.01); // no se aleja del líder
  });

  it('gemelos deterministas con líderes', () => {
    const a = new World('lider-3', 300);
    const b = new World('lider-3', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
