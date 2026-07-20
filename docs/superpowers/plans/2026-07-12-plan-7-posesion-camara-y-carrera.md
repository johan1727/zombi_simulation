# PANDEMIA — Plan 7: Posesión — mirar alrededor y correr — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Meta

Dos bugs de control reales, encontrados jugando (feedback directo del
usuario): al poseer a un agente en tercera persona, (1) no hay forma de
mirar alrededor con el mouse — la cámara solo gira automáticamente hacia
donde el personaje camina, y (2) no hay forma de correr — la velocidad es
fija (`AGENTES.velocidad`). Un tercer bug (entrar a edificios poseído)
queda **fuera de alcance** de este plan — toca la lógica de interior
(`src/sim/interior.ts`, `src/render/jugablesView.ts` vista recortada) de
forma mucho más profunda y merece su propio plan.

## Task 1: Mirar alrededor con el mouse en tercera persona

**Files:**
- Modify: `src/render/cameraRig.ts`

**Interfaces:** Puramente de render — sin cambios a `src/sim/`. Hoy,
`actualizarTercera(px, pz, dirX, dirZ)` siempre gira `yawTercera` hacia la
dirección de movimiento con suavizado exponencial (`TERCERA_SUAVIZADO`),
sin que el jugador pueda anular eso. `CameraRig` ya tiene un patrón de
arrastre (`dragging`, listeners `pointerdown`/`pointermove`/`pointerup` en
`window`) usado en modo director para desplazar `focus` — reusar el MISMO
gesto (arrastre con click) para girar la cámara en tercera persona en vez
de desplazar el foco.

```ts
// Nuevo campo privado:
private mirandoManual = false; // true mientras el jugador arrastra en modo tercera

// En el listener 'pointermove' existente, ANTES del `if (!this.dragging) return;`:
if (this.dragging && this.modo === 'tercera') {
  this.mirandoManual = true;
  const SENSIBILIDAD = 0.005; // rad por pixel de arrastre horizontal
  this.yawTercera -= (e.clientX - this.last.x) * SENSIBILIDAD;
  this.last = { x: e.clientX, y: e.clientY };
  return; // no cae al paneo de modo director
}

// En 'pointerup' (listener existente en window):
window.addEventListener('pointerup', () => {
  this.dragging = false;
  this.mirandoManual = false; // al soltar, el auto-seguimiento de actualizarTercera vuelve a mandar
});
```

`actualizarTercera` — el bloque que gira `yawTercera` hacia
`Math.atan2(dirX, dirZ)` (auto-seguimiento por dirección de movimiento) se
salta por completo mientras `this.mirandoManual` es `true`:

```ts
actualizarTercera(px: number, pz: number, dirX: number, dirZ: number): void {
  const ahora = performance.now();
  const dt = Math.min((ahora - this.ultimoTerceraMs) / 1000, 0.1);
  this.ultimoTerceraMs = ahora;

  if (!this.mirandoManual && (dirX !== 0 || dirZ !== 0)) {
    // ...bloque de auto-seguimiento existente, sin cambios internos...
  }
  // ...resto del método sin cambios (posición de cámara, lookAt, focus)...
}
```

Resultado: arrastrar el mouse mientras posees a un agente gira la cámara
libremente alrededor de él; en cuanto sueltas Y el agente se mueve, la
cámara vuelve a seguir la dirección de marcha (mismo comportamiento de hoy,
ahora con una ventana real para mirar alrededor mientras está quieto o
mientras arrastras activamente).

- [x] **Step 1: Implementar** (sin test unitario — `CameraRig` ya no tenía
  tests unitarios antes de este plan, es lógica de interacción con
  `performance.now()`/DOM; verificar en navegador).
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — poseer un agente
  (`window.pandemia.posesion.activar(id)` o clic normal), arrastrar el
  mouse y confirmar que la cámara gira libremente sin que el personaje se
  mueva ni la orden de movimiento se dispare; soltar y mover con WASD,
  confirmar que la cámara vuelve a seguir la dirección de marcha como
  antes. Sin errores de consola.
- [x] **Step 4: Commit** — `feat: mirar alrededor con el mouse al poseer a un agente (Plan 7)`

---

## Task 2: Correr (sprint) al poseer a un agente

**Files:**
- Modify: `src/sim/types.ts` (`OrdenJugador.veloz`, `Citizen.corriendoOrden`), `src/sim/config.ts` (`AGENTES.factorSprint`), `src/sim/agentes.ts` (`aplicarOrden`, `updateAgente`), `src/game/posesion.ts` (tecla Shift)
- Test: extender `tests/agentes.test.ts`

**Interfaces:** Determinista, vía la cola de órdenes (regla sagrada del
proyecto — nunca mutar la sim desde `Posesion` directamente).

`config.ts`:
```ts
export const AGENTES = {
  velocidad: 2.2,
  factorSprint: 1.6, // multiplicador al sostener Shift en posesión — 2.2*1.6 ≈ 3.5 m/s
  radioAutodefensa: 6,
  ventanaCaidoTicks: 30 * 30,
  llegadaOrden: 0.6,
} as const;
```

`types.ts`:
```ts
export interface OrdenJugador {
  agente: number;
  tipo: 'mover' | 'habilidad' | 'control';
  x: number;
  z: number;
  /** Solo relevante para tipo 'control' (posesión WASD): Shift sostenido. */
  veloz?: boolean;
}
```
`Citizen` suma `corriendoOrden: boolean;` (spawn: `false` — en `citizens.ts`
Y `agentes.ts`, los dos literales completos del tipo).

`agentes.ts`, `aplicarOrden` — al procesar `tipo === 'control'`, además de
`ordenX/ordenZ`, guardar el flag:
```ts
if (o.tipo === 'mover' || o.tipo === 'control') {
  a.ordenX = o.x;
  a.ordenZ = o.z;
  a.corriendoOrden = o.tipo === 'control' && !!o.veloz;
  return;
}
```
(Una orden `'mover'` — la del modo director, clic para mover — SIEMPRE dela
`corriendoOrden = false`: el sprint es exclusivo de la posesión WASD, no
hay tecla Shift en el modo director.)

`updateAgente` — la velocidad efectiva ya se calcula al principio de la
función (`const velocidad = AGENTES.velocidad * (fractura ? ... : 1)`);
multiplicar también por el factor de sprint SOLO mientras se está
ejecutando una orden `ordenX/ordenZ` activa con el flag puesto (si el
agente ya llegó y `ordenX` se limpia a `NaN`, el sprint deja de aplicar
solo, sin lógica extra):
```ts
const velocidad = AGENTES.velocidad
  * (c.zonaHerida === 'pierna' ? HERIDAS.factorVelocidadFractura : 1)
  * (c.corriendoOrden ? AGENTES.factorSprint : 1);
```

`src/game/posesion.ts` — capturar Shift junto a WASD (mismo patrón de
`TECLAS_MOVIMIENTO`, un `Set` separado o un booleano simple ya que Shift no
tiene dirección):
```ts
private shiftPresionado = false;
// en el listener keydown existente (junto al chequeo de TECLAS_MOVIMIENTO):
if (k === 'shift') this.shiftPresionado = true;
// en keyup:
if (k === 'shift') this.shiftPresionado = false;
```
`alTick()` — al encolar la orden `'control'`, sumar `veloz: this.shiftPresionado`:
```ts
this.world.encolarOrden({
  agente: this.idAgente,
  tipo: 'control',
  x: a.x + dir.x * PASO,
  z: a.z + dir.z * PASO,
  veloz: this.shiftPresionado,
});
```

- [x] **Step 1: Test que falla** (añadir a `tests/agentes.test.ts`, junto a
  los tests existentes de determinismo de agentes — importar `AGENTES` si
  no está ya importado):

```ts
it('una orden "control" con veloz=true mueve al agente mas rapido que sin el flag', () => {
  const lento = new World('sprint-1', 5);
  const rapido = new World('sprint-1', 5);
  const aLento = lento.agentes[0];
  const aRapido = rapido.agentes[0];
  for (let t = 0; t < 30; t++) {
    lento.encolarOrden({ agente: aLento.id, tipo: 'control', x: aLento.x + 10, z: aLento.z });
    rapido.encolarOrden({ agente: aRapido.id, tipo: 'control', x: aRapido.x + 10, z: aRapido.z, veloz: true });
    lento.tick();
    rapido.tick();
  }
  const dLento = Math.sqrt((aLento.x - lento.agentes[0].prevX) ** 2); // referencia simple: distancia recorrida
  const distLento = Math.abs(aLento.x - (new World('sprint-1', 5)).agentes[0].x);
  const distRapido = Math.abs(aRapido.x - (new World('sprint-1', 5)).agentes[0].x);
  expect(distRapido).toBeGreaterThan(distLento * 1.3); // holgado bajo el factor 1.6 real
});

it('una orden "mover" (modo director) ignora veloz: nunca hay sprint fuera de posesion', () => {
  const w = new World('sprint-2', 5);
  const a = w.agentes[0];
  w.encolarOrden({ agente: a.id, tipo: 'mover', x: a.x + 10, z: a.z, veloz: true } as never);
  w.tick();
  expect(a.corriendoOrden).toBe(false);
});
```

(Ajustar el primer test si la aserción de distancia inicial queda
confusa al implementar — la intención es: comparar cuánto avanza el mismo
agente, misma semilla, con y sin `veloz`, y confirmar una diferencia
consistente con `AGENTES.factorSprint`. Usar el patrón de comparación de
distancia ya usado en `tests/heridas.test.ts`/`tests/panico.test.ts`
—`sqrt(dx*dx+dz*dz)`, nunca `Math.hypot`.)

- [x] **Step 2-4:** TDD estándar; suite completa (`npx vitest run --exclude tests/balance.test.ts`) y `npx tsc --noEmit` en verde; `tests/portabilidad.test.ts` sigue verde (sin funciones prohibidas nuevas).
- [x] **Step 5: Verificación en navegador** — poseer un agente, sostener
  Shift + WASD, confirmar visualmente que se mueve más rápido que sin
  Shift, y que soltar Shift a mitad de movimiento vuelve a la velocidad
  normal en el siguiente tick (sin salto raro). Sin errores de consola.
- [x] **Step 6: Commit** — `feat: correr (sprint) al poseer a un agente, tecla Shift (Plan 7)`

---

## Task 3: Cierre

- [x] **Step 1:** `npm test` completo (con balance — no debería moverse,
  ninguna task de este plan cambia el comportamiento SIN intervención del
  jugador, solo la posesión activa; confirmar de todos modos ya que Task 2
  sí toca `src/sim/`) y `npx tsc --noEmit` limpios.
- [x] **Step 2: Cierre** — lecciones condensadas en CLAUDE.md si aplica,
  checkboxes marcados, commit
  `chore: mirar alrededor y correr en posesion verificados (Plan 7 completo)`,
  push.
