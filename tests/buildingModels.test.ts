import { describe, expect, it } from 'vitest';
import { elegirModelo, MODELOS_FONDO, MODELOS_SKYSCRAPER } from '../src/render/buildingModels';

describe('elegirModelo', () => {
  it('es determinista: mismo id + alto siempre da el mismo modelo', () => {
    expect(elegirModelo(5, false)).toBe(elegirModelo(5, false));
    expect(elegirModelo(5, true)).toBe(elegirModelo(5, true));
  });
  it('usa el pool de rascacielos solo si alto=true', () => {
    expect(MODELOS_SKYSCRAPER as readonly string[]).toContain(elegirModelo(3, true));
    expect(MODELOS_FONDO as readonly string[]).toContain(elegirModelo(3, false));
  });
  it('cicla por módulo (id y id+longitud del pool dan el mismo modelo)', () => {
    expect(elegirModelo(2, false)).toBe(elegirModelo(2 + MODELOS_FONDO.length, false));
  });
});
