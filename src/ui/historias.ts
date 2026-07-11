import type { Citizen, Hito, RolAgente } from '../sim/types';
import type { World } from '../sim/world';

/** Radio (m) dentro del cual un protector "nunca soltó" a los suyos. */
const RADIO_PROTECTOR = 5;

/** Artículo + rol en español, para las historias de caída (src/ui, NO src/sim). */
const ARTICULO_ROL: Record<Exclude<RolAgente, ''>, string> = {
  policia: 'El policía',
  paramedico: 'La paramédico',
  megafono: 'El del megáfono',
  obrero: 'El obrero',
};

interface Candidato {
  texto: string;
  /** Puntaje de dramatismo: mayor = más arriba en el resultado. */
  drama: number;
  tick: number;
  /** Desempate final estable, independiente del orden de iteración. */
  id: number;
}

function primerNombre(c: Citizen): string {
  return c.name.split(' ')[0];
}

/** true si el ciudadano sigue siendo humano (no eliminado, no convertido). */
function sigueHumano(c: Citizen | undefined): boolean {
  return !!c && c.salud !== 'eliminado' && c.salud !== 'zombi';
}

function distancia(a: Citizen, b: Citizen): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Tick del próximo hito 'caida_agente' del mismo agente después de `desdeTick`, o Infinity. */
function siguienteCaidaMismoAgente(hitos: readonly Hito[], agente: number, desdeTick: number): number {
  let mejor = Infinity;
  for (const h of hitos) {
    if (h.tipo === 'caida_agente' && h.a === agente && h.tick > desdeTick && h.tick < mejor) {
      mejor = h.tick;
    }
  }
  return mejor;
}

/**
 * Compone hasta `max` líneas dramáticas en español a partir de `world.hitos`
 * y el estado final de `world.citizens`. PURO y determinista: SIN rng.
 *
 * Orden: el diseño pide priorizar brecha (por ocupantes) > caída de agente
 * sin rescate > rescate > transformación de cabeza de familia (con
 * familiares vivos) > protector junto a un familiar vivo al terminar. Eso se
 * traduce en bandas de `drama` NO solapadas (1000+ocupantes, 900, 800, 700,
 * 600) para que la categoría siempre mande; dentro de una categoría (solo
 * pasa con varias brechas) se desempata por ocupantes desc y luego por tick
 * asc, tal como pide el brief. `id` es un desempate final estable para que
 * dos llamadas con el mismo mundo produzcan SIEMPRE el mismo orden.
 */
export function componerHistorias(world: World, max = 4): string[] {
  const candidatos: Candidato[] = [];

  for (const h of world.hitos) {
    if (h.tipo === 'brecha') {
      const ocupantes = Math.max(0, h.a);
      candidatos.push({
        texto: `El refugio de la calle ${h.b} cayó con ${ocupantes} persona${ocupantes === 1 ? '' : 's'} dentro.`,
        drama: 1000 + ocupantes,
        tick: h.tick,
        id: h.b,
      });
    } else if (h.tipo === 'caida_agente') {
      const agente = world.citizens[h.a];
      if (!agente || agente.rolAgente === '') continue;
      const siguiente = siguienteCaidaMismoAgente(world.hitos, h.a, h.tick);
      const rescatado = world.hitos.some(
        (r) => r.tipo === 'rescate' && r.b === h.a && r.tick > h.tick && r.tick < siguiente
      );
      if (rescatado) continue;
      candidatos.push({
        texto: `${ARTICULO_ROL[agente.rolAgente]} ${primerNombre(agente)} cayó… y nadie llegó a tiempo.`,
        drama: 900,
        tick: h.tick,
        id: h.a,
      });
    } else if (h.tipo === 'rescate') {
      const rescatador = world.citizens[h.a];
      const caido = world.citizens[h.b];
      if (!rescatador || !caido) continue;
      candidatos.push({
        texto: `La paramédico ${primerNombre(rescatador)} revivió a ${primerNombre(caido)} con la horda encima.`,
        drama: 800,
        tick: h.tick,
        id: h.a * 100000 + h.b,
      });
    } else if (h.tipo === 'transformacion_cabeza') {
      const cabeza = world.citizens[h.a];
      if (!cabeza) continue;
      const familiaresVivos = cabeza.familiares.some((fid) => sigueHumano(world.citizens[fid]));
      if (!familiaresVivos) continue;
      const nombre = primerNombre(cabeza);
      candidatos.push({
        texto: `${nombre} buscaba a su familia cuando dejó de ser ${nombre}.`,
        drama: 700,
        tick: h.tick,
        id: h.a,
      });
    }
  }

  // Historia del protector: no viene de un hito — se lee del estado final
  // (posición y salud al momento de componer, normalmente fin de partida).
  for (const c of world.citizens) {
    if (c.esAgente || c.personality !== 'protector' || c.salud === 'eliminado' || c.familia < 0) continue;
    const cerca = c.familiares.some((fid) => {
      const f = world.citizens[fid];
      return !!f && f.salud !== 'eliminado' && distancia(c, f) < RADIO_PROTECTOR;
    });
    if (!cerca) continue;
    candidatos.push({
      texto: `${primerNombre(c)} nunca soltó a los suyos.`,
      drama: 600,
      tick: world.tickCount,
      id: c.id,
    });
  }

  candidatos.sort((x, y) => y.drama - x.drama || x.tick - y.tick || x.id - y.id);
  return candidatos.slice(0, max).map((c) => c.texto);
}
