# PANDEMIA — Plan 17: Anti-trampas (validar desafíos en servidor) — Implementation Plan

> **For agentic workers:** Tiene una decisión de diseño real pendiente (ver
> "Decisiones pendientes") — Task 1 es segura de implementar sin resolverla
> (puro registro de datos, cero comportamiento nuevo visible); las Tasks
> 2-4 sí la asumen, confirmarla con Johan antes de esas tasks si no quedó
> resuelta ya en la conversación que originó este plan.

## Meta

Hoy, un `?reto=<codigo>` (Plan 4 Task 7) codifica `{ seed, curva, indice,
nombre? }` en base64url — el jugador que genera el link puede editarlo a
mano y afirmar cualquier resultado falso, ya que nada lo verifica.

**Por qué es verificable en principio:** `src/sim/` es 100% puro (sin
`document`/`window`/`localStorage`/`three` — confirmado por grep), así
que una partida completa puede re-simularse EXACTAMENTE bajo Node, sin
navegador, dado (a) la semilla y (b) el LOG COMPLETO de órdenes del
jugador con su tick — hoy ese log NO EXISTE (`World.encolarOrden` solo
hace `this.colaOrdenes.push(o)` y el tick las consume y las BORRA sin
persistir). Sin ese log, no hay nada que reproducir del lado servidor.

**Decisión de diseño clave (a confirmar):** ¿el link de desafío debe
seguir funcionando 100% offline (valor central de Fase 1, "sin
servidor"), con la verificación como un chequeo OPCIONAL y best-effort
que se intenta al abrir el link (si el relay de Plan 10 está disponible),
o vale la pena que GENERAR un desafío requiera un round-trip al servidor
desde el vamos? **Recomendación de este plan: la primera opción** — el
link NO cambia de formato (sigue siendo self-contained, comparable sin
servidor); el log de órdenes se manda aparte al servidor al compartir
(si hay conexión), y la verificación es una llamada HTTP opcional al
ABRIR un `?reto=`, mostrando un sello "✅ verificado" o "sin verificar"
sin bloquear nunca el juego. Esto preserva "funciona sin servidor" como
comportamiento por defecto y agrega valor incremental para quien quiera
confiar en el sello.

## Task 1: Registrar el log de órdenes de la partida propia

**Files:**
- Modify: `src/sim/world.ts` (`World.encolarOrden`, nuevo `ordenLog`)
- Test: `tests/world.test.ts` (o el archivo que ya cubra `encolarOrden`, verificar cuál es)

**Interfaces:** `encolarOrden` YA es el único punto de entrada de
input del jugador (regla sagrada del proyecto) — el log se agrega ahí
mismo, sin tocar ningún llamador:

```ts
// World
readonly ordenLog: ReadonlyArray<{ tick: number; orden: OrdenJugador }> = [];
private readonly _ordenLog: { tick: number; orden: OrdenJugador }[] = [];

encolarOrden(o: OrdenJugador): void {
  this._ordenLog.push({ tick: this.tickCount, orden: o });
  this.colaOrdenes.push(o);
}
```
(Usar el patrón `readonly X; private readonly _X` ya establecido en el
proyecto si existe — revisar cómo se exponen otros arrays de solo-lectura
de `World`, p. ej. `hitos`/`ruidos`, y seguir EXACTAMENTE ese estilo en
vez de inventar uno nuevo.)

Esto es puramente aditivo — un array que crece, sin afectar RNG ni
determinismo (verificarlo explícitamente con `tests/determinism.test.ts`,
que no debería cambiar de resultado).

- [x] **Step 1: Test que falla** — en el archivo de tests que ya cubra
  `World`/`encolarOrden`, confirmar que `ordenLog` acumula `{tick, orden}`
  en el orden correcto tras varias llamadas a `encolarOrden` intercaladas
  con `world.tick()`.
- [x] **Step 2-3:** TDD estándar; `npm test` completo (INCLUYE
  `tests/determinism.test.ts`, es el test más importante del proyecto —
  no debería moverse ni un bit) y `npx tsc --noEmit` en verde.
- [x] **Step 4: Commit** — `feat: registrar el log de ordenes del jugador para verificacion futura (Plan 17)`

---

## Task 2: Endpoint de verificación (replay server-side)

**Files:**
- Create: `server/verificar.ts` (o extender `server/relay.ts` si el
  implementador prefiere un solo proceso — decidir según cuán grande
  quede; probablemente más limpio como archivo/servidor HTTP aparte, ya
  que esto es request/response, no WebSocket)

**Interfaces:** Servidor HTTP mínimo (Node `http` nativo, sin frameworks
— coherente con el resto de `server/`, que ya evita dependencias
innecesarias) con una única ruta `POST /verificar`:

```ts
interface PeticionVerificar {
  seed: string;
  ordenLog: { tick: number; orden: OrdenJugador }[];
  duracionTicks: number; // hasta qué tick replayar (fin de la partida real)
  curvaAfirmada: number[];
  indiceAfirmado: number;
}
```

Lógica: `const w = new World(seed); let i = 0; for (let t = 0; t <
duracionTicks; t++) { while (i < ordenLog.length && ordenLog[i].tick ===
t) { w.encolarOrden(ordenLog[i].orden); i++; } w.tick(); }` — luego
comparar `w.indiceCiudad` (exacto) contra `indiceAfirmado`, y muestrear
`w.vivosPct` en los mismos puntos que `curvaAfirmada` (misma cadencia
que usa `Rival`/`desafio.ts` hoy) con una tolerancia pequeña (float).
Responder `{ valido: boolean }`.

Import: `server/` puede importar directamente desde `src/sim/` (es TS
puro, sin DOM) — confirmar que el `tsconfig` de `server/` (ya existe,
Plan 10) resuelve los paths de `../src/sim/...` correctamente, ajustar
si hace falta.

- [x] **Step 1: Implementar.**
- [x] **Step 2:** `npx tsc --noEmit -p server/tsconfig.json` limpio.
- [x] **Step 3: Verificación local** — con el relay corriendo local,
  jugar una partida real corta (o simular una vía script), capturar su
  `ordenLog` real (exponerlo temporalmente en el gancho de dev si hace
  falta), mandarlo a `/verificar` y confirmar `{valido: true}`; mandar
  un `indiceAfirmado` alterado a mano y confirmar `{valido: false}`.
- [x] **Step 4: Commit** — `feat: endpoint de verificacion de desafios en el servidor (Plan 17)`

---

## Task 3: Enviar el log al compartir, verificar al abrir

**Files:**
- Modify: `src/ui/resultado.ts` (`copiarDesafio`)
- Modify: `src/game/main.ts` (al detectar `?reto=`, intentar verificar)

**Interfaces:** Al compartir (`copiarDesafio`), si hay conexión al
servidor (mismo `URL_RELAY`/host de Plan 10, convertido a `https://` para
esta llamada HTTP), mandar `{seed, ordenLog: world.ordenLog, ...}` a
`/verificar` en segundo plano (no bloquear el copiado del link — el link
se genera y copia YA, la llamada al servidor es solo para que quede un
registro de que ESTA curva/índice específicos fueron confirmados por un
replay real; si falla o no hay servidor, el link se comparte igual, sin
sello). Al ABRIR un `?reto=` (`main.ts`), intentar la misma verificación
contra el servidor (con timeout corto, p. ej. 3s) y mostrar un indicador
simple en el HUD (`#banner-reto` ya existe — agregar el sello ahí mismo,
"✅" o nada, sin bloquear el arranque del juego si el servidor no
responde).

- [x] **Step 1: Implementar.**
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — compartir un desafío real
  con el relay corriendo, abrir el link resultante y confirmar el sello
  de verificado; abrir un `?reto=` con el servidor APAGADO y confirmar
  que el juego arranca igual, sin sello, sin error visible al jugador.
- [x] **Step 4: Commit** — `feat: sello de verificacion en desafios compartidos (Plan 17)`

---

## Task 4: Cierre

- [x] **Step 1:** `npm test` completo (`tests/determinism.test.ts` en
  verde es obligatorio) y `npx tsc --noEmit` limpios.
- [x] **Step 2: Cierre** — actualizar el design doc (anti-trampas pasa a
  ✅, documentar la decisión de "verificación opcional, link sigue
  funcionando offline"), checkboxes marcados, commit
  `chore: anti-trampas verificado (Plan 17 completo)`, push + redeploy
  del servicio en Render (automático al hacer push, Plan 10).
