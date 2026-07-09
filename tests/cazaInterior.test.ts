import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

function encierra(seed: string): { w: World; zombi: World['citizens'][0]; presa: World['citizens'][0]; id: number } {
  const w = new World(seed, 2);
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const [zombi, presa] = w.citizens;
  const cx = b.x + b.width / 2;
  const cz = b.z + b.depth / 2;
  zombi.salud = 'zombi';
  zombi.dentroDe = b.id;
  zombi.piso = 0;
  zombi.x = cx - 5; zombi.z = cz; zombi.prevX = zombi.x; zombi.prevZ = zombi.z;
  presa.dentroDe = b.id;
  presa.piso = 0;
  presa.animo = 'tranquilo';
  presa.pisoObjetivo = 0;
  presa.x = cx + 5; presa.z = cz; presa.prevX = presa.x; presa.prevZ = presa.z;
  return { w, zombi, presa, id: b.id };
}

describe('caza interior', () => {
  it('el zombi caza dentro del edificio y la presa reacciona', () => {
    const { w, presa } = encierra('caza-int-1');
    for (let t = 0; t < 30 * 30; t++) w.tick();
    // la presa fue mordida, o escapó del edificio, o subió de piso — pero NO sigue tranquila en su sitio
    const sigueTranquilaAhi = presa.salud === 'sano' && presa.dentroDe >= 0 && presa.piso === 0 && presa.animo === 'tranquilo';
    expect(sigueTranquilaAhi).toBe(false);
  });

  it('un zombi sin presa en su piso va a la escalera y cambia de piso', () => {
    const { w, zombi, presa } = encierra('caza-int-2');
    presa.piso = 1; // la presa está arriba
    for (let t = 0; t < 60 * 30; t++) {
      w.tick();
      if (zombi.piso === 1) break;
    }
    expect(zombi.piso).toBe(1);
  });

  it('edificio vacío: el zombi de planta baja sale a la calle', () => {
    const { w, zombi, presa } = encierra('caza-int-3');
    presa.salud = 'eliminado'; // no queda nadie
    for (let t = 0; t < 60 * 30; t++) {
      w.tick();
      if (zombi.dentroDe < 0) break;
    }
    expect(zombi.dentroDe).toBe(-1);
  });

  it('gemelos deterministas con caza interior', () => {
    const a = new World('caza-int-4', 300);
    const b = new World('caza-int-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
