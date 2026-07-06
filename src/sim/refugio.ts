import type { Citizen } from './types';
import type { World } from './world';
import { CITY, CITY_PERIOD, PANICO, REFUGIO } from './config';

/** Si hay un edificio jugable pegado (bloque propio o vecinos), entra a refugiarse. */
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
    const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.width));
    const dz = Math.max(b.z - c.z, 0, c.z - (b.z + b.depth));
    if (Math.hypot(dx, dz) <= REFUGIO.radioEntrar) {
      c.dentroDe = b.id;
      world.ocupantes[b.id]++;
      c.prevX = c.x;
      c.prevZ = c.z;
      return;
    }
  }
}

/** Un infectado se transformó dentro: el refugio revienta desde dentro. */
export function romperEdificio(world: World, idEdificio: number): void {
  const b = world.city.buildings[idEdificio]; // id === índice por construcción
  world.brecha[idEdificio] = true;
  const dentro = world.citizens.filter((o) => o.dentroDe === idEdificio);
  const cx = b.x + b.width / 2;
  const cz = b.z + b.depth / 2;
  dentro.forEach((o, k) => {
    const ang = (k / Math.max(dentro.length, 1)) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    // proyectar al perímetro CUADRADO (+1 m): en las diagonales un anillo
    // circular caería dentro del propio edificio
    const esc = (b.width / 2 + 1) / Math.max(Math.abs(dx), Math.abs(dz));
    o.x = cx + dx * esc;
    o.z = cz + dz * esc;
    o.prevX = o.x; // teletransporte: sin estela
    o.prevZ = o.z;
    o.dentroDe = -1;
    if (o.salud !== 'zombi') {
      o.animo = 'panico';
      o.animoTicks = 0;
    }
  });
  world.ocupantes[idEdificio] = 0;
  world.ruidos.push({
    x: cx,
    z: cz,
    radio: PANICO.radioGrito * 2,
    ticks: PANICO.duracionGritoTicks * 2,
  });
  world.splats.push({ x: cx, z: cz, tono: world.rngInfeccion.next() });
}
