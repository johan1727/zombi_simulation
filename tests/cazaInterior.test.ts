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

  it('empate de pisos: el zombi prefiere bajar', () => {
    const w = new World('caza-int-5', 3);
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    const [zombi, arriba, abajo] = w.citizens;
    const cx = b.x + b.width / 2;
    const cz = b.z + 5;
    zombi.salud = 'zombi';
    zombi.dentroDe = b.id; zombi.piso = 1;
    zombi.x = cx; zombi.z = cz; zombi.prevX = cx; zombi.prevZ = cz;
    // el de ARRIBA tiene índice MENOR (aparece primero en la iteración)
    arriba.dentroDe = b.id; arriba.piso = 2; arriba.pisoObjetivo = 2;
    arriba.x = cx; arriba.z = cz; arriba.prevX = cx; arriba.prevZ = cz;
    abajo.dentroDe = b.id; abajo.piso = 0; abajo.pisoObjetivo = 0;
    abajo.x = cx; abajo.z = cz; abajo.prevX = cx; abajo.prevZ = cz;
    w.tick();
    expect(zombi.pisoObjetivo).toBe(0); // empate |2-1| == |0-1| → abajo
  });

  it('el humano de piso intermedio corre HACIA la escalera al ver al zombi', () => {
    const w = new World('caza-int-6', 2);
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    const e = b.escalera!;
    const [zombi, humano] = w.citizens;
    zombi.salud = 'zombi';
    zombi.dentroDe = b.id; zombi.piso = 1;
    zombi.x = b.x + 2; zombi.z = b.z + 2; zombi.prevX = zombi.x; zombi.prevZ = zombi.z;
    humano.dentroDe = b.id; humano.piso = 1; humano.pisoObjetivo = 1;
    humano.x = b.x + 6; humano.z = b.z + 6; humano.prevX = humano.x; humano.prevZ = humano.z;
    humano.dirX = -1; humano.dirZ = 0; // dirección rancia apuntando LEJOS de la escalera
    const ex = e.x + e.width / 2;
    const ez = e.z + e.depth / 2;
    const d0 = Math.sqrt((humano.x - ex) ** 2 + (humano.z - ez) ** 2);
    for (let t = 0; t < 30; t++) w.tick();
    const d1 = Math.sqrt((humano.x - ex) ** 2 + (humano.z - ez) ** 2);
    expect(humano.pisoObjetivo).toBe(2);
    expect(d1).toBeLessThan(d0); // se acerca a la escalera, no se aleja
  });
});
