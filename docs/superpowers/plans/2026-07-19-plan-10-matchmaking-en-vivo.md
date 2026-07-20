# PANDEMIA — Plan 10: Fase 2 — Matchmaking en vivo (`src/net/`) — Implementation Plan

> **For agentic workers:** Este plan tiene más incertidumbre de diseño que
> los anteriores (primera vez que el proyecto toca red/backend) — la
> sección "Decisiones pendientes" debe resolverse con Johan ANTES de
> empezar Task 2 (Task 1 es investigación/spike, seguro de hacer sin
> decidir hosting todavía).

## Meta

El diseño (`docs/superpowers/specs/2026-07-05-pandemia-design.md §5.3`)
prevé matchmaking en vivo estilo Clash Royale: buscar partida, jugar con
un amigo por código de sala, y el link asíncrono (`?reto=`, YA implementado
en Plan 4 Task 7). Hoy el juego es 100% cliente — cero servidor — y el
"rival" (`src/game/rival.ts`, clase `Rival`) tiene ya DOS modos: fantasma
en vivo (un `World` con la misma semilla, tickeado localmente sin
intervención) y estático (curva congelada de un `Desafio` decodificado del
link). Ningún consumidor externo (`hud.ts`, `resultado.ts`, grep
confirmado) lee `rival.world` directamente — solo cuatro miembros:
`tick()`, `vivosPct`, `curva`, `avisosBrecha`, `indiceCiudad`.

Esa interfaz angosta es la puerta de entrada ideal para un **tercer modo,
en vivo real**: cada jugador simula su PROPIA ciudad localmente (como
siempre — el juego sigue siendo 100% determinista y cliente-autoritativo
para su propia partida), y un relay ligerísimo se limita a REENVIAR, cada
~5 s, el mismo `{ vivosPct, indiceCiudad, brecha nueva }` que `Rival` ya
calcula para sí mismo — NO hace falta simular la ciudad del oponente ni
reenviar órdenes de jugador, así que el servidor no necesita saber NADA
de las reglas del juego (cero lógica de negocio en el backend, superficie
de ataque mínima, sin riesgo de desincronizar dos simulaciones).

## Decisiones pendientes (resolver con Johan antes de Task 2)

1. **Hosting del relay**: necesita un proceso Node de larga duración
   (WebSocket), no puede vivir en el hosting estático actual (Fase 1 es
   "sin servidor"). Opciones típicas de bajo costo/mantenimiento: Render,
   Railway, Fly.io (todas tienen capa gratuita/muy barata para un relay
   sin estado). Esta decisión NO bloquea Task 1 (desarrollo/pruebas 100%
   locales con dos pestañas), solo bloquea el despliegue real (Task 4).
2. **Alcance de "buscar partida en vivo" (matchmaking real, cola pública)
   vs. solo "jugar con amigo" (código de sala)**: el código de sala es
   mucho más simple (sin cola, sin emparejar desconocidos) y cubre ya el
   caso viral principal del juego (retar a un amigo). Este plan asume
   SOLO código de sala para Task 1-4; la cola pública queda fuera de
   alcance (Task 5, opcional, al final).
3. **Anti-trampas** (§5.3 del diseño): re-simular en servidor para validar
   un marcador es una feature de integridad, no de gameplay — este plan
   NO la implementa (el relay no simula nada); queda anotada como trabajo
   futuro si el juego gana tracción y vale la pena defenderse de marcadores
   falsificados.

## Task 1: Spike — relay local de dos pestañas (sin desplegar)

**Files:**
- Create: `server/relay.ts` (o `.js` — Node standalone, FUERA de `src/`,
  no pasa por `tsc` del cliente ni por Vite; ejecutar con `tsx`/`node
  --loader` o compilar aparte — decidir al implementar según lo que ya
  haya en el repo)
- Create: `src/net/sala.ts` (cliente: conectar, crear/unirse a una sala por código)

**Interfaces:** Objetivo de esta task: probar el concepto ENTERO en dos
pestañas del navegador contra un relay corriendo en `localhost`, sin tocar
hosting ni la UI real todavía. Protocolo mínimo (JSON sobre WebSocket):

```ts
// Cliente → relay
type MsgCliente =
  | { tipo: 'crear' }                                    // pide una sala nueva, recibe el código
  | { tipo: 'unirse'; sala: string }                      // se une a una sala existente
  | { tipo: 'muestra'; vivosPct: number; indiceCiudad: number; brecha: boolean };

// Relay → cliente
type MsgServidor =
  | { tipo: 'sala-creada'; sala: string }
  | { tipo: 'emparejado'; seed: string }                  // el relay genera la semilla compartida y se la manda a AMBOS al emparejar
  | { tipo: 'rival-desconectado' }
  | { tipo: 'muestra-rival'; vivosPct: number; indiceCiudad: number; brecha: boolean };
```

El relay (`server/relay.ts`) es deliberadamente TONTO: un `Map<string,
WebSocket[]>` de sala → hasta 2 sockets; al llegar el segundo socket a una
sala, genera una `seed` (string aleatoria del lado servidor — aquí SÍ es
válido `Math.random`/`crypto.randomUUID`, es Node fuera de `src/sim/`, la
regla de determinismo es solo para la simulación del cliente) y la manda a
ambos con `'emparejado'`; después, cualquier `'muestra'` que reciba de un
socket la reenvía TAL CUAL al otro socket de la misma sala como
`'muestra-rival'`. Sin base de datos, sin persistencia — si el proceso se
reinicia, las salas activas se pierden (aceptable para un relay).

`src/net/sala.ts` — wrapper delgado sobre `WebSocket` nativo del navegador,
con reconexión simple si hace falta; expone algo como:
```ts
export interface ConexionSala {
  crear(): Promise<string>; // resuelve con el código de sala
  unirse(sala: string): Promise<string>; // resuelve con la seed compartida
  enviarMuestra(m: { vivosPct: number; indiceCiudad: number; brecha: boolean }): void;
  onMuestraRival(cb: (m: { vivosPct: number; indiceCiudad: number; brecha: boolean }) => void): void;
  onDesconexion(cb: () => void): void;
}
```

- [x] **Step 1: Implementar** relay + cliente mínimo (sin integrar a
  `main.ts` todavía — puede probarse con un HTML/script de prueba suelto
  o la consola del navegador en dos pestañas).
- [x] **Step 2:** Probar manualmente: abrir dos pestañas, una `crear()`,
  copiar el código a la otra, `unirse(codigo)`, confirmar que ambas
  reciben la MISMA `seed`; desde una pestaña `enviarMuestra(...)` y
  confirmar que la otra recibe `'muestra-rival'` con los mismos datos.
  Cerrar una pestaña y confirmar que la otra recibe `'rival-desconectado'`.
- [x] **Step 3: Commit** — `feat: spike de relay de matchmaking en vivo (Plan 10, sin desplegar)`

---

## Task 2: `RivalEnVivo` — tercer modo de `Rival`, misma interfaz pública

**Files:**
- Modify: `src/game/rival.ts` (o extraer a `src/net/rivalEnVivo.ts` si
  `Rival` empieza a sentirse sobrecargada con 3 modos — decidir al
  implementar leyendo cómo queda el archivo)
- Test: si se extrae a una clase separada con lógica propia
  no trivial, agregar tests en `tests/` (esta clase vive en `src/game/` o
  `src/net/`, NO en `src/sim/` — no aplica TDD obligatorio del proyecto,
  pero un test de "recibe una muestra por red y expone vivosPct/curva
  correctamente" es barato y vale la pena).

**Interfaces:** Nueva clase (o modo) que implementa el MISMO contrato que
ya consumen `hud.ts`/`resultado.ts` (`tick()`, `vivosPct`, `curva`,
`avisosBrecha`, `indiceCiudad`), pero en vez de tickear un `World` local o
leer un `Desafio` congelado, acumula `curva`/`avisosBrecha` a partir de los
mensajes `'muestra-rival'` que llegan de `ConexionSala` (Task 1). `tick()`
en este modo no hace nada (o nada más que decidir si ya pasó el tiempo de
declarar al rival desconectado/perdido) — las muestras llegan async por
WebSocket, no por tick de sim.

Mismo patrón que `Partida`/`Rival` ya usan para leer el propio mundo: en el
loop de `main.ts`, donde hoy se llama `rival.tick()` cada tick de sim,
agregar el envío de la muestra PROPIA cada `INTERVALO_MUESTRA` (mismo
intervalo que `Rival` ya usa para muestrear `vivosPct` del jugador) vía
`conexionSala.enviarMuestra(...)` — reusar el mismo cálculo de
`brechasActuales > brechasPrevias` que `Rival.tick()` ya hace para el modo
fantasma, no duplicar la lógica sin necesidad (extraer a una función
compartida si aplica).

- [x] **Step 1: Test** (si se extrae a clase propia) que falla, luego
  implementación.
- [x] **Step 2-3:** `npx tsc --noEmit` y `npm test` en verde; confirmar
  que NADA de esto toca `src/sim/` (`git diff --stat -- src/sim/` vacío).
- [x] **Step 4: Commit** — `feat: RivalEnVivo alimentado por muestras de red (Plan 10)`

---

## Task 3: UI de sala (crear/unirse) y enganche en `main.ts`

**Files:**
- Create: `src/ui/sala.ts` (pantalla mínima: botón "Jugar con un amigo" →
  genera código + lo muestra con copiar-al-portapapeles — REUSAR el
  fallback de `execCommand('copy')` + campo visible ya implementado para
  el link de desafío en Plan 4 Task 7, mismo patrón, no reinventar; y un
  campo para pegar/escribir un código y unirse)
- Modify: `src/game/main.ts` (elegir `Rival` fantasma vs `RivalEnVivo`
  según si el jugador entró por la pantalla de sala)

**Interfaces:** Punto de entrada nuevo, análogo a `?reto=` (Plan 4 Task 7):
un parámetro de URL o un menú previo a `iniciar()` (revisar cómo arranca
`main.ts` hoy — si `iniciar()` ya es async y espera assets, la pantalla de
sala puede vivir ANTES de esa llamada, bloqueando hasta que el jugador
cree/una una sala o elija jugar solo/con el fantasma de siempre).

- [x] **Step 1: Implementar.**
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — con el relay de Task 1
  corriendo en local, dos pestañas: crear sala en una, unirse en la otra,
  confirmar que ambas arrancan con la MISMA semilla y que el marcador
  ("TÚ N · RIVAL M") se actualiza en vivo en ambas conforme cada una juega
  su propia ciudad. Sin errores de consola.
- [x] **Step 4: Commit** — `feat: pantalla de sala y enganche de matchmaking en vivo (Plan 10)`

---

## Task 4: Desplegar el relay y apuntar el cliente

**Files:**
- Create: config de despliegue del relay (según la decisión pendiente #1)
- Modify: `src/net/sala.ts` (URL del relay: local en dev, la desplegada en producción — `import.meta.env`)

- [ ] **Step 1:** Desplegar `server/relay.ts` en el hosting decidido.
- [ ] **Step 2:** Confirmar en producción (build real de Vite, no `npm run dev`)
  que dos navegadores distintos (no dos pestañas del mismo `localhost`) pueden
  emparejarse y jugar en vivo.
- [ ] **Step 3: Cierre** — actualizar `docs/superpowers/specs/2026-07-05-pandemia-design.md`
  marcando "Fase 2 — matchmaking en vivo (código de sala)" como ✅, dejar
  "cola pública"/"anti-trampas" anotados como pendientes reales, lecciones
  en CLAUDE.md, commit `chore: matchmaking en vivo desplegado (Plan 10 completo)`, push.

---

## Task 5 (opcional, fuera de alcance salvo pedido explícito): cola pública

Emparejar DESCONOCIDOS sin código de sala ("Buscar partida", como Clash
Royale) — necesita el relay guardando una cola de sockets esperando y
emparejando por orden de llegada, más alguna protección básica contra abuso
(rate-limit de conexiones). No diseñado en detalle aquí a propósito: solo
vale la pena si el código de sala (Tasks 1-4) ya demuestra que la gente
juega partidas en vivo de verdad.
