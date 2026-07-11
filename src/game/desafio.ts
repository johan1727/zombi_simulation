/**
 * El link de desafío: codifica una partida terminada (semilla + curva +
 * índice final) en un código base64url compacto, para que otro jugador la
 * cargue con `?reto=<codigo>` y juegue LA MISMA pandemia intentando superar
 * el resultado. PURO: nada de DOM, `location` ni `World` aquí — solo
 * codificación/decodificación de datos planos, para poder testear sin
 * navegador. `Rival` (modo estático) y `main.ts`/`resultado.ts` (armado de
 * la URL con `location`) son quienes usan esto.
 */

export interface Desafio {
  seed: string;
  /** Curva de `vivosPct` (0-100), muestreada cada 10 s (más gruesa que la de Partida/Rival, 5 s). */
  curva: number[];
  /** Índice de Ciudad final de quien lanzó el desafío. */
  indice: number;
  nombre?: string;
}

/** Tope de muestras en la curva codificada: de sobra para una partida de 8 min a 10 s/muestra (48). */
const MAX_MUESTRAS_CURVA = 200;
/** Tope de caracteres del nombre, para no inflar la URL con texto libre. */
const MAX_LARGO_NOMBRE = 24;

function base64UrlEncode(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(codigo: string): string {
  let b64 = codigo.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binario = atob(b64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * JSON compacto (claves de una letra: `s`/`c`/`i`/`n`) → base64url. La curva
 * se redondea a enteros y se recorta a [0, 100] aquí (no confiar en que el
 * llamador ya la haya limpiado): es la última barrera antes de la URL.
 */
export function codificarDesafio(d: { seed: string; curva: number[]; indice: number; nombre?: string }): string {
  const curva = d.curva
    .slice(0, MAX_MUESTRAS_CURVA)
    .map((v) => Math.max(0, Math.min(100, Math.round(v))));
  const compacto: Record<string, unknown> = {
    s: d.seed,
    c: curva,
    i: Math.round(d.indice),
  };
  if (d.nombre && d.nombre.trim().length > 0) {
    compacto.n = d.nombre.trim().slice(0, MAX_LARGO_NOMBRE);
  }
  return base64UrlEncode(JSON.stringify(compacto));
}

/**
 * Nunca lanza: cualquier entrada malformada, truncada o con tipos/rangos
 * inválidos devuelve `null`. `main.ts` la llama directo sobre
 * `URLSearchParams`, que puede traer cualquier basura de un link copiado a mano.
 */
export function decodificarDesafio(codigo: string): Desafio | null {
  if (typeof codigo !== 'string' || codigo.length === 0 || codigo.length > 4000) return null;
  try {
    const json = base64UrlDecode(codigo);
    const obj: unknown = JSON.parse(json);
    if (typeof obj !== 'object' || obj === null) return null;
    const { s, c, i, n } = obj as Record<string, unknown>;

    if (typeof s !== 'string' || s.length === 0 || s.length > 64) return null;

    if (!Array.isArray(c) || c.length === 0 || c.length > MAX_MUESTRAS_CURVA) return null;
    const curva: number[] = [];
    for (const v of c) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null;
      curva.push(v);
    }

    if (typeof i !== 'number' || !Number.isFinite(i) || i < 0 || i > 300) return null;

    if (n !== undefined && (typeof n !== 'string' || n.length > MAX_LARGO_NOMBRE)) return null;

    const desafio: Desafio = { seed: s, curva, indice: i };
    if (typeof n === 'string' && n.length > 0) desafio.nombre = n;
    return desafio;
  } catch {
    return null;
  }
}

/**
 * Downsamplea una curva fina (5 s, la de `Partida`) a una más gruesa para el
 * link (10 s: uno de cada dos puntos), enteros 0-100. Independiente de la
 * curva de 5 s que usa `Resultado` para su propio gráfico — son dos
 * representaciones de la misma partida para propósitos distintos.
 */
export function muestrearParaUrl(curvaFina: readonly number[]): number[] {
  const out: number[] = [];
  for (let idx = 0; idx < curvaFina.length; idx += 2) {
    out.push(Math.max(0, Math.min(100, Math.round(curvaFina[idx]))));
  }
  return out;
}

/**
 * Interpola linealmente un valor de una curva gruesa (10 s) en una posición
 * fraccional de muestra (p. ej. 1.5 = a medio camino entre la muestra 1 y la
 * 2). Usado por `Rival` en modo reto para "revelar" la curva estática del
 * desafío a la misma cadencia (5 s) con la que se dibuja la propia, sin
 * simular un segundo mundo.
 */
export function interpolarCurva(curva: readonly number[], posicion: number): number {
  if (curva.length === 0) return 0;
  if (posicion <= 0) return curva[0];
  if (posicion >= curva.length - 1) return curva[curva.length - 1];
  const i0 = Math.floor(posicion);
  const i1 = i0 + 1;
  const frac = posicion - i0;
  return curva[i0] + (curva[i1] - curva[i0]) * frac;
}
