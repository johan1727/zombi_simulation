import type { Citizen } from './types';
import type { World } from './world';
import { CITY, CITY_PERIOD, REFUGIO } from './config';
import { NORMAL_INTERIOR } from './interior';

/** Si hay una PUERTA jugable pegada (bloque propio o vecinos), entra a refugiarse. */
function entrarPorPuerta(c: Citizen, world: World, pisoObjetivo: number): void {
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
      c.pisoObjetivo = pisoObjetivo;
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

export function intentarRefugio(c: Citizen, world: World): void {
  entrarPorPuerta(c, world, 1); // instinto civil: subir a esconderse
}

/** Entrada deliberada de un agente bajo control del jugador: se queda en planta baja, el jugador decide el piso (Task 2). */
export function intentarEntradaAgente(c: Citizen, world: World): void {
  entrarPorPuerta(c, world, 0);
}
