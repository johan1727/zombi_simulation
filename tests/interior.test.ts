import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { intentarRefugio } from '../src/sim/refugio';
import { enPuerta, moverInterior } from '../src/sim/interior';
import { INTERIOR } from '../src/sim/config';

function juntoAPuerta(w: World, c: World['citizens'][0]): number {
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  // 1.5 m FUERA de la puerta, sobre la acera
  const fuera: ReadonlyArray<readonly [number, number]> = [[-1.5, 0], [0, -1.5], [1.5, 0], [0, 1.5]];
  c.x = p.x + fuera[p.lado][0];
  c.z = p.z + fuera[p.lado][1];
  c.prevX = c.x;
  c.prevZ = c.z;
  return b.id;
}

describe('vida interior', () => {
  it('se entra por la puerta, no por las paredes', () => {
    const w = new World('puerta-1', 5);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(id);
    expect(c.piso).toBe(0);
    // otro ciudadano pegado a una pared SIN puerta no entra
    const b = w.city.buildings[id];
    const c2 = w.citizens[1];
    c2.x = b.x + b.width / 2;
    c2.z = b.puerta!.lado === 1 ? b.z + b.depth + 1 : b.z - 1; // pared opuesta a la puerta
    c2.animo = 'panico';
    intentarRefugio(c2, w);
    expect(c2.dentroDe).toBe(-1);
  });

  it('moverInterior no atraviesa paredes y sí sale por la puerta', () => {
    const w = new World('puerta-2', 3);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    const b = w.city.buildings[id];
    // intento de atravesar una pared lateral: queda clampado dentro
    moverInterior(b, c, b.x - 5, c.z);
    expect(c.dentroDe).toBe(id);
    expect(c.x).toBeGreaterThanOrEqual(b.x);
    // salida por la puerta: destino un paso más allá del hueco
    const p = b.puerta!;
    c.piso = 0;
    c.x = p.x;
    c.z = p.z; // parado en el hueco
    const fuera: ReadonlyArray<readonly [number, number]> = [[-0.5, 0], [0, -0.5], [0.5, 0], [0, 0.5]];
    moverInterior(b, c, p.x + fuera[p.lado][0], p.z + fuera[p.lado][1]);
    expect(c.dentroDe).toBe(-1);
  });

  it('sube por la escalera al piso 1 y el hash registra el piso', () => {
    // seed elegida para que el paciente cero (Plan 2) NO sea citizens[0]:
    // con 'puerta-3' este ciudadano se infectaba a los 5s y (desde la Task 4
    // de caza interior) el zombi solitario abandonaba el edificio, tirando
    // abajo la premisa original del test (que se quedaría quieto en piso 1).
    const w = new World('escalera-t4', 3);
    const c = w.citizens[0];
    juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.pisoObjetivo).toBe(1);
    for (let t = 0; t < 60 * 30; t++) w.tick();
    expect(c.piso).toBe(1);
  });

  it('enPuerta distingue hueco de pared', () => {
    const w = new World('puerta-4', 1);
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    const p = b.puerta!;
    expect(enPuerta(b, p.x, p.z)).toBe(true);
    // a más de anchoPuerta/2 del centro del hueco, sobre la misma pared: es pared
    const lejos = INTERIOR.anchoPuerta / 2 + 1;
    if (p.lado === 0 || p.lado === 2) expect(enPuerta(b, p.x, p.z + lejos)).toBe(false);
    else expect(enPuerta(b, p.x + lejos, p.z)).toBe(false);
  });

  it('dos mundos con interiores siguen siendo gemelos', () => {
    const a = new World('puerta-5', 300);
    const b = new World('puerta-5', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });

  it('la salida por la puerta deja al ciudadano fuera de verdad (banda de 0.3 m)', async () => {
    const { buildingAt } = await import('../src/sim/collision');
    const w = new World('puerta-6', 2);
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    const p = b.puerta!;
    const c = w.citizens[0];
    c.dentroDe = b.id;
    c.piso = 0;
    c.pisoObjetivo = 0;
    // parado a 10 cm DENTRO del muro real, en el hueco de la puerta
    const dentro: ReadonlyArray<readonly [number, number]> = [[0.1, 0], [0, 0.1], [-0.1, 0], [0, -0.1]];
    c.x = p.x + dentro[p.lado][0];
    c.z = p.z + dentro[p.lado][1];
    c.prevX = c.x;
    c.prevZ = c.z;
    // paso diminuto hacia fuera (como un tick real), cae dentro de la banda ambigua
    const paso: ReadonlyArray<readonly [number, number]> = [[-0.09, 0], [0, -0.09], [0.09, 0], [0, 0.09]];
    moverInterior(b, c, c.x + paso[p.lado][0], c.z + paso[p.lado][1]);
    expect(c.dentroDe).toBe(-1);
    expect(buildingAt(w.city, c.x, c.z)).toBeNull(); // fuera DE VERDAD
  });
});
