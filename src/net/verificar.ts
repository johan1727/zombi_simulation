// PANDEMIA — cliente delgado del servidor de verificación de desafíos
// (Plan 17, Task 3). Mismo patrón que `sala.ts` (`URL_RELAY`/`VITE_RELAY_URL`)
// pero para un servicio HTTP aparte (`server/verificar.ts`, no WebSocket):
// propia URL, propio fallback local, propia env var.
//
// Decisión de diseño (Task 3, ver reporte `.superpowers/sdd/p17-task-3-report.md`):
// el link de desafío sigue siendo 100% offline/self-contained (no lleva
// `ordenLog`). Por eso la verificación tiene DOS llamadas distintas:
// - `enviarVerificacion` (al COMPARTIR): manda el log completo a `/verificar`,
//   que hace un replay real y — si es válido — lo registra en una caché en
//   memoria del servidor (ver `server/verificar.ts`).
// - `consultarVerificado` (al ABRIR un `?reto=`): sin `ordenLog` a mano, solo
//   puede preguntarle a esa misma caché "¿ya viste este seed+curva+índice
//   exactos, confirmados por un replay real?" vía `/verificado`.
// Ambas son best-effort: un fallo de red nunca debe afectar el flujo del
// juego (compartir siempre copia el link; abrir un reto siempre arranca).

import type { OrdenJugador } from '../sim/types';

/** URL del servidor de verificación en desarrollo local (`npm run verificar`). */
export const URL_VERIFICAR_LOCAL = 'http://localhost:8788';

/**
 * URL del servidor de verificación a usar: `VITE_VERIFICAR_URL` en
 * `.env`/`.env.production` apunta a la URL desplegada; sin esa variable, cae
 * a `URL_VERIFICAR_LOCAL` (desarrollo). Mismo criterio que `URL_RELAY` de
 * `sala.ts`.
 */
export const URL_VERIFICAR = import.meta.env.VITE_VERIFICAR_URL ?? URL_VERIFICAR_LOCAL;

export interface PeticionVerificar {
  seed: string;
  ordenLog: { tick: number; orden: OrdenJugador }[];
  duracionTicks: number;
  curvaAfirmada: number[];
  indiceAfirmado: number;
}

export interface ConsultaVerificado {
  seed: string;
  curvaAfirmada: number[];
  indiceAfirmado: number;
}

/**
 * Fire-and-forget: manda el log de órdenes de la partida propia a
 * `/verificar` al COMPARTIR un desafío (`resultado.ts`). Deliberadamente sin
 * `async`/promesa devuelta al llamador — nada del flujo de compartir debe
 * esperar la respuesta ni verse afectado si el servidor no responde o no
 * existe (offline, servidor caído, etc.). Solo loguea en consola para debug.
 */
export function enviarVerificacion(p: PeticionVerificar): void {
  fetch(`${URL_VERIFICAR}/verificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  }).catch((err: unknown) => {
    console.debug('[verificar] no se pudo confirmar el desafío al compartir (no afecta el link copiado):', err);
  });
}

/**
 * Consulta la caché de desafíos ya confirmados al ABRIR un `?reto=`
 * (`main.ts`). Timeout corto vía `AbortController` (por defecto 2.5 s):
 * nunca debe demorar el arranque del juego. Cualquier fallo (red, timeout,
 * servidor apagado, JSON inesperado) resuelve `false` — "sin verificar",
 * nunca lanza.
 */
export async function consultarVerificado(c: ConsultaVerificado, timeoutMs = 2500): Promise<boolean> {
  const controlador = new AbortController();
  const timer = window.setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL_VERIFICAR}/verificado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
      signal: controlador.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { verificado?: unknown };
    return data.verificado === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}
