import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { TICK_RATE } from '../src/sim/config';

function prepara(): { w: World; zombi: World['citizens'][0]; presa: World['citizens'][0] } {
  const w = new World('caza-1', 2);
  const [zombi, presa] = w.citizens;
  zombi.salud = 'zombi';
  zombi.x = 50; zombi.z = 4; zombi.prevX = 50; zombi.prevZ = 4;
  presa.x = 58; presa.z = 4; presa.prevX = 58; presa.prevZ = 4;
  presa.dirX = 0; presa.dirZ = 1; // que no huya en línea recta por construcción
  return { w, zombi, presa };
}

describe('zombis', () => {
  it('persigue y muerde a la presa más cercana', () => {
    const { w, presa } = prepara();
    // La presa puede entrar en pánico y huir (Task 6): dar margen extra
    // sobre el tiempo que tardaría un zombi en alcanzarla caminando.
    for (let t = 0; t < 20 * TICK_RATE; t++) w.tick();
    expect(presa.salud).not.toBe('sano'); // fue mordida (incubando o ya zombi)
  });

  it('la mordida genera un grito (ruido)', () => {
    const { w, zombi, presa } = prepara();
    for (let t = 0; t < 20 * TICK_RATE; t++) {
      w.tick();
      if (presa.salud !== 'sano') break;
    }
    expect(presa.salud).not.toBe('sano'); // fue mordida
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1); // la mordida (o el pánico) genera grito
    expect(zombi.cdMordida).toBeGreaterThanOrEqual(0);
  });

  it('los ruidos decaen y desaparecen', () => {
    const w = new World('caza-2', 1);
    w.ruidos.push({ x: 10, z: 10, radio: 12, ticks: 3 });
    for (let t = 0; t < 5; t++) w.tick();
    expect(w.ruidos.length).toBe(0);
  });

  it('sin presa a la vista, erra sin congelarse', () => {
    const w = new World('caza-3', 1);
    const z = w.citizens[0];
    z.salud = 'zombi';
    const x0 = z.x;
    const z0 = z.z;
    for (let t = 0; t < 5 * TICK_RATE; t++) w.tick();
    const movio = Math.abs(z.x - x0) + Math.abs(z.z - z0) > 0.5;
    expect(movio).toBe(true);
  });
});
