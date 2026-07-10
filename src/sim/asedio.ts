import type { World } from './world';
import { ASEDIO, PANICO } from './config';

/**
 * Los zombis presionan la PUERTA de los refugios ocupados (diseño §3.3).
 * Al romperse (brecha), los zombis pueden entrar — la caza sigue dentro.
 */
export function resolverAsedios(world: World): void {
  for (const b of world.city.buildings) {
    if (b.kind !== 'jugable' || world.brecha[b.id] || world.ocupantes[b.id] === 0) {
      world.presion[b.id] = 0;
      continue;
    }
    const p = b.puerta!;
    if (world.tickCount % ASEDIO.ruidoCadaTicks === 0) {
      world.ruidos.push({ x: p.x, z: p.z, radio: ASEDIO.ruidoRadio, ticks: ASEDIO.ruidoTicks });
    }
    let zombis = 0;
    for (const i of world.grid.queryCircle(p.x, p.z, ASEDIO.radioPuerta)) {
      if (world.citizens[i].salud === 'zombi') zombis++;
    }
    if (zombis > 0) {
      world.presion[b.id] += zombis * ASEDIO.presionPorZombi;
    } else {
      world.presion[b.id] = Math.max(0, world.presion[b.id] - ASEDIO.alivioPorTick);
    }
    if (world.presion[b.id] >= ASEDIO.resistencia + world.refuerzoPuerta[b.id]) {
      world.brecha[b.id] = true;
      world.ruidos.push({ x: p.x, z: p.z, radio: PANICO.radioGrito * 2, ticks: PANICO.duracionGritoTicks * 2 });
      world.splats.push({ x: p.x, z: p.z, tono: world.rngInfeccion.next() });
      world.registrarPeligro(p.x, p.z);
      if (world.hitos.length <= 300) {
        world.hitos.push({ tick: world.tickCount, tipo: 'brecha', a: -1, b: b.id });
      }
    }
  }
}
