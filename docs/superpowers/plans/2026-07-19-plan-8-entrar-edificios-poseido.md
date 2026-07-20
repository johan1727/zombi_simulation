# PANDEMIA — Plan 8: Entrar a edificios poseído — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [x]`) para seguimiento.

## Meta

Bug real de juego encontrado jugando, dejado explícitamente fuera de
alcance por el Plan 7: al poseer a un agente, es el único "ciudadano" del
juego que NUNCA puede refugiarse en un edificio — todos los civiles sí
pueden. Investigación previa (ver `.superpowers/sdd/progress.md` y el
propio código) estableció los hechos clave:

- `world.tick()` (`src/sim/world.ts`) ya despacha `updateInterior` para
  CUALQUIER ciudadano con `dentroDe >= 0`, sin distinguir `esAgente` — el
  sistema de interiores ya es agnóstico al tipo de ciudadano.
- `updateInterior` (`src/sim/interior.ts`) mueve SIEMPRE por IA autónoma
  (`c.dirX/dirZ` calculado internamente); nunca lee `c.ordenX/ordenZ`
  (los campos que ya llenan las órdenes `'control'` de la posesión).
- `intentarRefugio` (`src/sim/refugio.ts`) es el ÚNICO punto de entrada a
  un edificio hoy, y solo se llama desde la rama de pánico de civiles en
  `panico.ts` — nunca desde `updateAgente`.
- `moverInterior` YA maneja la salida por la puerta de forma genérica
  (detecta cuando el movimiento cruza el hueco de la puerta en planta baja
  y resetea `dentroDe = -1`) — no hace falta tocar esa lógica para salir.
- `JugablesView` (vista recortada de paredes/techo) decide qué ocultar
  según la proximidad de `rig.focusPoint` a cada edificio jugable, y
  `CameraRig.actualizarTercera` YA actualiza `this.focus` a la posición del
  agente poseído cada frame — la vista recortada debería funcionar sola en
  cuanto el agente entre, sin tocar ese archivo.
- Gap real de render: `actualizarTercera` posiciona la cámara a una altura
  FIJA (`TERCERA_ARRIBA` sobre y=0), sin sumar `piso * INTERIOR.alturaPiso`
  — si el agente sube de piso, la cámara se queda a nivel de calle mientras
  el personaje (que sí sube, ver `personajesView.ts:183`,
  `baseY = 0.85 + c.piso * INTERIOR.alturaPiso`) se renderiza más arriba.

Este plan da al agente poseído: (1) un punto de entrada propio (no ligado
al pánico), (2) movimiento WASD dentro del edificio reusando la colisión
existente, (3) control manual de piso (subir/bajar escalera con teclas
dedicadas, ya que el jugador decide en vez de "instinto de esconderse
arriba" como los civiles), y (4) la cámara ajustada a la altura del piso.

## Task 1: Entrar a un edificio poseído

**Files:**
- Modify: `src/sim/refugio.ts` (extraer el cuerpo compartido, nueva función `intentarEntradaAgente`)
- Modify: `src/sim/types.ts` (`Citizen.ordenControl`)
- Modify: `src/sim/agentes.ts` (`crearAgente`, `aplicarOrden`, `updateAgente`)
- Modify: `src/sim/citizens.ts` (literal `Citizen` del spawn civil)
- Test: `tests/refugio.test.ts`, `tests/agentes.test.ts`

**Interfaces:** `intentarRefugio` hoy fija `pisoObjetivo = 1` (instinto de
esconderse arriba) — para un agente bajo control del jugador eso no tiene
sentido, el jugador decide el piso (Task 2). Extraer el cuerpo compartido
a una función interna con el piso objetivo como parámetro:

```ts
// src/sim/refugio.ts
function entrarPorPuerta(c: Citizen, world: World, pisoObjetivo: number): void {
  const bx = Math.floor(c.x / CITY_PERIOD);
  const bz = Math.floor(c.z / CITY_PERIOD);
  const candidatos: ReadonlyArray<readonly [number, number]> = [
    [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
  ];
  for (const [ix, iz] of candidatos) {
    if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
    const b = world.city.buildings[ix * CITY.blocksY + iz];
    if (b.kind !== 'jugable' || world.brecha[b.id]) continue;
    if (world.ocupantes[b.id] >= REFUGIO.capacidad) continue;
    const p = b.puerta!;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    if (Math.sqrt(dx * dx + dz * dz) <= REFUGIO.radioEntrar) {
      const [nx, nz] = NORMAL_INTERIOR[p.lado];
      c.dentroDe = b.id;
      c.piso = 0;
      c.pisoObjetivo = pisoObjetivo;
      c.escaleraTicks = 0;
      c.x = p.x + nx * 1.2;
      c.z = p.z + nz * 1.2;
      c.prevX = c.x;
      c.prevZ = c.z;
      world.ocupantes[b.id]++;
      return;
    }
  }
}

export function intentarRefugio(c: Citizen, world: World): void {
  entrarPorPuerta(c, world, 1); // instinto civil: subir a esconderse
}

/** Entrada deliberada de un agente bajo control del jugador: se queda en planta baja, el jugador decide el piso (Task 2). */
export function intentarEntradaAgente(c: Citizen, world: World): void {
  entrarPorPuerta(c, world, 0);
}
```

`types.ts` — `Citizen` suma un campo que recuerda si la ÚLTIMA orden
aplicada fue de tipo `'control'` (posesión WASD), para no disparar la
entrada automática cuando un agente NO poseído recibe una orden `'mover'`
del modo director (p. ej. el jugador manda a un policía a un punto que de
casualidad pasa cerca de una puerta — eso NO debe hacerlo entrar; solo la
posesión activa, gesto deliberado del jugador, debe poder entrar):

```ts
/** true si la última orden aplicada a este agente fue 'control' (posesión WASD). Nunca true para civiles. */
ordenControl: boolean;
```

`agentes.ts`:
- `crearAgente`: agrega `ordenControl: false` al literal (mismo vecindario que `corriendoOrden`).
- `citizens.ts`: agrega `ordenControl: false` al literal civil (campo sin uso real para ellos, obligatorio por la forma del tipo — mismo patrón ya usado para `corriendoOrden`).
- `aplicarOrden`, rama `'mover' | 'control'`:
  ```ts
  if (o.tipo === 'mover' || o.tipo === 'control') {
    a.ordenX = o.x;
    a.ordenZ = o.z;
    a.corriendoOrden = o.tipo === 'control' && !!o.veloz;
    a.ordenControl = o.tipo === 'control';
    return;
  }
  ```
- `updateAgente`: en la rama donde el agente tiene una orden activa y SE
  MUEVE (no en la rama "llegó, se limpia"), intentar la entrada justo antes
  de retornar — reusa el import ya existente de `intentarEntradaAgente`:
  ```ts
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
      if (c.ordenControl) intentarEntradaAgente(c, world);
      return;
    }
  }
  ```
  (Import: `import { intentarEntradaAgente } from './refugio';` — ojo,
  `refugio.ts` no importa nada de `agentes.ts`, sin ciclo.) El chequeo va
  DESPUÉS de mover (mismo orden que el patrón civil en `panico.ts`: primero
  `moveWithSlide`, luego `intentarRefugio`), así que la entrada se evalúa
  con la posición ya actualizada de este tick.

- [x] **Step 1: Test que falla** — añadir a `tests/refugio.test.ts` (reusar
  el helper `juntoAPuerta` ya existente) y a `tests/agentes.test.ts`:

```ts
// tests/refugio.test.ts — junto a los tests existentes
import { intentarEntradaAgente } from '../src/sim/refugio';

it('intentarEntradaAgente entra en planta baja (el jugador decide el piso, no instinto de esconderse)', () => {
  const w = new World('refugio-agente-1', 5);
  const c = w.citizens[0];
  const id = juntoAPuerta(w, c);
  intentarEntradaAgente(c, w);
  expect(c.dentroDe).toBe(id);
  expect(c.pisoObjetivo).toBe(0); // NO sube sola, a diferencia de intentarRefugio
});
```

```ts
// tests/agentes.test.ts — junto a los tests de sprint (Plan 7)
it('un agente poseido que camina hacia la puerta de un edificio jugable entra solo', () => {
  const w = new World('entrada-agente-1', 5);
  const a = w.agentes[0];
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  const fuera: ReadonlyArray<readonly [number, number]> = [[-3, 0], [0, -3], [3, 0], [0, 3]];
  a.x = p.x + fuera[p.lado][0];
  a.z = p.z + fuera[p.lado][1];
  a.prevX = a.x;
  a.prevZ = a.z;
  for (let t = 0; t < 60; t++) {
    w.encolarOrden({ agente: a.id, tipo: 'control', x: p.x, z: p.z });
    w.tick();
    if (a.dentroDe >= 0) break;
  }
  expect(a.dentroDe).toBe(b.id);
});

it('una orden "mover" (modo director) NUNCA hace entrar a un agente a un edificio, aunque pase cerca de la puerta', () => {
  const w = new World('entrada-agente-2', 5);
  const a = w.agentes[0];
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  const fuera: ReadonlyArray<readonly [number, number]> = [[-3, 0], [0, -3], [3, 0], [0, 3]];
  a.x = p.x + fuera[p.lado][0];
  a.z = p.z + fuera[p.lado][1];
  a.prevX = a.x;
  a.prevZ = a.z;
  for (let t = 0; t < 60; t++) {
    w.encolarOrden({ agente: a.id, tipo: 'mover', x: p.x, z: p.z });
    w.tick();
  }
  expect(a.dentroDe).toBe(-1);
});
```

(Ajustar el número de ticks/posición inicial si algún test tarda en
converger — la intención es: suficientemente cerca para que
`AGENTES.velocidad` cubra la distancia hasta `REFUGIO.radioEntrar` en el
número de ticks dado. Distancias con `sqrt(dx*dx+dz*dz)`, nunca
`Math.hypot`.)

- [x] **Step 2-4:** TDD estándar; `npx vitest run --exclude tests/balance.test.ts` y `npx tsc --noEmit` en verde; `tests/portabilidad.test.ts` sigue verde.
- [x] **Step 5: Commit** — `feat: un agente poseido puede entrar a edificios jugables caminando a la puerta (Plan 8)`

---

## Task 2: Movimiento y escaleras dentro del edificio bajo control del jugador

**Files:**
- Modify: `src/sim/interior.ts` (nueva función `updateInteriorAgente`, branch en `updateInterior`)
- Modify: `src/sim/types.ts` (`OrdenJugador.cambiarPiso`)
- Modify: `src/sim/agentes.ts` (`aplicarOrden` procesa `cambiarPiso`)
- Modify: `src/game/posesion.ts` (teclas E/Q)
- Test: `tests/interior.test.ts`

**Interfaces:** Hoy, dentro de un edificio, `updateInterior` mueve TODO
ciudadano por IA autónoma. Un agente poseído con `salud === 'sano'` debe,
en cambio, moverse según `c.ordenX/ordenZ` (las MISMAS órdenes `'control'`
que ya llegan vía `world.encolarOrden` — `aplicarOrden` las aplica siempre,
sin mirar `dentroDe`, así que los campos ya están poblados en vivo aunque
`updateAgente` no se ejecute mientras está dentro). Un agente caído o
zombificado DENTRO del edificio sigue el camino normal (civil/zombi) — solo
`salud === 'sano'` toma el control del jugador.

`interior.ts` — branch al inicio de `updateInterior`, justo después de
calcular `b` y ANTES del chequeo de zombi (el orden no importa entre estas
dos ramas porque un agente nunca es zombi mientras `esAgente` sigue true,
pero se pone la rama de agente primero por claridad):

```ts
export function updateInterior(c: Citizen, world: World): void {
  c.prevX = c.x;
  c.prevZ = c.z;
  const b = world.city.buildings[c.dentroDe];

  if (c.esAgente && c.salud === 'sano') {
    updateInteriorAgente(c, world, b);
    return;
  }
  if (c.salud === 'zombi') {
    updateInteriorZombi(c, world, b);
    return;
  }
  // ...resto sin cambios (rama civil)...
```

Nueva función, al final del archivo — reusa `moverInterior` (colisión +
salida automática por la puerta, ya genérica) y `avanzarEscalera` (cambio
de piso, ya genérico), replicando el patrón de avance-por-orden de
`updateAgente` pero con velocidad de interior más lenta (mismo valor que
usa el civil "escondido" al deambular, `0.9`, para que caminar dentro se
sienta consistente con lo que ya existe — con sprint disponible igual que
afuera):

```ts
function updateInteriorAgente(c: Citizen, world: World, b: Building): void {
  if (c.cdHabilidad > 0) c.cdHabilidad--;
  if (avanzarEscalera(b, c)) return; // subiendo/bajando: no se mueve en el plano
  if (Number.isNaN(c.ordenX)) return; // sin orden: quieto (el jugador soltó WASD)
  const dx = c.ordenX - c.x;
  const dz = c.ordenZ - c.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= AGENTES.llegadaOrden) {
    c.ordenX = NaN;
    c.ordenZ = NaN;
    return;
  }
  c.dirX = dx / d;
  c.dirZ = dz / d;
  const velocidad = 0.9 * (c.corriendoOrden ? AGENTES.factorSprint : 1);
  moverInterior(b, c, c.x + c.dirX * velocidad * DT, c.z + c.dirZ * velocidad * DT);
}
```

(Import nuevo en `interior.ts`: `AGENTES` desde `./config`, ya está en la
lista de imports del archivo — verificar; `Building` como tipo ya
importado.)

Control de piso: el jugador necesita una forma deliberada de subir/bajar
(a diferencia del civil, que sube "solo" por instinto de pánico). Dos
teclas dedicadas, `E` (subir) y `Q` (bajar), efectivas SOLO mientras
`pisoObjetivo === piso` actual (si ya hay un cambio en curso, ignorar
pulsaciones nuevas — evita carreras raras) y solo tienen efecto real una
vez el agente llega al cuadro de la escalera (`avanzarEscalera` ya exige
`enEscalera`, así que pulsar E lejos de la escalera simplemente deja
`pisoObjetivo` fijado hasta que el jugador camine hasta allí).

`types.ts`:
```ts
export interface OrdenJugador {
  agente: number;
  tipo: 'mover' | 'habilidad' | 'control';
  x: number;
  z: number;
  veloz?: boolean;
  /** Solo tipo 'control', solo dentro de un edificio: +1 subir un piso, -1 bajar. */
  cambiarPiso?: 1 | -1;
}
```

`agentes.ts`, `aplicarOrden` — extender la rama `'mover' | 'control'`:
```ts
if (o.tipo === 'mover' || o.tipo === 'control') {
  a.ordenX = o.x;
  a.ordenZ = o.z;
  a.corriendoOrden = o.tipo === 'control' && !!o.veloz;
  a.ordenControl = o.tipo === 'control';
  if (o.tipo === 'control' && o.cambiarPiso && a.dentroDe >= 0 && a.pisoObjetivo === a.piso) {
    const objetivo = a.piso + o.cambiarPiso;
    if (objetivo >= 0 && objetivo <= INTERIOR.azotea) a.pisoObjetivo = objetivo;
  }
  return;
}
```
(`INTERIOR` ya importado en `agentes.ts`? Verificar — si no, agregarlo al
import existente de `./config`.)

`src/game/posesion.ts` — capturar E/Q junto a Shift, y encolar
`cambiarPiso` en `alTick()` (una pulsación = un intento; no hace falta
`Set` de estado sostenido como WASD, un flag momentáneo por tick basta,
mismo patrón que el click de habilidad pero vía teclado):
```ts
private cambiarPisoPendiente: 1 | -1 | 0 = 0;
// en el listener keydown existente:
if (this.activo && k === 'e') this.cambiarPisoPendiente = 1;
if (this.activo && k === 'q') this.cambiarPisoPendiente = -1;
```
`alTick()` — encolar el flag y limpiarlo inmediatamente después (se
consume en el MISMO tick en que se detectó, sin quedar pegado):
```ts
alTick(): void {
  if (!this.activo) return;
  const a = this.world.citizens[this.idAgente];
  if (!a || a.salud !== 'sano') { /* ...sin cambios... */ }
  const dir = this.direccionMundo();
  const piso = this.cambiarPisoPendiente;
  this.cambiarPisoPendiente = 0;
  if (!dir && !piso) return; // sin teclas de movimiento NI de piso: no se encola nada
  this.world.encolarOrden({
    agente: this.idAgente,
    tipo: 'control',
    x: dir ? a.x + dir.x * PASO : a.x,
    z: dir ? a.z + dir.z * PASO : a.z,
    veloz: this.shiftPresionado,
    ...(piso ? { cambiarPiso: piso } : {}),
  });
}
```
(Nota: si solo se pulsa E/Q sin WASD, `dir` es `null` — la orden se encola
igual con `x/z` = posición actual del agente, o sea "no te muevas, pero
procesa el cambio de piso"; `updateInteriorAgente` ve `ordenX === a.x`,
`d` ≈ 0 ≤ `AGENTES.llegadaOrden`, limpia la orden sin moverse — correcto.)
Resetear `cambiarPisoPendiente = 0` también en `activar()`/`desactivar()`/
`blur` (mismo patrón que `teclas.clear()`/`shiftPresionado`).

- [x] **Step 1: Test que falla** — añadir a `tests/interior.test.ts` (leer
  el archivo primero para reusar sus helpers de posicionamiento dentro de
  un edificio jugable, si ya existen; si no, construir uno análogo a
  `juntoAPuerta` de `refugio.test.ts` pero para dejar al ciudadano YA
  `dentroDe` un edificio en un piso dado):

```ts
it('un agente sano dentro de un edificio se mueve por su orden "control", no por IA autonoma', () => {
  const w = new World('interior-agente-1', 5);
  const a = w.agentes[0];
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  a.dentroDe = b.id;
  a.piso = 0;
  a.pisoObjetivo = 0;
  a.x = b.x + b.width / 2;
  a.z = b.z + b.depth / 2;
  a.prevX = a.x;
  a.prevZ = a.z;
  const destinoX = a.x + 2;
  for (let t = 0; t < 20; t++) {
    w.encolarOrden({ agente: a.id, tipo: 'control', x: destinoX, z: a.z });
    w.tick();
  }
  expect(a.x).toBeGreaterThan(b.x + b.width / 2); // avanzó hacia el destino, no quedó quieto
});

it('cambiarPiso sube al agente por la escalera tras escaleraTicks parado ahi', () => {
  const w = new World('interior-agente-2', 5);
  const a = w.agentes[0];
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const e = b.escalera!;
  a.dentroDe = b.id;
  a.piso = 0;
  a.pisoObjetivo = 0;
  a.x = e.x + e.width / 2;
  a.z = e.z + e.depth / 2;
  a.prevX = a.x;
  a.prevZ = a.z;
  w.encolarOrden({ agente: a.id, tipo: 'control', x: a.x, z: a.z, cambiarPiso: 1 });
  w.tick();
  expect(a.pisoObjetivo).toBe(1);
  for (let t = 0; t < 50; t++) w.tick();
  expect(a.piso).toBe(1);
});
```

(Ajustar posiciones/ticks tras leer `tests/interior.test.ts` y
`tests/interiorGen.test.ts` para los campos reales de `b.escalera`/`b.puerta`
— seguir exactamente los mismos accesores que usan esos tests hoy.)

- [x] **Step 2-4:** TDD estándar; suite completa
  (`npx vitest run --exclude tests/balance.test.ts`) y `npx tsc --noEmit`
  en verde; `tests/portabilidad.test.ts` sigue verde (sin funciones
  prohibidas nuevas — `sqrt(dx*dx+dz*dz)` en vez de `Math.hypot`, ya
  seguido en los snippets de arriba).
- [x] **Step 5: Commit** — `feat: movimiento WASD y escaleras dentro de un edificio al poseer a un agente (Plan 8)`

---

## Task 3: Cámara a la altura del piso, salida y verificación en navegador

**Files:**
- Modify: `src/render/cameraRig.ts` (`actualizarTercera` suma altura de piso)
- Modify: `src/game/posesion.ts` (pasa la altura calculada)

**Interfaces:** `actualizarTercera` hoy fija la cámara a `TERCERA_ARRIBA`
sobre y=0 siempre. Sumar un offset de altura como nuevo parámetro (render
puro, sin tocar `src/sim/` en este archivo salvo el import de solo-lectura
de `INTERIOR` que ya hace falta en `posesion.ts`):

```ts
// cameraRig.ts
actualizarTercera(px: number, pz: number, dirX: number, dirZ: number, alturaSuelo: number): void {
  // ...cálculo de yaw sin cambios...
  const sen = Math.sin(this.yawTercera);
  const cos = Math.cos(this.yawTercera);
  this.camera.position.set(px - sen * TERCERA_ATRAS, TERCERA_ARRIBA + alturaSuelo, pz - cos * TERCERA_ATRAS);
  this.camera.lookAt(px + sen * TERCERA_MIRA, 1.4 + alturaSuelo, pz + cos * TERCERA_MIRA);
  this.focus.set(px, 0, pz); // el foco (x/z) para JugablesView/occlusion no cambia con la altura
}
```

`posesion.ts`, `actualizarCamara`:
```ts
import { INTERIOR } from '../sim/config';
// ...
actualizarCamara(alpha: number): void {
  const a = this.world.citizens[this.idAgente];
  if (!a) return;
  const px = a.prevX + (a.x - a.prevX) * alpha;
  const pz = a.prevZ + (a.z - a.prevZ) * alpha;
  const alturaSuelo = a.dentroDe >= 0 ? a.piso * INTERIOR.alturaPiso : 0;
  this.rig.actualizarTercera(px, pz, a.dirX, a.dirZ, alturaSuelo);
}
```

- [x] **Step 1: Implementar** (sin test unitario — mismo criterio que Plan
  7 Task 1: lógica de cámara sin tests unitarios previos, se verifica en
  navegador).
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — poseer un agente, caminar
  hasta la puerta de un edificio jugable y confirmar que entra solo (sin
  clic ni tecla especial); dentro, mover con WASD y confirmar colisión con
  paredes y que caminar hacia la puerta lo saca de nuevo a la calle;
  caminar hasta el cuadro de la escalera y pulsar E — confirmar que tras
  ~1.5 s sube de piso y la CÁMARA sube con el personaje (sin quedarse a
  nivel de calle); pulsar Q en la escalera del piso 1 y confirmar que baja.
  Confirmar que la vista recortada (paredes/techo ocultos) se ve
  correctamente desde dentro sin tocar `JugablesView`. Sin errores de
  consola en ningún paso.
- [x] **Step 4: Commit** — `feat: camara a la altura del piso al poseer a un agente dentro de un edificio (Plan 8)`

---

## Task 4: Cierre

- [x] **Step 1:** `npm test` completo (con balance — Task 1 y 2 tocan
  `src/sim/`, aunque el camino nuevo solo es alcanzable bajo posesión
  activa del jugador, nunca en una partida sin intervención; confirmar que
  el gate de balance no se mueve) y `npx tsc --noEmit` limpios.
- [x] **Step 2: Cierre** — lecciones condensadas en CLAUDE.md si aplica,
  checkboxes marcados, commit
  `chore: entrar a edificios poseido verificado (Plan 8 completo)`, push.
