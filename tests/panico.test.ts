import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { isStreet } from '../src/sim/cityGen';
import { PANICO, TICK_RATE } from '../src/sim/config';

function conZombi(seed: string): { w: World; humano: World['citizens'][0]; zombi: World['citizens'][0] } {
  const w = new World(seed, 2);
  const [humano, zombi] = w.citizens;
  zombi.salud = 'zombi';
  zombi.x = 50; zombi.z = 4; zombi.prevX = 50; zombi.prevZ = 4;
  humano.x = 56; humano.z = 4; humano.prevX = 56; humano.prevZ = 4;
  humano.personality = 'cobarde';
  return { w, humano, zombi };
}

describe('pánico', () => {
  it('un cobarde entra en pánico al ver un zombi y grita', () => {
    const { w, humano } = conZombi('miedo-1');
    w.tick();
    expect(humano.animo).toBe('panico');
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1);
  });

  it('huye alejándose del zombi', () => {
    const { w, humano, zombi } = conZombi('miedo-2');
    const d0 = Math.hypot(humano.x - zombi.x, humano.z - zombi.z);
    // congelar al zombi para medir solo la huida
    zombi.salud = 'eliminado';
    humano.animo = 'panico';
    humano.dirX = 1; humano.dirZ = 0;
    w.tick();
    // sin zombis a la vista sigue en pánico y avanza en su dirección de huida
    const d1 = Math.hypot(humano.x - zombi.x, humano.z - zombi.z);
    expect(d1).toBeGreaterThan(d0 - 0.01);
  });

  it('se calma tras el tiempo configurado y vuelve a una calle', () => {
    const { w, humano, zombi } = conZombi('miedo-3');
    w.tick(); // entra en pánico
    zombi.salud = 'eliminado'; // ya no hay amenaza
    for (let t = 0; t <= PANICO.ticksCalmarse + TICK_RATE; t++) w.tick();
    expect(humano.animo).toBe('tranquilo');
    expect(isStreet(humano.x, humano.z)).toBe(true);
  });

  it('dos mundos con pánico siguen siendo deterministas', () => {
    const a = new World('miedo-4', 300);
    const b = new World('miedo-4', 300);
    for (let t = 0; t < 20 * TICK_RATE; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
