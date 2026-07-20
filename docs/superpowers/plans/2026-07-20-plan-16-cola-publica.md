# PANDEMIA — Plan 16: Cola pública de matchmaking ("buscar partida") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Depende de Plan 10 (ya desplegado en Render) — extiende `server/relay.ts`/`src/net/sala.ts`, no los reemplaza.

## Meta

El Plan 10 dejó explícitamente fuera de alcance la cola pública ("Task 5,
opcional, fuera de alcance salvo pedido explícito") — este plan la
implementa. Objetivo: un botón "BUSCAR PARTIDA" que empareja al jugador
con el primer desconocido disponible, sin código de sala.

**Hallazgo clave (investigación de código real):** el relay YA tiene toda
la estructura necesaria — `salas: Map<string, WebSocket[]>` (código →
hasta 2 sockets) es exactamente el modelo de "una cola de 1 esperando +
alguien se une". La cola pública es, en esencia, "crear una sala con un
código SINTÉTICO y unir automáticamente al primer desconocido que
llegue" — reusa el 100% de la lógica de emparejamiento/generación de
`seed`/reenvío de muestras ya existente, sin duplicar nada.

**Refactor necesario primero:** `salaActual` hoy es una variable de
CLOSURE local (`let salaActual` dentro de `wss.on('connection', ws =>
{...})`), fijada solo dentro del propio handler de mensajes de CADA
socket. Para la cola pública, el emparejamiento de dos desconocidos lo
dispara el mensaje `'buscar'` de UNO de los dos sockets — pero el OTRO
socket (ya esperando en la cola desde antes) necesita que se le asigne
su sala desde AFUERA de su propio handler, algo que un `let` de closure
no permite. Se reemplaza por un `Map<WebSocket, string>` a nivel de
módulo (`salaDeSocket`), leído/escrito desde cualquier punto del archivo.

Esto es 100% `server/`/`src/net/`/`src/ui/` — CERO cambios a `src/sim/`.

## Task 1: Cola pública en el relay + refactor de `salaActual`

**Files:**
- Modify: `server/relay.ts`
- Modify: `src/net/sala.ts` (`ConexionSala.buscarPartida`)

**Interfaces:**

```ts
// server/relay.ts — nuevo tipo de mensaje cliente:
type MsgCliente =
  | { tipo: 'crear' }
  | { tipo: 'unirse'; sala: string }
  | { tipo: 'buscar' } // NUEVO
  | { tipo: 'muestra'; vivosPct: number; indiceCiudad: number; brecha: boolean };

/** Reemplaza el `let salaActual` de closure: mapea CUALQUIER socket a su sala actual, mutable desde cualquier punto del módulo (necesario para emparejar dos sockets de la cola pública, uno de los cuales no está procesando un mensaje propio en ese instante). */
const salaDeSocket = new Map<WebSocket, string>();
/** Sockets esperando pareja por cola pública, FIFO. */
const colaPublica: WebSocket[] = [];

function emparejar(a: WebSocket, b: WebSocket): void {
  let sala = generarCodigoSala();
  while (salas.has(sala)) sala = generarCodigoSala();
  salas.set(sala, [a, b]);
  salaDeSocket.set(a, sala);
  salaDeSocket.set(b, sala);
  const seed = randomUUID();
  enviar(a, { tipo: 'emparejado', seed });
  enviar(b, { tipo: 'emparejado', seed });
}
```

Dentro de `wss.on('connection', ws => { ws.on('message', ...) })`:
- Reemplazar TODO uso de la variable local `salaActual` por
  `salaDeSocket.get(ws)`/`salaDeSocket.set(ws, sala)` — en las ramas
  `'crear'` y `'unirse'` existentes (adaptarlas mínimamente, mismo
  comportamiento, solo cambia DÓNDE vive el estado).
- Nueva rama:
  ```ts
  if (msg.tipo === 'buscar') {
    const otro = colaPublica.shift();
    if (otro) emparejar(otro, ws);
    else colaPublica.push(ws);
    return;
  }
  ```
- `ws.on('close', ...)`: además de la limpieza de sala existente, quitar
  el socket de `colaPublica` si estaba ahí esperando (`indexOf`+`splice`)
  y `salaDeSocket.delete(ws)` al final.

`src/net/sala.ts` — nuevo método en `ConexionSala`, mismo patrón que
`unirse()` (espera `'emparejado'`, sin código de sala):
```ts
export interface ConexionSala {
  crear(): Promise<string>;
  unirse(sala: string): Promise<string>;
  buscarPartida(): Promise<string>; // NUEVO
  enviarMuestra(m: Muestra): void;
  onMuestraRival(cb: (m: Muestra) => void): void;
  onDesconexion(cb: () => void): void;
  onEmparejado(cb: (seed: string) => void): void;
  cerrar?(): void;
}
```
Implementación: idéntica a `unirse()` pero enviando `{ tipo: 'buscar' }`
y esperando el mismo mensaje `'emparejado'` de vuelta.

**Protección básica contra abuso** (mencionado en el Plan 10 original,
implementarlo aquí ya que ahora sí aplica — cualquiera puede spamear
"buscar" repetidamente, a diferencia del código de sala que requiere
coordinarse con otra persona): cooldown simple por IP.
```ts
const ultimaBusquedaPorIp = new Map<string, number>();
const COOLDOWN_BUSQUEDA_MS = 3000;

// dentro de wss.on('connection', (ws, req) => { ... }) — 'req' ya lo da 'ws' en el callback de conexión
const ip = req.socket.remoteAddress ?? 'desconocida';
// en la rama 'buscar':
const ahora = Date.now();
const ultima = ultimaBusquedaPorIp.get(ip) ?? 0;
if (ahora - ultima < COOLDOWN_BUSQUEDA_MS) return; // ignorar, sin mensaje de error (simplicidad)
ultimaBusquedaPorIp.set(ip, ahora);
```

Sin tests automatizados (el relay no tiene infraestructura de tests hoy
— mismo criterio que Plan 10 Task 1, verificación manual/en navegador).

- [x] **Step 1: Implementar.**
- [x] **Step 2:** `npx tsc --noEmit` (raíz y `server/tsconfig.json`) limpios.
- [x] **Step 3: Verificación local** — arrancar el relay local
  (`npm run relay`) y probar con DOS conexiones reales (dos pestañas, o
  un script de prueba con dos clientes `ws`): la primera que pulsa
  "buscar" queda esperando; la segunda que pulsa "buscar" empareja con
  la primera, ambas reciben la MISMA seed. Confirmar que cerrar una
  mientras espera en cola no dispara nada raro en el servidor (sale de
  `colaPublica` limpio). Confirmar que dos "buscar" seguidos de la MISMA
  IP en menos de 3s se ignoran (revisar logs del relay).
- [x] **Step 4: Commit** — `feat: cola publica de matchmaking en el relay (Plan 16)`

---

## Task 2: UI "BUSCAR PARTIDA" y enganche

**Files:**
- Modify: `src/ui/sala.ts`

**Interfaces:** Nuevo botón en `vistaMenu()` junto a "CREAR SALA"/"UNIRSE",
mismo patrón de estados (`vistaCargando('Buscando un rival…')` mientras
espera, con botón CANCELAR que llama `conexion.cerrar?()` y vuelve al
menú — reusar `conectarCancelar` ya existente).

```ts
const flujoBuscar = (): void => {
  const conexion = crearConexionSala();
  el.innerHTML = vistaCargando('Buscando un rival…');
  conectarCancelar(conexion);
  conexion
    .buscarPartida()
    .then((seed) => terminar({ conexion, seed }))
    .catch(() => mostrarMenu('No se pudo buscar partida. ¿Está corriendo el relay?'));
};
```

- [x] **Step 1: Implementar.**
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — relay local + build de
  producción (`npm run build` + `npm run preview`, ver lección de
  CLAUDE.md: `window.pandemia` es DEV-only), dos pestañas: "BUSCAR
  PARTIDA" en ambas, confirmar que se emparejan con la MISMA semilla y
  que el marcador TÚ/RIVAL funciona igual que con código de sala.
  CANCELAR antes de emparejar debe volver al menú limpio. Sin errores de
  consola.
- [x] **Step 4: Commit** — `feat: boton buscar partida en la pantalla de sala (Plan 16)`

---

## Task 3: Cierre

- [x] **Step 1:** `npm test` completo (no debería tocar `src/sim/`) y
  `npx tsc --noEmit` limpios.
- [x] **Step 2: Cierre** — actualizar
  `docs/superpowers/specs/2026-07-05-pandemia-design.md` (matchmaking en
  vivo: cola pública pasa a ✅), checkboxes marcados, commit
  `chore: cola publica verificada (Plan 16 completo)`, push. Recordar
  que el relay YA está desplegado en Render (Plan 10) — este cambio se
  despliega solo (Render redeploya automáticamente al hacer push a la
  rama conectada), no hace falta repetir el proceso de conectar cuenta.
