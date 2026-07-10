import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { resolverCombates } from '../src/sim/combate';

function escena(seed: string, humanos: number, conValiente: boolean): World {
  const w = new World(seed, humanos + 1);
  const z = w.citizens[0];
  z.salud = 'zombi';
  z.x = 50; z.z = 4;
  for (let i = 1; i <= humanos; i++) {
    const h = w.citizens[i];
    h.x = 50 + (i % 2 === 0 ? 1 : -1) * (0.8 + i * 0.1);
    h.z = 4 + (i % 3 === 0 ? 1 : -0.5);
    h.personality = conValiente && i === 1 ? 'valiente' : 'cobarde';
  }
  w.grid.rebuild(w.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
  return w;
}

describe('combate en grupo', () => {
  it('3 humanos con un valiente eliminan a un zombi aislado', () => {
    const w = escena('pelea-1', 3, true);
    resolverCombates(w);
    expect(w.citizens[0].salud).toBe('eliminado');
    expect(w.splats.length).toBe(1);
  });

  it('sin valiente no se atreven', () => {
    const w = escena('pelea-2', 3, false);
    resolverCombates(w);
    expect(w.citizens[0].salud).toBe('zombi');
  });

  it('2 humanos no bastan', () => {
    const w = escena('pelea-3', 2, true);
    resolverCombates(w);
    expect(w.citizens[0].salud).toBe('zombi');
  });

  it('un agente caído no cuenta como luchador', () => {
    const w = escena('pelea-caido', 2, false); // 2 civiles cobardes: no bastan
    const agente = w.agentes[0]; // policia, personality 'valiente'
    agente.salud = 'caido';
    agente.caidoTicks = 900;
    agente.x = w.citizens[0].x + 1;
    agente.z = w.citizens[0].z;
    agente.prevX = agente.x;
    agente.prevZ = agente.z;
    w.grid.rebuild(w.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
    resolverCombates(w);
    // sin el caído no hay valiente NI tercer luchador: el zombi sigue vivo
    expect(w.citizens[0].salud).toBe('zombi');
  });

  it('es determinista (mismo seed ⇒ mismo resultado de infección)', () => {
    const a = escena('pelea-4', 4, true);
    const b = escena('pelea-4', 4, true);
    resolverCombates(a);
    resolverCombates(b);
    expect(a.hashState()).toBe(b.hashState());
  });
});
