import type { Citizen } from './types';
import type { World } from './world';
import {
  CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH, DT,
  INFECCION, PANICO, PROB_PANICO_POR_GRITO,
} from './config';
import { corridorCenter } from './cityGen';
import { moveWithSlide } from './collision';
import { updateCitizen } from './citizens';
import { intentarRefugio } from './refugio';

/** A qué distancia de un zombi reacciona cada personalidad. */
const UMBRAL_VER: Record<string, number> = {
  cobarde: 15,
  protector: 12,
  egoista: 12,
  lider: 10,
  valiente: 8,
  imprudente: 5,
};

export function updateHumano(c: Citizen, world: World): void {
  // 1) percepción directa de zombis
  let n = 0;
  let cx = 0;
  let cz = 0;
  let mejorD2 = Infinity;
  for (const i of world.grid.queryCircle(c.x, c.z, PANICO.radioVerZombi)) {
    const o = world.citizens[i];
    if (o.salud !== 'zombi') continue;
    n++;
    cx += o.x;
    cz += o.z;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) mejorD2 = d2;
  }
  if (n > 0 && c.animo === 'tranquilo' && Math.sqrt(mejorD2) <= UMBRAL_VER[c.personality]) {
    entrarEnPanico(c, world, true);
  }

  // 2) contagio de pánico por gritos
  if (c.animo === 'tranquilo') {
    for (const r of world.ruidos) {
      const d2 = (r.x - c.x) ** 2 + (r.z - c.z) ** 2;
      if (d2 <= r.radio * r.radio && world.rngPanico.chance(PROB_PANICO_POR_GRITO[c.personality])) {
        entrarEnPanico(c, world, false);
        break;
      }
    }
  }

  if (c.animo === 'panico') {
    c.prevX = c.x;
    c.prevZ = c.z;
    if (n > 0) {
      const dx = c.x - cx / n;
      const dz = c.z - cz / n;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) {
        c.dirX = dx / len;
        c.dirZ = dz / len;
      }
      c.animoTicks = 0;
    } else {
      c.animoTicks++;
      if (c.animoTicks >= PANICO.ticksCalmarse) {
        calmarse(c, world);
        return;
      }
    }
    const vel = PANICO.velocidadHuida * (c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1);
    moveWithSlide(world.city, c, c.x + c.dirX * vel * DT, c.z + c.dirZ * vel * DT);
    intentarRefugio(c, world);
  } else {
    updateCitizen(c, world.rngCiudadanos, c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1);
  }
}

function entrarEnPanico(c: Citizen, world: World, grita: boolean): void {
  c.animo = 'panico';
  c.animoTicks = 0;
  if (grita) {
    world.ruidos.push({ x: c.x, z: c.z, radio: PANICO.radioGrito, ticks: PANICO.duracionGritoTicks });
  }
}

/** Vuelve a la calma y se re-engancha a la calle más cercana (teletransporte corto). */
function calmarse(c: Citizen, world: World): void {
  c.animo = 'tranquilo';
  const kx = Math.max(0, Math.min(CITY.blocksX, Math.round((c.x - CITY.streetWidth / 2) / CITY_PERIOD)));
  const kz = Math.max(0, Math.min(CITY.blocksY, Math.round((c.z - CITY.streetWidth / 2) / CITY_PERIOD)));
  const cxv = corridorCenter(kx);
  const czh = corridorCenter(kz);
  if (Math.abs(cxv - c.x) <= Math.abs(czh - c.z)) {
    c.x = cxv + c.laneOffset;
    c.dirX = 0;
    c.dirZ = world.rngPanico.chance(0.5) ? 1 : -1;
  } else {
    c.z = czh + c.laneOffset;
    c.dirZ = 0;
    c.dirX = world.rngPanico.chance(0.5) ? 1 : -1;
  }
  c.lastCrossing = -1;
  c.x = Math.min(Math.max(c.x, 1), CITY_WIDTH - 1);
  c.z = Math.min(Math.max(c.z, 1), CITY_DEPTH - 1);
  c.prevX = c.x; // teletransporte: sin estela en el render
  c.prevZ = c.z;
}
