import { describe, expect, it } from 'vitest';
import { Rival } from '../src/game/rival';
import { World } from '../src/sim/world';

// Rival nunca recibe órdenes por construcción: no hay forma de "divergir" con
// órdenes usando Rival solo. En su lugar probamos que Rival es determinista
// (dos instancias, misma semilla → curvas idénticas) y que su mundo interno
// se comporta exactamente como un World normal sin órdenes.
describe('Rival', () => {
  it('dos instancias con la misma semilla producen curvas idénticas', () => {
    const a = new Rival('rival-1', 50);
    const b = new Rival('rival-1', 50);
    for (let t = 0; t < 900; t++) {
      a.tick();
      b.tick();
    }
    expect(a.curva).toEqual(b.curva);
    expect(a.curva.length).toBeGreaterThan(0);
  });

  it('el mundo del rival avanza igual que un World normal sin órdenes (misma semilla)', () => {
    const rival = new Rival('rival-2', 50);
    const referencia = new World('rival-2', 50);
    for (let t = 0; t < 300; t++) {
      rival.tick();
      referencia.tick();
    }
    expect(rival.world.hashState()).toBe(referencia.hashState());
  });

  it('muestrea vivosPct cada 150 ticks (5s)', () => {
    const rival = new Rival('rival-3', 50);
    for (let t = 0; t < 450; t++) rival.tick();
    expect(rival.curva.length).toBe(3);
  });

  it('la curva se limita a 145 muestras', () => {
    const rival = new Rival('rival-4', 50);
    for (let t = 0; t < 150 * 200; t++) rival.tick();
    expect(rival.curva.length).toBe(145);
  });

  it('vivosPct refleja el porcentaje de vivos del mundo del rival', () => {
    const rival = new Rival('rival-5', 50);
    expect(rival.vivosPct).toBeCloseTo(rival.world.vivosPct);
  });

  it('registra un aviso cuando el rival sufre una brecha nueva entre muestras', () => {
    const rival = new Rival('rival-6', 50);
    for (let t = 0; t < 150; t++) rival.tick();
    const b = rival.world.city.buildings.find((b) => b.kind === 'jugable');
    expect(b).toBeDefined();
    rival.world.brecha[b!.id] = true;
    for (let t = 0; t < 150; t++) rival.tick();
    expect(rival.avisosBrecha.length).toBe(1);
  });
});
