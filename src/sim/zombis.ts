import type { Citizen } from './types';
import type { World } from './world';
import { CITY, CITY_PERIOD, DIRECCIONES, DT, INFECCION, PANICO, ZOMBIS } from './config';
import { moveWithSlide } from './collision';
import { infectar } from './infeccion';
import { NORMAL_INTERIOR } from './interior';

export function updateZombi(c: Citizen, world: World): void {
  c.prevX = c.x;
  c.prevZ = c.z;
  if (c.cdMordida > 0) c.cdMordida--;

  // presa: el humano activo más cercano a la vista
  let objetivo: Citizen | null = null;
  let mejorD2 = ZOMBIS.radioVision * ZOMBIS.radioVision;
  for (const i of world.grid.queryCircle(c.x, c.z, ZOMBIS.radioVision)) {
    const o = world.citizens[i];
    if (o.salud === 'zombi' || o.salud === 'eliminado' || o.dentroDe >= 0) continue;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      objetivo = o;
    }
  }

  let dx = 0;
  let dz = 0;
  let vel: number = ZOMBIS.velocidadErrante;
  if (objetivo) {
    dx = objetivo.x - c.x;
    dz = objetivo.z - c.z;
    vel = ZOMBIS.velocidad;
  } else {
    // sin presa: ir hacia el ruido más cercano (se oye 3× su radio)
    let mejorR2 = Infinity;
    for (const r of world.ruidos) {
      const d2 = (r.x - c.x) ** 2 + (r.z - c.z) ** 2;
      if (d2 < (r.radio * 3) ** 2 && d2 < mejorR2) {
        mejorR2 = d2;
        dx = r.x - c.x;
        dz = r.z - c.z;
      }
    }
    if (mejorR2 < Infinity) {
      vel = ZOMBIS.velocidad * 0.8;
    } else if (world.rngZombis.chance(ZOMBIS.probCambiarRumbo) || (c.dirX === 0 && c.dirZ === 0)) {
      const [dx0, dz0] = DIRECCIONES[world.rngZombis.int(0, DIRECCIONES.length - 1)];
      c.dirX = dx0;
      c.dirZ = dz0;
    }
  }

  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0.001) {
    c.dirX = dx / len;
    c.dirZ = dz / len;
  }
  moveWithSlide(world.city, c, c.x + c.dirX * vel * DT, c.z + c.dirZ * vel * DT);

  // mordida
  if (objetivo && c.cdMordida === 0) {
    const d2 = (objetivo.x - c.x) ** 2 + (objetivo.z - c.z) ** 2;
    if (d2 <= INFECCION.radioMordida ** 2) {
      infectar(objetivo, world.rngInfeccion);
      objetivo.animo = 'panico';
      objetivo.animoTicks = 0;
      world.ruidos.push({
        x: objetivo.x,
        z: objetivo.z,
        radio: PANICO.radioGrito,
        ticks: PANICO.duracionGritoTicks,
      });
      c.cdMordida = ZOMBIS.enfriamientoMordidaTicks;
    }
  }

  // puerta rota cerca y sin presa a la vista: entrar a cazar
  if (!objetivo) {
    const bx = Math.floor(c.x / CITY_PERIOD);
    const bz = Math.floor(c.z / CITY_PERIOD);
    const candidatos: ReadonlyArray<readonly [number, number]> = [
      [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
    ];
    for (const [ix, iz] of candidatos) {
      if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
      const b = world.city.buildings[ix * CITY.blocksY + iz];
      if (b.kind !== 'jugable' || !world.brecha[b.id] || world.ocupantes[b.id] === 0) continue;
      const p = b.puerta!;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (Math.sqrt(dx * dx + dz * dz) <= 2) {
        const [nx, nz] = NORMAL_INTERIOR[p.lado];
        c.dentroDe = b.id;
        c.piso = 0;
        c.pisoObjetivo = 0;
        c.x = p.x + nx * 1.2;
        c.z = p.z + nz * 1.2;
        c.prevX = c.x;
        c.prevZ = c.z;
        return;
      }
    }
  }
}
