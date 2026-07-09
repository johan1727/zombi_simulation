import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { resolverAsedios } from '../src/sim/asedio';
import { ASEDIO } from '../src/sim/config';

function sitiado(seed: string, nZombis: number): { w: World; id: number } {
  const w = new World(seed, nZombis + 3);
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  for (let i = 0; i < 3; i++) {
    w.citizens[i].dentroDe = b.id;
    w.citizens[i].piso = 1;
  }
  for (let i = 3; i < 3 + nZombis; i++) {
    const z = w.citizens[i];
    z.salud = 'zombi';
    z.x = p.x + (i - 3) * 0.4 - 0.8;
    z.z = p.z + (p.lado === 1 ? -1.5 : p.lado === 3 ? 1.5 : 0);
    if (p.lado === 0) z.x = p.x - 1.5;
    if (p.lado === 2) z.x = p.x + 1.5;
    z.prevX = z.x;
    z.prevZ = z.z;
  }
  w.tick(); // reconstruye dentroPorEdificio/ocupantes/grid
  return { w, id: b.id };
}

describe('asedio físico a la puerta', () => {
  it('cinco zombis en la puerta la rompen', () => {
    const { w, id } = sitiado('asedio-1', 5);
    const ticks = Math.ceil(ASEDIO.resistencia / 5) + 2;
    for (let t = 0; t < ticks; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(true);
  });

  it('sin zombis la presión decae', () => {
    const { w, id } = sitiado('asedio-2', 0);
    for (let t = 0; t < 200; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(false);
    expect(w.presion[id]).toBe(0);
  });

  it('con la puerta rota, los zombis de fuera acaban entrando a cazar', () => {
    const { w, id } = sitiado('asedio-3', 5);
    w.brecha[id] = true;
    let entro = false;
    for (let t = 0; t < 20 * 30; t++) {
      w.tick();
      if (w.citizens.some((c) => c.salud === 'zombi' && c.dentroDe === id)) {
        entro = true;
        break;
      }
    }
    expect(entro).toBe(true);
  });

  it('el drama completo: brecha → entran → los de arriba caen', () => {
    const { w, id } = sitiado('asedio-4', 6);
    for (let t = 0; t < 120 * 30; t++) {
      w.tick();
      if (w.ocupantes[id] === 0) break;
    }
    // en dos minutos el refugio sitiado por 6 zombis no sobrevive intacto
    const vivosDentroSanos = w.citizens.filter(
      (c) => c.dentroDe === id && c.salud === 'sano'
    ).length;
    expect(vivosDentroSanos).toBeLessThan(3);
  });
});
