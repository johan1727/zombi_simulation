import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { pickPersonality, spawnCitizens } from '../src/sim/citizens';
import { isStreet } from '../src/sim/cityGen';

describe('ciudadanos', () => {
  it('nacen sobre las calles, nunca dentro de manzanas', () => {
    const cs = spawnCitizens(createRng('spawn'), 500);
    for (const c of cs) expect(isStreet(c.x, c.z)).toBe(true);
  });

  it('tienen nombre completo y variedad de personalidades', () => {
    const cs = spawnCitizens(createRng('spawn'), 200);
    for (const c of cs) expect(c.name).toMatch(/^\S+ \S+$/);
    const tipos = new Set(cs.map((c) => c.personality));
    expect(tipos.size).toBeGreaterThanOrEqual(4);
  });

  it('caminan sobre un solo eje a la vez', () => {
    const cs = spawnCitizens(createRng('spawn'), 200);
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
});
