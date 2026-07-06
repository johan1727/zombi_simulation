import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { intentarRefugio, romperEdificio } from '../src/sim/refugio';
import { buildingAt } from '../src/sim/collision';

function juntoAJugable(w: World, c: World['citizens'][0]): number {
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  c.x = b.x - 1.5; // en la acera, pegado a la pared oeste
  c.z = b.z + 5;
  c.prevX = c.x;
  c.prevZ = c.z;
  return b.id;
}

describe('refugio', () => {
  it('un ciudadano en pánico junto a un edificio jugable entra', () => {
    const w = new World('refugio-1', 5);
    const c = w.citizens[0];
    const id = juntoAJugable(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(id);
    expect(w.ocupantes[id]).toBe(1);
  });

  it('no entra si hay brecha o no hay cupo', () => {
    const w = new World('refugio-2', 5);
    const c = w.citizens[0];
    const id = juntoAJugable(w, c);
    w.brecha[id] = true;
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(-1);
  });

  it('una transformación dentro revienta el edificio: todos salen en pánico a la acera', () => {
    const w = new World('refugio-3', 6);
    const id = juntoAJugable(w, w.citizens[0]);
    for (let i = 0; i < 5; i++) {
      w.citizens[i].dentroDe = id;
      w.ocupantes[id]++;
    }
    w.citizens[0].salud = 'zombi'; // el que se transformó
    romperEdificio(w, id);
    expect(w.brecha[id]).toBe(true);
    expect(w.ocupantes[id]).toBe(0);
    for (let i = 0; i < 5; i++) {
      const o = w.citizens[i];
      expect(o.dentroDe).toBe(-1);
      expect(buildingAt(w.city, o.x, o.z)).toBeNull(); // en la acera, no dentro
      if (o.salud !== 'zombi') expect(o.animo).toBe('panico');
      expect(o.prevX).toBe(o.x); // sin estela
    }
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1);
  });

  it('la incubación sigue corriendo dentro del edificio (bomba de tiempo)', () => {
    const w = new World('refugio-4', 3);
    const c = w.citizens[0];
    const id = juntoAJugable(w, c);
    c.salud = 'incubando';
    c.incubacionTicks = 3;
    c.dentroDe = id;
    w.ocupantes[id] = 1;
    for (let t = 0; t < 5; t++) w.tick();
    expect(c.salud).toBe('zombi');
    expect(w.brecha[id]).toBe(true);
    expect(c.dentroDe).toBe(-1);
  });
});
