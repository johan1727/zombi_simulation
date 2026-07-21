// PANDEMIA — endpoint de verificación de desafíos (Plan 17, Task 2).
//
// Node puro (mismo estilo que server/relay.ts), FUERA de src/ — no pasa por
// Vite. A diferencia del relay, este proceso SÍ importa de `src/sim/` (y de
// `src/game/partida.ts`, también puro): `World` es 100% determinista y sin
// DOM (confirmado en el plan), así que una partida completa puede
// re-simularse byte a byte del lado servidor dado (a) la semilla y (b) el
// log completo de órdenes con su tick (`World.ordenLog`, Plan 17 Task 1).
//
// Deliberadamente NO importamos `src/game/desafio.ts` aquí pese a que tiene
// la función `muestrearParaUrl` que necesitaríamos reusar: ese módulo usa
// `btoa`/`atob`/`TextEncoder` para el códec de la URL, tipos de navegador
// que no están garantizados bajo el `tsconfig` de `server/` (sin lib DOM).
// En vez de ensanchar ese tsconfig, la downsample (tomar 1 de cada 2
// muestras, redondear, recortar a [0,100]) se reimplementa aquí mismo en
// `downsamplearParaUrl` — MISMA lógica que `muestrearParaUrl`, mantenerlas
// en sync si una cambia.
//
// Arranque: `npm run verificar` (== `tsx server/verificar.ts`), NO `node
// server/verificar.ts` directo: a diferencia de relay.ts (sin imports
// relativos), este archivo SÍ importa de `src/sim/` y `src/game/`, que usan
// imports relativos SIN extensión (`./rng`, no `./rng.ts`) — estilo normal
// bajo `moduleResolution: bundler` de Vite/tsc, pero el loader ESM nativo de
// Node exige que el especificador resuelva a un archivo real y NO le agrega
// extensiones por su cuenta, así que `node` puro revienta con
// ERR_MODULE_NOT_FOUND en cualquier import transitivo de `src/`. `tsx` (como
// Vite) sí resuelve extensiones automáticamente — evita esto sin tocar un
// solo import de `src/sim/` (prohibido) ni de `src/game/` (fuera de alcance).

import * as http from 'node:http';
import { pathToFileURL } from 'node:url';
import { World } from '../src/sim/world';
import type { OrdenJugador } from '../src/sim/types';
import { TICK_RATE } from '../src/sim/config';
import { INTERVALO_MUESTRA, MAX_MUESTRAS } from '../src/game/partida';

const PUERTO = Number(process.env.PORT ?? process.env.PUERTO_VERIFICAR ?? 8788);

/** Igual que `Partida.duracionTicks` (8 min a 30 tps): tope duro para no replayar de más. */
const DURACION_MAXIMA_TICKS = 8 * 60 * TICK_RATE;
/** Tope de entradas del log de órdenes, generoso mismo con posesión WASD sostenida toda la partida (4 agentes × 14400 ticks), para no aceptar payloads absurdos. */
const MAX_ORDENES = 100_000;
/** Tope de bytes del cuerpo de la petición, para no dejar crecer la memoria sin límite. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Tolerancia de comparación de la curva (floats): las muestras ya vienen redondeadas a enteros en ambos lados, esto solo cubre imprecisión residual. */
const TOLERANCIA_CURVA = 0.5;
/**
 * Tope de entradas de la caché de desafíos ya confirmados (ver más abajo,
 * Task 3): un `Map` en memoria, sin persistencia, mismo espíritu que
 * `salas`/`colaPublica` de `server/relay.ts` — si el proceso se reinicia,
 * los sellos ya emitidos se pierden (aceptable, es solo un indicador best-
 * effort, nunca una fuente de verdad que bloquee nada).
 */
const CACHE_MAX_ENTRADAS = 5000;

export interface PeticionVerificar {
  seed: string;
  ordenLog: { tick: number; orden: OrdenJugador }[];
  /** Hasta qué tick replayar (fin de la partida real: reloj o colapso). */
  duracionTicks: number;
  curvaAfirmada: number[];
  indiceAfirmado: number;
}

/**
 * Consulta ligera (Task 3): al ABRIR un `?reto=` el cliente NO tiene el
 * `ordenLog` original (nunca viaja en el link, ver `src/game/desafio.ts`),
 * así que no puede pedir un replay real — solo puede preguntar si este
 * seed+curva+índice EXACTOS ya fueron confirmados antes por un replay real
 * (disparado cuando alguien MÁS compartió este mismo desafío). Dos personas
 * no pueden compartir la misma terna por azar sin haber jugado la misma
 * partida real, así que la terna sirve de identidad suficiente para la
 * caché sin necesitar el log.
 */
export interface ConsultaVerificado {
  seed: string;
  curvaAfirmada: number[];
  indiceAfirmado: number;
}

export interface ResultadoVerificacion {
  valido: boolean;
  error?: string;
}

function esOrdenJugador(o: unknown): o is OrdenJugador {
  if (typeof o !== 'object' || o === null) return false;
  const r = o as Record<string, unknown>;
  if (typeof r.agente !== 'number' || !Number.isInteger(r.agente) || r.agente < 0) return false;
  if (r.tipo !== 'mover' && r.tipo !== 'habilidad' && r.tipo !== 'control') return false;
  if (typeof r.x !== 'number' || !Number.isFinite(r.x)) return false;
  if (typeof r.z !== 'number' || !Number.isFinite(r.z)) return false;
  if (r.veloz !== undefined && typeof r.veloz !== 'boolean') return false;
  if (r.cambiarPiso !== undefined && r.cambiarPiso !== 1 && r.cambiarPiso !== -1) return false;
  return true;
}

function validarSeed(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > 64) return null;
  return v;
}

function validarIndiceAfirmado(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < 0 || v > 300) return null;
  return v;
}

function validarCurvaAfirmada(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 200) return null;
  const curva: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 100) return null;
    curva.push(x);
  }
  return curva;
}

/**
 * Nunca lanza: cualquier entrada malformada, fuera de rango o con tipos
 * inválidos devuelve `null` (mismo criterio que `decodificarDesafio`).
 */
export function validarPeticion(body: unknown): PeticionVerificar | null {
  if (typeof body !== 'object' || body === null) return null;
  const r = body as Record<string, unknown>;

  const seed = validarSeed(r.seed);
  if (seed === null) return null;

  if (typeof r.duracionTicks !== 'number' || !Number.isInteger(r.duracionTicks)) return null;
  if (r.duracionTicks < 0 || r.duracionTicks > DURACION_MAXIMA_TICKS) return null;

  const indiceAfirmado = validarIndiceAfirmado(r.indiceAfirmado);
  if (indiceAfirmado === null) return null;

  const curvaAfirmada = validarCurvaAfirmada(r.curvaAfirmada);
  if (curvaAfirmada === null) return null;

  if (!Array.isArray(r.ordenLog) || r.ordenLog.length > MAX_ORDENES) return null;
  const ordenLog: { tick: number; orden: OrdenJugador }[] = [];
  let ultimoTick = -1;
  for (const entrada of r.ordenLog) {
    if (typeof entrada !== 'object' || entrada === null) return null;
    const e = entrada as Record<string, unknown>;
    if (typeof e.tick !== 'number' || !Number.isInteger(e.tick) || e.tick < 0 || e.tick >= r.duracionTicks) return null;
    if (e.tick < ultimoTick) return null; // el log real siempre viene en orden de tick (Task 1)
    ultimoTick = e.tick;
    if (!esOrdenJugador(e.orden)) return null;
    ordenLog.push({ tick: e.tick, orden: e.orden });
  }

  return { seed, ordenLog, duracionTicks: r.duracionTicks, curvaAfirmada, indiceAfirmado };
}

/**
 * Nunca lanza, mismo criterio que `validarPeticion` — pero sin `ordenLog`
 * ni `duracionTicks` (la consulta de Task 3 no los necesita).
 */
export function validarConsulta(body: unknown): ConsultaVerificado | null {
  if (typeof body !== 'object' || body === null) return null;
  const r = body as Record<string, unknown>;

  const seed = validarSeed(r.seed);
  if (seed === null) return null;
  const indiceAfirmado = validarIndiceAfirmado(r.indiceAfirmado);
  if (indiceAfirmado === null) return null;
  const curvaAfirmada = validarCurvaAfirmada(r.curvaAfirmada);
  if (curvaAfirmada === null) return null;

  return { seed, curvaAfirmada, indiceAfirmado };
}

/**
 * Caché de desafíos ya confirmados por un replay real (`registrarVerificado`,
 * llamado desde el handler de `/verificar` cuando `valido === true`) — ver
 * `ConsultaVerificado` arriba para el porqué. Clave = terna serializada
 * (seed+índice+curva, la curva ya viene de enteros redondeados en ambos
 * lados de esta app — cliente y replay — así que `join(',')` es estable).
 */
const verificados = new Map<string, true>();

function claveVerificado(seed: string, indiceAfirmado: number, curvaAfirmada: number[]): string {
  return `${seed}|${indiceAfirmado}|${curvaAfirmada.join(',')}`;
}

function registrarVerificado(seed: string, indiceAfirmado: number, curvaAfirmada: number[]): void {
  const clave = claveVerificado(seed, indiceAfirmado, curvaAfirmada);
  if (!verificados.has(clave) && verificados.size >= CACHE_MAX_ENTRADAS) {
    // FIFO simple: `Map` preserva orden de inserción, se descarta la más vieja.
    const primera = verificados.keys().next().value;
    if (primera !== undefined) verificados.delete(primera);
  }
  verificados.set(clave, true);
}

function estaVerificado(seed: string, indiceAfirmado: number, curvaAfirmada: number[]): boolean {
  return verificados.has(claveVerificado(seed, indiceAfirmado, curvaAfirmada));
}

/**
 * Downsample de una curva fina (5 s/muestra, la de `Partida.curva`) a una
 * gruesa (10 s/muestra: 1 de cada 2), enteros recortados a [0, 100]. MISMA
 * lógica que `muestrearParaUrl` de `src/game/desafio.ts` — ver comentario de
 * cabecera del porqué no se importa directamente.
 */
function downsamplearParaUrl(curvaFina: readonly number[]): number[] {
  const out: number[] = [];
  for (let idx = 0; idx < curvaFina.length; idx += 2) {
    out.push(Math.max(0, Math.min(100, Math.round(curvaFina[idx]))));
  }
  return out;
}

/**
 * Núcleo puro del replay: reconstruye la partida completa desde la semilla y
 * el log de órdenes, y compara el resultado EXACTO contra lo afirmado. Sin
 * HTTP, sin efectos colaterales fuera de sus argumentos — testeable directo.
 * Nunca lanza: cualquier orden que `World.tick()`/`aplicarOrden` rechace
 * internamente ya se ignora ahí (agente inválido, etc.); un error inesperado
 * se atrapa y se reporta como inválido en vez de tumbar el proceso.
 */
export function replayYComparar(p: PeticionVerificar): ResultadoVerificacion {
  try {
    const w = new World(p.seed);
    let i = 0;
    const curvaFina: number[] = [];

    for (let t = 0; t < p.duracionTicks; t++) {
      while (i < p.ordenLog.length && p.ordenLog[i].tick === t) {
        w.encolarOrden(p.ordenLog[i].orden);
        i++;
      }
      w.tick();
      // Misma condición que `Partida.update()`, ejecutada en el mismo punto
      // del ciclo (justo después de `world.tick()`).
      if (w.tickCount % INTERVALO_MUESTRA === 0 && w.tickCount > 0 && curvaFina.length < MAX_MUESTRAS) {
        curvaFina.push(w.vivosPct);
      }
    }

    if (w.indiceCiudad !== p.indiceAfirmado) {
      return { valido: false, error: 'indice de ciudad no coincide con el replay' };
    }

    const curvaReplay = downsamplearParaUrl(curvaFina);
    if (curvaReplay.length !== p.curvaAfirmada.length) {
      return { valido: false, error: 'la curva afirmada tiene un largo distinto al del replay' };
    }
    for (let idx = 0; idx < curvaReplay.length; idx++) {
      if (Math.abs(curvaReplay[idx] - p.curvaAfirmada[idx]) >= TOLERANCIA_CURVA) {
        return { valido: false, error: 'la curva afirmada no coincide con el replay' };
      }
    }

    return { valido: true };
  } catch (err) {
    return { valido: false, error: err instanceof Error ? err.message : 'error interno de replay' };
  }
}

function responderJson(res: http.ServerResponse, status: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(texto);
}

const servidor = http.createServer((req, res) => {
  // CORS abierto: el endpoint es de solo-lectura (un replay puro, sin
  // efectos persistentes) y se llama desde el cliente estático (Plan 17
  // Task 3), servido en un origen distinto al de este servidor.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // `/verificado` (Task 3): consulta liviana de caché al ABRIR un `?reto=`,
  // sin replay (ver `ConsultaVerificado` más arriba). Mismo método/CORS que
  // `/verificar`, cuerpo distinto.
  if (req.method !== 'POST' || (req.url !== '/verificar' && req.url !== '/verificado')) {
    responderJson(res, 404, { valido: false, error: 'ruta no encontrada' });
    return;
  }
  const ruta = req.url;

  const trozos: Buffer[] = [];
  let bytes = 0;
  let abortado = false;

  req.on('data', (trozo: Buffer) => {
    if (abortado) return;
    bytes += trozo.length;
    if (bytes > MAX_BODY_BYTES) {
      abortado = true;
      responderJson(res, 413, { valido: false, error: 'cuerpo demasiado grande' });
      req.destroy();
      return;
    }
    trozos.push(trozo);
  });

  req.on('end', () => {
    if (abortado) return;
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(trozos).toString('utf8'));
    } catch {
      responderJson(res, 400, { valido: false, error: 'JSON malformado' });
      return;
    }

    if (ruta === '/verificado') {
      const consulta = validarConsulta(body);
      if (!consulta) {
        responderJson(res, 400, { verificado: false, error: 'petición inválida' });
        return;
      }
      const verificado = estaVerificado(consulta.seed, consulta.indiceAfirmado, consulta.curvaAfirmada);
      responderJson(res, 200, { verificado });
      return;
    }

    const peticion = validarPeticion(body);
    if (!peticion) {
      responderJson(res, 400, { valido: false, error: 'petición inválida' });
      return;
    }

    const resultado = replayYComparar(peticion);
    if (resultado.valido) {
      registrarVerificado(peticion.seed, peticion.indiceAfirmado, peticion.curvaAfirmada);
    }
    responderJson(res, 200, resultado);
  });

  req.on('error', () => {
    if (!abortado) responderJson(res, 400, { valido: false, error: 'error leyendo la petición' });
  });
});

// Solo escuchar si este archivo se ejecuta directamente (`node
// server/verificar.ts`), no cuando `replayYComparar`/`validarPeticion` se
// importan desde un test — así los tests no dejan un servidor HTTP colgado.
const esEntradaPrincipal = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esEntradaPrincipal) {
  servidor.listen(PUERTO, () => {
    console.log(`[verificar] escuchando en http://localhost:${PUERTO}`);
  });
}
