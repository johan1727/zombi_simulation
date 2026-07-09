import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { PELIGRO } from '../src/sim/config';

describe('memoria colectiva de peligro', () => {
  it('registra, acumula con tope y decae', () => {
    const w = new World('memoria-1', 1);
    w.registrarPeligro(50, 50);
    expect(w.peligroEn(50, 50)).toBe(PELIGRO.porMuerte);
    for (let k = 0; k < 20; k++) w.registrarPeligro(50, 50);
    expect(w.peligroEn(50, 50)).toBe(PELIGRO.maximo);
    for (let t = 0; t < PELIGRO.decaimientoCadaTicks + 2; t++) w.tick();
    expect(w.peligroEn(50, 50)).toBeLessThan(PELIGRO.maximo);
  });

  it('las transformaciones dejan huella de peligro', () => {
    const w = new World('memoria-2', 300);
    for (let t = 0; t < 40 * 30; t++) w.tick();
    const algunPeligro = w.peligro.some((v) => v > 0);
    expect(algunPeligro).toBe(true);
  });

  it('en el cruce, el caminante evita la manzana marcada', () => {
    const w = new World('memoria-3', 1);
    const c = w.citizens[0];
    // caminante vertical acercándose a un cruce, con peligro máximo al frente
    c.x = 4; c.z = 40; c.prevX = 4; c.prevZ = 40;
    c.dirX = 0; c.dirZ = 1;
    c.laneOffset = 0;
    c.lastCrossing = -1;
    c.state = 'caminando';
    for (let k = 0; k < 10; k++) w.registrarPeligro(4, 40 + 44);
    let giro = false;
    for (let t = 0; t < 10 * 30; t++) {
      w.tick();
      if (c.dirZ === 0) { giro = true; break; }
    }
    expect(giro).toBe(true); // en algún cruce dejó de ir al frente
  });

  it('gemelos deterministas con memoria', () => {
    const a = new World('memoria-4', 300);
    const b = new World('memoria-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
