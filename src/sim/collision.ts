import { CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH, MARGEN_ACERA } from './config';
import type { Building, CityLayout } from './cityGen';

/** Edificio cuyo interior contiene (x,z), o null si es calle/acera/fuera. */
export function buildingAt(city: CityLayout, x: number, z: number): Building | null {
  if (x < 0 || z < 0 || x >= CITY_WIDTH || z >= CITY_DEPTH) return null;
  const fx = x % CITY_PERIOD;
  const fz = z % CITY_PERIOD;
  if (fx < CITY.streetWidth || fz < CITY.streetWidth) return null; // calle
  const dentroX = fx >= CITY.streetWidth + MARGEN_ACERA && fx < CITY_PERIOD - MARGEN_ACERA;
  const dentroZ = fz >= CITY.streetWidth + MARGEN_ACERA && fz < CITY_PERIOD - MARGEN_ACERA;
  if (!dentroX || !dentroZ) return null; // acera
  const bx = Math.floor(x / CITY_PERIOD);
  const bz = Math.floor(z / CITY_PERIOD);
  return city.buildings[bx * CITY.blocksY + bz];
}

/** Avanza hacia (nx,nz) deslizándose por las paredes; clampa al mapa. */
export function moveWithSlide(
  city: CityLayout,
  c: { x: number; z: number },
  nx: number,
  nz: number
): void {
  if (!buildingAt(city, nx, nz)) {
    c.x = nx;
    c.z = nz;
  } else if (!buildingAt(city, nx, c.z)) {
    c.x = nx;
  } else if (!buildingAt(city, c.x, nz)) {
    c.z = nz;
  }
  c.x = Math.min(Math.max(c.x, 1), CITY_WIDTH - 1);
  c.z = Math.min(Math.max(c.z, 1), CITY_DEPTH - 1);
}
