import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { generateCity } from '../src/sim/cityGen';
import { INTERIOR } from '../src/sim/config';

const city = generateCity(createRng('interior'));
const jugables = city.buildings.filter((b) => b.kind === 'jugable');
const fondos = city.buildings.filter((b) => b.kind === 'fondo');

describe('interiores en la generación', () => {
  it('todo jugable tiene puerta en el centro de una de sus paredes', () => {
    expect(jugables.length).toBeGreaterThan(0);
    for (const b of jugables) {
      const p = b.puerta!;
      expect(p).toBeDefined();
      const enParedX = p.x === b.x || p.x === b.x + b.width;
      const enParedZ = p.z === b.z || p.z === b.z + b.depth;
      expect(enParedX || enParedZ).toBe(true); // sobre el perímetro
      if (enParedX) expect(p.z).toBeCloseTo(b.z + b.depth / 2, 5);
      else expect(p.x).toBeCloseTo(b.x + b.width / 2, 5);
    }
  });

  it('la escalera está dentro del footprint y no toca la puerta', () => {
    for (const b of jugables) {
      const e = b.escalera!;
      expect(e.x).toBeGreaterThanOrEqual(b.x);
      expect(e.z).toBeGreaterThanOrEqual(b.z);
      expect(e.x + e.width).toBeLessThanOrEqual(b.x + b.width + 1e-9);
      expect(e.z + e.depth).toBeLessThanOrEqual(b.z + b.depth + 1e-9);
      const p = b.puerta!;
      const dentroEscalera =
        p.x >= e.x - INTERIOR.anchoPuerta / 2 && p.x <= e.x + e.width + INTERIOR.anchoPuerta / 2 &&
        p.z >= e.z - INTERIOR.anchoPuerta / 2 && p.z <= e.z + e.depth + INTERIOR.anchoPuerta / 2;
      expect(dentroEscalera).toBe(false);
    }
  });

  it('los de fondo no tienen interior', () => {
    for (const b of fondos) {
      expect(b.puerta).toBeUndefined();
      expect(b.escalera).toBeUndefined();
    }
  });

  it('sigue siendo determinista', () => {
    expect(generateCity(createRng('interior'))).toEqual(city);
  });
});
