import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { intentarRefugio, intentarEntradaAgente } from '../src/sim/refugio';

function juntoAPuerta(w: World, c: World['citizens'][0]): number {
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  const fuera: ReadonlyArray<readonly [number, number]> = [[-1.5, 0], [0, -1.5], [1.5, 0], [0, 1.5]];
  c.x = p.x + fuera[p.lado][0];
  c.z = p.z + fuera[p.lado][1];
  c.prevX = c.x;
  c.prevZ = c.z;
  return b.id;
}

describe('refugio por la puerta', () => {
  it('un ciudadano en pánico junto a la puerta entra y cuenta como ocupante', () => {
    const w = new World('refugio-1', 5);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(id);
    w.tick();
    expect(w.ocupantes[id]).toBe(1);
  });

  it('no entra si hay brecha', () => {
    const w = new World('refugio-2', 5);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    w.brecha[id] = true;
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(-1);
  });

  it('la incubación sigue dentro y el zombi se queda dentro (bomba de tiempo silenciosa)', () => {
    const w = new World('refugio-3', 4);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    c.salud = 'incubando';
    c.incubacionTicks = 3;
    for (let t = 0; t < 6; t++) w.tick();
    expect(c.salud).toBe('zombi');
    expect(c.dentroDe).toBe(id); // ya no hay expulsión
    w.tick();
    expect(w.ocupantes[id]).toBe(0); // el zombi no cuenta como ocupante humano
  });

  it('intentarEntradaAgente entra en planta baja (el jugador decide el piso, no instinto de esconderse)', () => {
    const w = new World('refugio-agente-1', 5);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    intentarEntradaAgente(c, w);
    expect(c.dentroDe).toBe(id);
    expect(c.pisoObjetivo).toBe(0); // NO sube sola, a diferencia de intentarRefugio
  });
});
