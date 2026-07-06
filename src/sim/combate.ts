import type { Citizen } from './types';
import type { World } from './world';
import { COMBATE } from './config';
import { infectar } from './infeccion';

/**
 * 3+ humanos junto a 1 zombi aislado (con al menos un valiente): lo eliminan.
 * Uno contra uno es suicidio (eso ya lo resuelve la mordida del zombi).
 */
export function resolverCombates(world: World): void {
  for (const z of world.citizens) {
    if (z.salud !== 'zombi' || z.dentroDe >= 0) continue;
    let zombisCerca = 0;
    const luchadores: Citizen[] = [];
    for (const i of world.grid.queryCircle(z.x, z.z, COMBATE.radioPelea)) {
      const o = world.citizens[i];
      if (o === z) continue;
      if (o.salud === 'zombi') zombisCerca++;
      else if (o.salud !== 'eliminado' && o.dentroDe < 0) luchadores.push(o);
    }
    if (
      zombisCerca === 0 &&
      luchadores.length >= COMBATE.humanosParaGanar &&
      luchadores.some((h) => h.personality === 'valiente')
    ) {
      z.salud = 'eliminado';
      world.splats.push({ x: z.x, z: z.z, tono: world.rngCombate.next() });
      if (world.rngCombate.chance(COMBATE.probInfeccionAlGanar)) {
        infectar(world.rngCombate.pick(luchadores), world.rngCombate);
      }
    }
  }
}
