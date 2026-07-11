import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

function contarJugables(w: World): number {
  let n = 0;
  for (const b of w.city.buildings) if (b.kind === 'jugable') n++;
  return n;
}

describe('indiceCiudad', () => {
  it('índice inicial = 100 + número de refugios jugables (todos vivos, sin brechas)', () => {
    const w = new World('indice-1', 50);
    const jugables = contarJugables(w);
    expect(w.indiceCiudad).toBe(100 + jugables);
  });

  it('forzar una brecha baja el índice en 1', () => {
    const w = new World('indice-2', 50);
    const antes = w.indiceCiudad;
    const b = w.city.buildings.find((b) => b.kind === 'jugable');
    expect(b).toBeDefined();
    w.brecha[b!.id] = true;
    expect(w.indiceCiudad).toBe(antes - 1);
  });

  it('eliminar la mitad de la población ronda 50 + intactos', () => {
    const w = new World('indice-3', 50);
    const jugables = contarJugables(w);
    const mitad = Math.floor(w.citizens.length / 2);
    for (let i = 0; i < mitad; i++) w.citizens[i].salud = 'eliminado';
    expect(w.indiceCiudad).toBeGreaterThanOrEqual(50 + jugables - 1);
    expect(w.indiceCiudad).toBeLessThanOrEqual(50 + jugables + 1);
  });
});
