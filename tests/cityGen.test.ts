import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { generateCity, isStreet } from '../src/sim/cityGen';
import { CITY, CITY_WIDTH } from '../src/sim/config';

describe('generación de ciudad', () => {
  it('misma semilla produce exactamente la misma ciudad', () => {
    const a = generateCity(createRng('nyc'));
    const b = generateCity(createRng('nyc'));
    expect(a).toEqual(b);
  });

  it('hay un edificio por manzana', () => {
    const city = generateCity(createRng('nyc'));
    expect(city.buildings.length).toBe(CITY.blocksX * CITY.blocksY);
  });

  it('hay edificios jugables y de fondo', () => {
    const city = generateCity(createRng('nyc'));
    const jugables = city.buildings.filter((b) => b.kind === 'jugable').length;
    expect(jugables).toBeGreaterThan(0);
    expect(jugables).toBeLessThan(city.buildings.length);
  });

  it('los edificios jugables son bajos y los de fondo altos', () => {
    const city = generateCity(createRng('nyc'));
    for (const b of city.buildings) {
      if (b.kind === 'jugable') expect(b.height).toBeLessThanOrEqual(12);
      else expect(b.height).toBeGreaterThanOrEqual(30);
    }
  });

  it('ningún edificio pisa una calle', () => {
    const city = generateCity(createRng('nyc'));
    for (const b of city.buildings) {
      expect(isStreet(b.x, b.z)).toBe(false);
      expect(isStreet(b.x + b.width - 0.01, b.z + b.depth - 0.01)).toBe(false);
    }
  });

  it('isStreet reconoce bandas de calle y límites del mapa', () => {
    expect(isStreet(CITY.streetWidth / 2, CITY.streetWidth / 2)).toBe(true);
    expect(isStreet(CITY.streetWidth + 1, CITY.streetWidth + 1)).toBe(false);
    expect(isStreet(-1, 5)).toBe(false);
    expect(isStreet(CITY_WIDTH + 1, 5)).toBe(false);
  });
});
