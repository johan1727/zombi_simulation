import { CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH, MARGEN_ACERA } from './config';
import type { Building, CityLayout } from './cityGen';

/** Radio de colisión de un auto estacionado (Plan 19), en metros. */
export const RADIO_AUTO = 2;

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

/** true si (x,z) cae dentro del radio de colisión de algún auto estacionado.
 * Distancia con `dx*dx+dz*dz` (nunca la función trigonométrica no portable
 * de distancia euclídea — regla de portabilidad). */
function autoObstaculoEn(city: CityLayout, x: number, z: number): boolean {
  for (const auto of city.autos) {
    const dx = x - auto.x;
    const dz = z - auto.z;
    if (dx * dx + dz * dz < RADIO_AUTO * RADIO_AUTO) return true;
  }
  return false;
}

/** Avanza hacia (nx,nz) deslizándose por las paredes y autos estacionados; clampa al mapa. */
export function moveWithSlide(
  city: CityLayout,
  c: { x: number; z: number },
  nx: number,
  nz: number
): void {
  const bloqueado = (x: number, z: number): boolean =>
    !!buildingAt(city, x, z) || autoObstaculoEn(city, x, z);
  if (!bloqueado(nx, nz)) {
    c.x = nx;
    c.z = nz;
  } else if (!bloqueado(nx, c.z)) {
    c.x = nx;
  } else if (!bloqueado(c.x, nz)) {
    c.z = nz;
  }
  c.x = Math.min(Math.max(c.x, 1), CITY_WIDTH - 1);
  c.z = Math.min(Math.max(c.z, 1), CITY_DEPTH - 1);
}
