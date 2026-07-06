import type { World } from './world';
import { ASEDIO } from './config';
import { romperEdificio } from './refugio';

/**
 * Los zombis presionan los refugios ocupados desde fuera (diseño §3.3):
 * la presión se acumula por zombi pegado y decae sin ellos. Al superar la
 * resistencia, el refugio revienta. Los refugiados además hacen ruido
 * periódico que atrae zombis errantes — no existe el búnker eterno.
 */
export function resolverAsedios(world: World): void {
  for (const b of world.city.buildings) {
    if (b.kind !== 'jugable' || world.brecha[b.id] || world.ocupantes[b.id] === 0) {
      world.presion[b.id] = 0;
      continue;
    }
    const cx = b.x + b.width / 2;
    const cz = b.z + b.depth / 2;
    if (world.tickCount % ASEDIO.ruidoCadaTicks === 0) {
      world.ruidos.push({ x: cx, z: cz, radio: ASEDIO.ruidoRadio, ticks: ASEDIO.ruidoTicks });
    }
    const alcance = b.width / 2 + ASEDIO.radio;
    let zombis = 0;
    for (const i of world.grid.queryCircle(cx, cz, alcance)) {
      if (world.citizens[i].salud === 'zombi') zombis++;
    }
    if (zombis > 0) {
      world.presion[b.id] += zombis * ASEDIO.presionPorZombi;
    } else {
      world.presion[b.id] = Math.max(0, world.presion[b.id] - ASEDIO.alivioPorTick);
    }
    if (world.presion[b.id] >= ASEDIO.resistencia) {
      romperEdificio(world, b.id);
    }
  }
}
