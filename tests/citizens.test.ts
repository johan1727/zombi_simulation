import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { pickPersonality, spawnCitizens } from '../src/sim/citizens';
import { generateCity, isStreet } from '../src/sim/cityGen';
import { World } from '../src/sim/world';
import { buildingAt } from '../src/sim/collision';

describe('ciudadanos', () => {
  it('nacen sobre las calles, o dentro de un edificio jugable si empezaron en casa', () => {
    const city = generateCity(createRng('ciudad'));
    const cs = spawnCitizens(createRng('spawn'), 500, city);
    for (const c of cs) {
      if (c.dentroDe < 0) {
        expect(isStreet(c.x, c.z)).toBe(true);
        continue;
      }
      const b = city.buildings[c.dentroDe];
      expect(b.kind).toBe('jugable');
      expect(c.x).toBeGreaterThanOrEqual(b.x);
      expect(c.x).toBeLessThanOrEqual(b.x + b.width);
      expect(c.z).toBeGreaterThanOrEqual(b.z);
      expect(c.z).toBeLessThanOrEqual(b.z + b.depth);
    }
  });

  it('tienen nombre completo y variedad de personalidades', () => {
    const city = generateCity(createRng('ciudad'));
    const cs = spawnCitizens(createRng('spawn'), 200, city);
    for (const c of cs) expect(c.name).toMatch(/^\S+ \S+$/);
    const tipos = new Set(cs.map((c) => c.personality));
    expect(tipos.size).toBeGreaterThanOrEqual(4);
  });

  it('caminan sobre un solo eje a la vez', () => {
    const city = generateCity(createRng('ciudad'));
    const cs = spawnCitizens(createRng('spawn'), 200, city);
    for (const c of cs) {
      expect(Math.abs(c.dirX) + Math.abs(c.dirZ)).toBe(1);
    }
  });

  it('pickPersonality es determinista', () => {
    const a = createRng('p');
    const b = createRng('p');
    for (let i = 0; i < 200; i++) {
      expect(pickPersonality(a)).toBe(pickPersonality(b));
    }
  });

  describe('familias que empiezan dentro de su casa (Plan 19)', () => {
    it('al menos una familia arranca dentro de un edificio, y TODOS sus miembros comparten el mismo dentroDe', () => {
      const city = generateCity(createRng('ciudad'));
      const cs = spawnCitizens(createRng('spawn'), 800, city);
      const indoor = cs.filter((c) => c.dentroDe >= 0);
      expect(indoor.length).toBeGreaterThan(0);
      for (const c of indoor) {
        expect(c.piso).toBe(0);
        expect(c.pisoObjetivo).toBe(0);
        expect(c.escaleraTicks).toBe(0);
        // toda la familia (incluida la cabeza) comparte el mismo edificio
        const cabeza = c.cabezaFamilia >= 0 ? cs[c.cabezaFamilia] : c;
        expect(cabeza.dentroDe).toBe(c.dentroDe);
        for (const fIdx of c.familiares) {
          expect(cs[fIdx].dentroDe).toBe(c.dentroDe);
        }
      }
    });

    it('world.ocupantes en el tick 0 (antes de tickear) ya refleja los ocupantes iniciales', () => {
      const w = new World('indoor-1', 800);
      const esperado = w.city.buildings.map(() => 0);
      for (const c of w.citizens) if (c.dentroDe >= 0) esperado[c.dentroDe]++;
      const totalEsperado = esperado.reduce((a, b) => a + b, 0);
      expect(totalEsperado).toBeGreaterThan(0); // la semilla efectivamente produjo gente adentro
      for (let i = 0; i < esperado.length; i++) {
        expect(w.ocupantes[i]).toBe(esperado[i]);
      }
    });

    it('un ciudadano que nace adentro se comporta EXACTAMENTE igual que uno que entra por la puerta más tarde (sin caso especial en interior.ts)', () => {
      const w = new World('indoor-2', 800);
      const nacidosAdentro = w.citizens.filter((c) => c.dentroDe >= 0 && !c.esAgente);
      expect(nacidosAdentro.length).toBeGreaterThan(0);
      for (let t = 0; t < 5 * 30; t++) w.tick();
      // sigue siendo un estado consistente: o adentro del edificio correcto
      // (en algún piso válido) o afuera en la calle tras huir por la puerta —
      // exactamente las mismas dos posibilidades que cualquier otro civil.
      for (const c of nacidosAdentro) {
        if (c.salud === 'eliminado') continue;
        if (c.dentroDe >= 0) {
          const b = w.city.buildings[c.dentroDe];
          expect(b.kind).toBe('jugable');
          expect(c.piso).toBeGreaterThanOrEqual(0);
        } else {
          expect(buildingAt(w.city, c.x, c.z)).toBeNull();
        }
      }
    });
  });
});
