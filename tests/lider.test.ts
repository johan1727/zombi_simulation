import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { PANICO } from '../src/sim/config';

/** Fuerza a un ciudadano recién nacido a un estado "en la calle" conocido:
 * con Plan 19 una fracción de familias nace ya `dentroDe >= 0`, y esta
 * escena depende de que los tres estén afuera para que panico.ts (no
 * interior.ts) gobierne su movimiento. */
function enLaCalle(c: World['citizens'][0], x: number, z: number): void {
  c.dentroDe = -1;
  c.piso = 0;
  c.pisoObjetivo = 0;
  c.escaleraTicks = 0;
  c.x = x; c.z = z; c.prevX = x; c.prevZ = z;
}

function escena(seed: string, conLider: boolean): { w: World; asustado: World['citizens'][0] } {
  const w = new World(seed, 3);
  const [asustado, lider, otro] = w.citizens;
  enLaCalle(asustado, 50, 4);
  asustado.animo = 'panico';
  asustado.animoTicks = 0;
  asustado.personality = 'cobarde';
  enLaCalle(lider, 53, 4);
  lider.personality = conLider ? 'lider' : 'cobarde';
  enLaCalle(otro, 200, 200);
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
