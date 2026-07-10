import type { Citizen, Personality } from './types';
import type { World } from './world';
import {
  CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH, CITIZENS, DT,
  INFECCION, LIDER, MEGAFONO, PANICO, PROB_PANICO_POR_GRITO, REFUGIO,
} from './config';
import { corridorCenter } from './cityGen';
import { moveWithSlide } from './collision';
import { updateCitizen } from './citizens';
import { intentarRefugio } from './refugio';

/** A qué distancia de un zombi reacciona cada personalidad. */
const UMBRAL_VER: Record<Personality, number> = {
  cobarde: 15,
  protector: 12,
  egoista: 12,
  lider: 10,
  valiente: 8,
  imprudente: 5,
};

export function updateHumano(c: Citizen, world: World): void {
  if (c.forzadoTicks > 0) {
    c.forzadoTicks--;
    c.prevX = c.x;
    c.prevZ = c.z;
    const dx = c.forzadoX - c.x;
    const dz = c.forzadoZ - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1) {
      c.dirX = dx / d;
      c.dirZ = dz / d;
      moveWithSlide(world.city, c, c.x + c.dirX * CITIZENS.walkSpeed * MEGAFONO.factorPrisa * DT, c.z + c.dirZ * CITIZENS.walkSpeed * MEGAFONO.factorPrisa * DT);
    }
    return; // el megáfono manda: ni pánico ni familia esta ronda
  }

  // 1) percepción directa de zombis y del entorno social (líder, pánicos cercanos)
  let n = 0;
  let cx = 0;
  let cz = 0;
  let mejorD2 = Infinity;
  let liderCerca: Citizen | null = null;
  let liderD2 = Infinity;
  let panicosCerca = 0;
  for (const i of world.grid.queryCircle(c.x, c.z, PANICO.radioVerZombi)) {
    const o = world.citizens[i];
    if (o.salud === 'zombi') {
      n++;
      cx += o.x;
      cz += o.z;
      const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
      if (d2 < mejorD2) mejorD2 = d2;
    } else if (o !== c) {
      const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
      if (d2 <= LIDER.radio * LIDER.radio) {
        if (o.personality === 'lider' && o.animo === 'tranquilo' && d2 < liderD2) {
          liderD2 = d2;
          liderCerca = o;
        }
        if (o.animo === 'panico') panicosCerca++;
      }
    }
  }
  if (n > 0 && c.animo === 'tranquilo' && Math.sqrt(mejorD2) <= UMBRAL_VER[c.personality]) {
    entrarEnPanico(c, world, true);
  }

  // 2) contagio de pánico por gritos (un líder cerca calma los ánimos)
  if (c.animo === 'tranquilo') {
    const probGrito = PROB_PANICO_POR_GRITO[c.personality] * (liderCerca ? LIDER.factorCalma : 1);
    for (const r of world.ruidos) {
      const d2 = (r.x - c.x) ** 2 + (r.z - c.z) ** 2;
      if (d2 <= r.radio * r.radio && world.rngPanico.chance(probGrito)) {
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
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.001) {
        c.dirX = dx / len;
        c.dirZ = dz / len;
      }
      c.animoTicks = 0;
    } else {
      if (liderCerca) {
        const dxl = liderCerca.x - c.x;
        const dzl = liderCerca.z - c.z;
        const dl = Math.sqrt(dxl * dxl + dzl * dzl);
        if (dl > 0.001) {
          c.dirX = dxl / dl;
          c.dirZ = dzl / dl; // sin zombis a la vista, lo siguen
        }
      }
      c.animoTicks++;
      const umbralCalma = liderCerca ? PANICO.ticksCalmarse / LIDER.divisorCalmarse : PANICO.ticksCalmarse;
      if (c.animoTicks >= umbralCalma) {
        calmarse(c, world);
        return;
      }
    }

    if (c.personality === 'protector' && c.familia >= 0 && (n === 0 || mejorD2 > 36)) {
      let f: Citizen | null = null;
      let mdf = Infinity;
      for (const j of c.familiares) {
        const o = world.citizens[j];
        if (o.salud === 'eliminado' || o.salud === 'zombi' || o.dentroDe >= 0) continue;
        const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
        if (d2 < mdf) { mdf = d2; f = o; }
      }
      if (f && mdf > 16 && mdf < 900) {
        const dxf = f.x - c.x;
        const dzf = f.z - c.z;
        const df = Math.sqrt(dxf * dxf + dzf * dzf);
        c.dirX = dxf / df;
        c.dirZ = dzf / df; // vuelve por los suyos
      }
    }

    const vel = PANICO.velocidadHuida * (c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1);
    moveWithSlide(world.city, c, c.x + c.dirX * vel * DT, c.z + c.dirZ * vel * DT);
    intentarRefugio(c, world);
  } else {
    if (c.personality === 'lider' && panicosCerca >= LIDER.panicosParaGuiar) {
      let puertaX = 0;
      let puertaZ = 0;
      let mejorPuertaD2 = Infinity;
      let hayPuerta = false;
      for (const b of world.city.buildings) {
        if (b.kind !== 'jugable' || world.brecha[b.id] || world.ocupantes[b.id] >= REFUGIO.capacidad) continue;
        const p = b.puerta!;
        const d2 = (p.x - c.x) ** 2 + (p.z - c.z) ** 2;
        if (d2 <= LIDER.alcanceGuia * LIDER.alcanceGuia && d2 < mejorPuertaD2) {
          mejorPuertaD2 = d2;
          puertaX = p.x;
          puertaZ = p.z;
          hayPuerta = true;
        }
      }
      if (hayPuerta) {
        c.prevX = c.x;
        c.prevZ = c.z;
        const dxp = puertaX - c.x;
        const dzp = puertaZ - c.z;
        const dp = Math.sqrt(dxp * dxp + dzp * dzp);
        if (dp > 0.001) {
          c.dirX = dxp / dp;
          c.dirZ = dzp / dp;
        }
        moveWithSlide(world.city, c, c.x + c.dirX * CITIZENS.walkSpeed * DT, c.z + c.dirZ * CITIZENS.walkSpeed * DT);
        intentarRefugio(c, world); // el líder entra aunque esté tranquilo: es el único con permiso
        return;
      }
    }
    if (c.familia >= 0 && c.cabezaFamilia !== c.id) {
      const cabeza = world.citizens[c.cabezaFamilia];
      if (cabeza.salud !== 'eliminado' && cabeza.dentroDe < 0) {
        const dxf = cabeza.x - c.x;
        const dzf = cabeza.z - c.z;
        const df = Math.sqrt(dxf * dxf + dzf * dzf);
        if (df > 3) {
          c.prevX = c.x;
          c.prevZ = c.z;
          c.dirX = dxf / df;
          c.dirZ = dzf / df;
          moveWithSlide(world.city, c, c.x + c.dirX * CITIZENS.walkSpeed * DT, c.z + c.dirZ * CITIZENS.walkSpeed * DT);
          return;
        }
      }
    }
    updateCitizen(
      c,
      world.rngCiudadanos,
      c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1,
      world.peligroFn
    );
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
