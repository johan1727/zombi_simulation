import type { Citizen, OrdenJugador, RolAgente } from './types';
import type { World } from './world';
import type { Rng } from './rng';
import { AGENTES, DT, HERIDAS, MEGAFONO, OBRERO, PARAMEDICO, POLICIA, PANICO, CITY, CITY_PERIOD } from './config';
import { moveWithSlide } from './collision';
import { NOMBRES } from './citizens';

/**
 * Crea un agente del jugador: sano, sin familia, plantado en (x, z).
 * `rng` (SIEMPRE `world.rngAgentes`, ver Task 1) le da un nombre PROPIO real
 * — el rol (policía, paramédico...) ya vive aparte en `rolAgente` y lo
 * muestra el panel; `name` es para que las historias (T6, src/ui/historias.ts)
 * puedan decir «el policía Marcos cayó…» en vez de «el policía Policía».
 */
export function crearAgente(rol: Exclude<RolAgente, ''>, x: number, z: number, id: number, rng: Rng): Citizen {
  return {
    id,
    name: rng.pick(NOMBRES),
    personality: 'valiente',
    x,
    z,
    prevX: x,
    prevZ: z,
    dirX: 0,
    dirZ: -1,
    laneOffset: 0,
    state: 'quieto',
    idleTicks: 0,
    lastCrossing: -1,
    salud: 'sano',
    incubacionTicks: 0,
    animo: 'tranquilo',
    animoTicks: 0,
    dentroDe: -1,
    piso: 0,
    pisoObjetivo: 0,
    escaleraTicks: 0,
    cdMordida: 0,
    familia: -1,
    cabezaFamilia: id,
    familiares: [],
    esAgente: true,
    rolAgente: rol,
    ordenX: NaN,
    ordenZ: NaN,
    caidoTicks: 0,
    cdHabilidad: 0,
    diagnosticadoTicks: 0,
    forzadoX: NaN,
    forzadoZ: NaN,
    forzadoTicks: 0,
    zonaHerida: '',
    ventanaAmputarTicks: 0,
    brazoAmputado: false,
  };
}

/** Aplica una orden encolada (inicio de tick, orden FIFO). */
export function aplicarOrden(o: OrdenJugador, world: World): void {
  const a = world.citizens[o.agente];
  if (!a || !a.esAgente || a.salud !== 'sano') return;
  if (o.tipo === 'mover' || o.tipo === 'control') {
    a.ordenX = o.x;
    a.ordenZ = o.z;
    return;
  }
  // habilidad
  if (a.cdHabilidad > 0) return;
  if (a.rolAgente === 'policia') dispararPolicia(a, o, world);
  else if (a.rolAgente === 'paramedico') actuarParamedico(a, world);
  else if (a.rolAgente === 'megafono') gritarMegafono(a, o, world);
  else if (a.rolAgente === 'obrero') reforzarObrero(a, world);
}

function dispararPolicia(a: Citizen, o: OrdenJugador, world: World): void {
  // el zombi activo más cercano al PUNTO apuntado, a alcance del AGENTE
  let objetivo: Citizen | null = null;
  let mejorD2 = Infinity;
  for (const i of world.grid.queryCircle(o.x, o.z, 6)) {
    const c = world.citizens[i];
    if (c.salud !== 'zombi') continue;
    const dAg = (c.x - a.x) ** 2 + (c.z - a.z) ** 2;
    if (dAg > POLICIA.alcance ** 2) continue;
    const d2 = (c.x - o.x) ** 2 + (c.z - o.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      objetivo = c;
    }
  }
  if (!objetivo) return;
  objetivo.salud = 'eliminado';
  world.splats.push({ x: objetivo.x, z: objetivo.z, tono: world.rngAgentes.next() });
  world.registrarPeligro(objetivo.x, objetivo.z);
  // el disparo se OYE en toda la cuadra: el dilema del policía
  world.ruidos.push({ x: a.x, z: a.z, radio: POLICIA.radioRuido, ticks: PANICO.duracionGritoTicks });
  world.hitos.push({ tick: world.tickCount, tipo: 'disparo', a: a.id, b: objetivo.id });
  a.cdHabilidad = POLICIA.cooldownTicks;
}

function actuarParamedico(a: Citizen, world: World): void {
  // 1) revivir caído adyacente (prioridad); 2) si no, diagnóstico en radio
  let caido: Citizen | null = null;
  let mejorD2 = PARAMEDICO.alcanceRevivir ** 2;
  for (const c of world.citizens) {
    if (c.salud !== 'caido') continue;
    const d2 = (c.x - a.x) ** 2 + (c.z - a.z) ** 2;
    if (d2 <= mejorD2) {
      mejorD2 = d2;
      caido = c;
    }
  }
  if (caido) {
    caido.salud = 'sano';
    caido.caidoTicks = 0;
    world.hitos.push({ tick: world.tickCount, tipo: 'rescate', a: a.id, b: caido.id });
  } else {
    for (const i of world.grid.queryCircle(a.x, a.z, PARAMEDICO.radioDiagnostico)) {
      const c = world.citizens[i];
      if (c.salud === 'incubando') c.diagnosticadoTicks = PARAMEDICO.marcaTicks;
    }
  }
  a.cdHabilidad = POLICIA.cooldownTicks; // mismo enfriamiento estándar
}

function gritarMegafono(a: Citizen, o: OrdenJugador, world: World): void {
  for (const i of world.grid.queryCircle(a.x, a.z, MEGAFONO.radio)) {
    const c = world.citizens[i];
    if (c.esAgente || c.salud === 'zombi' || c.salud === 'eliminado') continue;
    c.forzadoX = o.x;
    c.forzadoZ = o.z;
    c.forzadoTicks = MEGAFONO.duracionTicks;
  }
  world.ruidos.push({ x: a.x, z: a.z, radio: MEGAFONO.radio, ticks: PANICO.duracionGritoTicks });
  world.hitos.push({ tick: world.tickCount, tipo: 'megafono', a: a.id, b: -1 });
  a.cdHabilidad = POLICIA.cooldownTicks;
}

function reforzarObrero(a: Citizen, world: World): void {
  if (world.usosObrero <= 0) return;
  const bx = Math.floor(a.x / CITY_PERIOD);
  const bz = Math.floor(a.z / CITY_PERIOD);
  const candidatos: ReadonlyArray<readonly [number, number]> = [
    [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
  ];
  for (const [ix, iz] of candidatos) {
    if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
    const b = world.city.buildings[ix * CITY.blocksY + iz];
    if (b.kind !== 'jugable' || world.brecha[b.id]) continue;
    const p = b.puerta!;
    const d2 = (p.x - a.x) ** 2 + (p.z - a.z) ** 2;
    if (d2 <= OBRERO.alcancePuerta ** 2) {
      world.refuerzoPuerta[b.id] += OBRERO.refuerzo;
      world.usosObrero--;
      world.hitos.push({ tick: world.tickCount, tipo: 'refuerzo', a: a.id, b: b.id });
      a.cdHabilidad = POLICIA.cooldownTicks;
      return;
    }
  }
}

/** IA del agente por tick: caído cuenta atrás; orden de mover; autodefensa; quieto. */
export function updateAgente(c: Citizen, world: World): void {
  c.prevX = c.x;
  c.prevZ = c.z;
  if (c.cdHabilidad > 0) c.cdHabilidad--;
  const velocidad = AGENTES.velocidad * (c.zonaHerida === 'pierna' ? HERIDAS.factorVelocidadFractura : 1);

  if (c.salud === 'caido') {
    c.caidoTicks--;
    if (c.caidoTicks <= 0) {
      c.salud = 'zombi';
      world.splats.push({ x: c.x, z: c.z, tono: world.rngAgentes.next() });
      world.registrarPeligro(c.x, c.z);
      world.hitos.push({ tick: world.tickCount, tipo: 'caida_agente', a: c.id, b: -1 });
    }
    return;
  }

  if (!Number.isNaN(c.ordenX)) {
    const dx = c.ordenX - c.x;
    const dz = c.ordenZ - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= AGENTES.llegadaOrden) {
      c.ordenX = NaN;
      c.ordenZ = NaN;
    } else {
      c.dirX = dx / d;
      c.dirZ = dz / d;
      moveWithSlide(world.city, c, c.x + c.dirX * velocidad * DT, c.z + c.dirZ * velocidad * DT);
      return;
    }
  }

  // autodefensa: sin orden, se aleja del zombi más cercano
  let zx = 0;
  let zz = 0;
  let visto = false;
  let mejorD2 = AGENTES.radioAutodefensa ** 2;
  for (const i of world.grid.queryCircle(c.x, c.z, AGENTES.radioAutodefensa)) {
    const o = world.citizens[i];
    if (o.salud !== 'zombi') continue;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      zx = o.x;
      zz = o.z;
      visto = true;
    }
  }
  if (visto) {
    const dx = c.x - zx;
    const dz = c.z - zz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.001) {
      c.dirX = dx / d;
      c.dirZ = dz / d;
      moveWithSlide(world.city, c, c.x + c.dirX * velocidad * DT, c.z + c.dirZ * velocidad * DT);
    }
  }
}
