import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '../src/sim/rng';

describe('rng determinista', () => {
  it('misma semilla produce la misma secuencia', () => {
    const a = createRng('alfa');
    const b = createRng('alfa');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('semillas distintas divergen', () => {
    const a = createRng('alfa');
    const b = createRng('beta');
    let iguales = 0;
    for (let i = 0; i < 100; i++) if (a.next() === b.next()) iguales++;
    expect(iguales).toBeLessThan(5);
  });

  it('next() siempre está en [0, 1)', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int respeta los límites, ambos inclusive', () => {
    const rng = createRng('rango');
    const vistos = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      vistos.add(v);
    }
    expect(vistos.size).toBe(4);
  });

  it('hashSeed es estable y distingue mayúsculas', () => {
    expect(hashSeed('PANDEMIA')).toBe(hashSeed('PANDEMIA'));
    expect(hashSeed('PANDEMIA')).not.toBe(hashSeed('pandemia'));
  });
});
