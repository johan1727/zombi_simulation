import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { generateCity } from '../src/sim/cityGen';
import { buildingAt, moveWithSlide, RADIO_AUTO } from '../src/sim/collision';
import { CITY, CITY_PERIOD } from '../src/sim/config';

const city = generateCity(createRng('colision'));
const b0 = city.buildings[0]; // manzana (0,0): x,z = calle+margen = 10

describe('colisión con edificios', () => {
  it('la calle y la acera no son edificio', () => {
    expect(buildingAt(city, 4, 4)).toBeNull(); // calle
    expect(buildingAt(city, CITY.streetWidth + 1, CITY.streetWidth + 1)).toBeNull(); // acera
    expect(buildingAt(city, -5, 10)).toBeNull(); // fuera del mapa
  });

  it('el interior de la manzana es su edificio', () => {
    const cx = b0.x + b0.width / 2;
    const cz = b0.z + b0.depth / 2;
    expect(buildingAt(city, cx, cz)).toBe(b0);
    // manzana (1,0): índice = blocksY (bx * blocksY + bz)
    expect(buildingAt(city, cx + CITY_PERIOD, cz)).toBe(city.buildings[CITY.blocksY]);
  });

  it('moveWithSlide no atraviesa paredes y se desliza', () => {
    const c = { x: b0.x - 1, z: b0.z + 5 }; // pegado a la pared oeste, en la acera
    moveWithSlide(city, c, b0.x + 2, c.z + 0.3); // intenta entrar en diagonal
    expect(buildingAt(city, c.x, c.z)).toBeNull(); // sigue fuera
    expect(c.z).toBeCloseTo(b0.z + 5.3, 5); // se deslizó en z
    expect(c.x).toBeCloseTo(b0.x - 1, 5); // x bloqueada
  });

  it('clampa a los límites del mapa', () => {
    const c = { x: 2, z: 2 };
    moveWithSlide(city, c, -10, -10);
    expect(c.x).toBe(1);
    expect(c.z).toBe(1);
  });
});

describe('colisión con autos estacionados', () => {
  const auto = city.autos[0];

  it('moveWithSlide no deja a nadie exactamente sobre un auto (se desliza, como con paredes)', () => {
    // Arranca en diagonal (4 m al oeste y 4 m al norte del auto) e intenta
    // caminar derecho hacia su centro exacto.
    const c = { x: auto.x - 4, z: auto.z - 4 };
    moveWithSlide(city, c, auto.x, auto.z);
    const dx = c.x - auto.x;
    const dz = c.z - auto.z;
    expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(RADIO_AUTO * RADIO_AUTO);
  });

  it('un auto no bloquea toda la calle: queda espacio para pasar al lado', () => {
    // Un punto en la misma calle, a la misma z que el auto, pero lo bastante
    // lejos en x (fuera de RADIO_AUTO) debe seguir siendo transitable de un tirón.
    const libreX = auto.x - (RADIO_AUTO + 2);
    const c = { x: auto.x - 4, z: auto.z + 4 };
    moveWithSlide(city, c, libreX, auto.z);
    expect(c.x).toBeCloseTo(libreX, 5);
    expect(c.z).toBeCloseTo(auto.z, 5);
  });
});
