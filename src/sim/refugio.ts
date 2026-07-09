import type { Citizen } from './types';
import type { World } from './world';
import { CITY, CITY_PERIOD, REFUGIO } from './config';
import { NORMAL_INTERIOR } from './interior';

/** Si hay una PUERTA jugable pegada (bloque propio o vecinos), entra a refugiarse. */
export function intentarRefugio(c: Citizen, world: World): void {
  const bx = Math.floor(c.x / CITY_PERIOD);
  const bz = Math.floor(c.z / CITY_PERIOD);
  const candidatos: ReadonlyArray<readonly [number, number]> = [
    [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
  ];
  for (const [ix, iz] of candidatos) {
    if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
    const b = world.city.buildings[ix * CITY.blocksY + iz];
    if (b.kind !== 'jugable' || world.brecha[b.id]) continue;
    if (world.ocupantes[b.id] >= REFUGIO.capacidad) continue;
    const p = b.puerta!;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    if (Math.sqrt(dx * dx + dz * dz) <= REFUGIO.radioEntrar) {
      const [nx, nz] = NORMAL_INTERIOR[p.lado];
      c.dentroDe = b.id;
      c.piso = 0;
      c.pisoObjetivo = 1; // instinto: subir a esconderse
      c.escaleraTicks = 0;
      c.x = p.x + nx * 1.2;
      c.z = p.z + nz * 1.2;
      c.prevX = c.x;
      c.prevZ = c.z;
      world.ocupantes[b.id]++;
      return;
    }
  }
}
