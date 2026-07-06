import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { resolverAsedios } from '../src/sim/asedio';
import { ASEDIO } from '../src/sim/config';
import { buildingAt } from '../src/sim/collision';

/** Prepara un refugio ocupado con `nZombis` pegados a la pared. */
function sitiado(seed: string, nZombis: number): { w: World; id: number } {
  const w = new World(seed, nZombis + 3);
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  // 3 refugiados dentro
  for (let i = 0; i < 3; i++) {
    w.citizens[i].dentroDe = b.id;
  }
  w.ocupantes[b.id] = 3;
  // zombis pegados a la pared oeste
  for (let i = 3; i < 3 + nZombis; i++) {
    const z = w.citizens[i];
    z.salud = 'zombi';
    z.x = b.x - 1;
    z.z = b.z + 4 + i;
    z.prevX = z.x;
    z.prevZ = z.z;
  }
  w.grid.rebuild(w.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
  return { w, id: b.id };
}

describe('asedio a refugios', () => {
  it('cinco zombis pegados revientan un refugio ocupado', () => {
    const { w, id } = sitiado('asedio-1', 5);
    const ticksNecesarios = Math.ceil(ASEDIO.resistencia / (5 * ASEDIO.presionPorZombi));
    for (let t = 0; t < ticksNecesarios + 2; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(true);
    // los refugiados salieron a la acera, en pánico
    for (let i = 0; i < 3; i++) {
      expect(w.citizens[i].dentroDe).toBe(-1);
      expect(w.citizens[i].animo).toBe('panico');
      expect(buildingAt(w.city, w.citizens[i].x, w.citizens[i].z)).toBeNull();
    }
  });

  it('sin zombis, la presión decae y no hay brecha', () => {
    const { w, id } = sitiado('asedio-2', 0);
    for (let t = 0; t < 200; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(false);
    expect(w.presion[id]).toBe(0);
  });

  it('un edificio vacío no acumula presión ni hace ruido', () => {
    const { w, id } = sitiado('asedio-3', 4);
    // vaciar el refugio
    for (let i = 0; i < 3; i++) w.citizens[i].dentroDe = -1;
    w.ocupantes[id] = 0;
    for (let t = 0; t < 100; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(false);
    expect(w.presion[id]).toBe(0);
  });

  it('los refugios ocupados emiten ruido periódico (atrae zombis)', () => {
    const { w } = sitiado('asedio-4', 0);
    w.tickCount = ASEDIO.ruidoCadaTicks; // tick múltiplo exacto
    resolverAsedios(w);
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1);
  });
});
