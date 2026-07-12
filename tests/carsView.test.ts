import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { generateCity } from '../src/sim/cityGen';
import {
  autosPorCuadra,
  elegirAuto,
  posicionesAutos,
  MODELOS_AUTOS,
} from '../src/render/carsView';

const city = generateCity(createRng('pandemia:test:cityGen'));

describe('autosPorCuadra', () => {
  it('es determinista: mismo índice siempre da la misma cantidad', () => {
    expect(autosPorCuadra(4)).toBe(autosPorCuadra(4));
  });
  it('alterna 2 en cuadras pares, 1 en impares', () => {
    expect(autosPorCuadra(0)).toBe(2);
    expect(autosPorCuadra(1)).toBe(1);
    expect(autosPorCuadra(2)).toBe(2);
  });
});

describe('elegirAuto', () => {
  it('es determinista: mismo índice + puesto siempre da el mismo modelo', () => {
    expect(elegirAuto(3, 0)).toBe(elegirAuto(3, 0));
  });
  it('siempre elige un modelo del pool de autos', () => {
    expect(MODELOS_AUTOS as readonly string[]).toContain(elegirAuto(10, 0));
    expect(MODELOS_AUTOS as readonly string[]).toContain(elegirAuto(10, 1));
  });
  it('cicla por módulo (índice y índice+longitud del pool dan el mismo modelo)', () => {
    expect(elegirAuto(2, 0)).toBe(elegirAuto(2 + MODELOS_AUTOS.length, 0));
  });
});

describe('posicionesAutos', () => {
  const autos = posicionesAutos(city);

  it('es determinista: la misma ciudad siempre da las mismas posiciones', () => {
    expect(posicionesAutos(city)).toEqual(autos);
  });

  it('coloca 1 o 2 autos por cada cuadra de la ciudad', () => {
    const esperado = city.buildings.reduce((n, _b, i) => n + autosPorCuadra(i), 0);
    expect(autos.length).toBe(esperado);
  });

  it('ningún auto cae dentro del footprint de un edificio (siempre en la banda de calle)', () => {
    for (const auto of autos) {
      const dentroDeAlgunEdificio = city.buildings.some(
        (b) =>
          auto.x >= b.x &&
          auto.x <= b.x + b.width &&
          auto.z >= b.z &&
          auto.z <= b.z + b.depth
      );
      expect(dentroDeAlgunEdificio).toBe(false);
    }
  });

  it('ningún auto queda cerca del borde de su cuadra (lejos de intersecciones)', () => {
    // Todo auto respeta el inset de 8 m desde el borde de SU cuadra en el
    // eje de la calle (z); `posicionesAutos` recorre `city.buildings` en
    // orden, así que un cursor lineal alcanza para emparejar auto <-> cuadra.
    let idx = 0;
    let cursor = 0;
    for (const b of city.buildings) {
      const cantidad = autosPorCuadra(idx);
      for (let p = 0; p < cantidad; p++) {
        const auto = autos[cursor];
        expect(auto.z).toBeGreaterThanOrEqual(b.z + 8);
        expect(auto.z).toBeLessThanOrEqual(b.z + b.depth - 8);
        cursor++;
      }
      idx++;
    }
  });

  it('usa solo modelos del pool de 7 autos', () => {
    for (const auto of autos) {
      expect(MODELOS_AUTOS as readonly string[]).toContain(auto.nombre);
    }
  });
});
