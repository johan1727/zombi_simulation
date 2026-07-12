import { describe, expect, it } from 'vitest';
import { elegirFrase } from '../src/ui/barks';
import type { Personality } from '../src/sim/types';

const PERSONALIDADES: Personality[] = [
  'lider',
  'cobarde',
  'valiente',
  'protector',
  'egoista',
  'imprudente',
];

describe('elegirFrase', () => {
  it('es determinista: misma personalidad + mismo id → siempre la misma frase', () => {
    for (const p of PERSONALIDADES) {
      const a = elegirFrase(p, 7);
      const b = elegirFrase(p, 7);
      expect(a).toBe(b);
    }
  });

  it('nunca es una cadena vacía, para ninguna personalidad (incluida "generico")', () => {
    for (const p of [...PERSONALIDADES, 'generico' as const]) {
      for (let id = 0; id < 10; id++) {
        expect(elegirFrase(p, id).length).toBeGreaterThan(0);
      }
    }
  });

  it('ids distintos pueden dar frases distintas dentro de la misma personalidad (varía por id % longitud)', () => {
    const vistas = new Set<string>();
    for (let id = 0; id < 3; id++) vistas.add(elegirFrase('cobarde', id));
    expect(vistas.size).toBeGreaterThan(1);
  });

  it('id y id + longitud del pool dan la misma frase (ciclo por módulo)', () => {
    // 'protector' tiene 3 frases en la tabla actual.
    expect(elegirFrase('protector', 1)).toBe(elegirFrase('protector', 1 + 3));
  });
});
