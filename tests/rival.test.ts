import { describe, expect, it } from 'vitest';
import { Rival } from '../src/game/rival';
import { World } from '../src/sim/world';
import type { Desafio } from '../src/game/desafio';

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

  describe('modo reto (estático, Task 7)', () => {
    const reto: Desafio = { seed: 'reto-semilla', curva: [100, 80, 60, 40, 20], indice: 55, nombre: 'Johan' };

    it('estatico() es true con un Desafio y false sin él', () => {
      expect(new Rival('x', 50, reto).estatico).toBe(true);
      expect(new Rival('x', 50).estatico).toBe(false);
    });

    it('NO tickea su propio world (queda congelado en el tick 0)', () => {
      const rival = new Rival('x', 50, reto);
      for (let t = 0; t < 900; t++) rival.tick();
      expect(rival.world.tickCount).toBe(0);
    });

    it('indiceCiudad devuelve el índice congelado del reto, no el del world (que nunca corrió)', () => {
      const rival = new Rival('x', 50, reto);
      expect(rival.indiceCiudad).toBe(55);
    });

    it('curva se revela cada 5s interpolando la curva gruesa (10s) del reto', () => {
      const rival = new Rival('x', 50, reto);
      for (let t = 0; t < 150; t++) rival.tick(); // 5s: muestra 1, posición 0.5 → entre 100 y 80 → 90
      expect(rival.curva).toEqual([90]);
      for (let t = 0; t < 150; t++) rival.tick(); // 10s: muestra 2, posición 1 → 80
      expect(rival.curva).toEqual([90, 80]);
    });

    it('vivosPct sigue la última muestra revelada de la curva (o el primer punto del reto antes de la primera muestra)', () => {
      const rival = new Rival('x', 50, reto);
      expect(rival.vivosPct).toBe(100);
      for (let t = 0; t < 150; t++) rival.tick();
      expect(rival.vivosPct).toBe(90);
    });

    it('avisosBrecha se queda vacío (no hay brechas "en vivo" que detectar sin simular)', () => {
      const rival = new Rival('x', 50, reto);
      for (let t = 0; t < 900; t++) rival.tick();
      expect(rival.avisosBrecha).toEqual([]);
    });

    it('dos instancias en modo reto con la misma semilla de reto producen la misma curva (determinismo trivial, sin RNG)', () => {
      const a = new Rival('x', 50, reto);
      const b = new Rival('x', 50, reto);
      for (let t = 0; t < 900; t++) {
        a.tick();
        b.tick();
      }
      expect(a.curva).toEqual(b.curva);
    });
  });
});
