# PANDEMIA — Plan 15: Pista de tutorial para entrar a edificios poseído — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Plan pequeño, una sola task.

## Meta

Feedback directo del usuario jugando: no sabía que se podía entrar a un
edificio poseyendo a un agente (Plan 8, mecánica real y funcional —
caminar con WASD hasta la puerta de un edificio jugable entra solo). El
problema NO es la mecánica, es que **no se explica en ningún lado** — ni
el tutorial (`src/ui/tutorial.ts`) ni ningún indicador del HUD la
mencionan.

**Arreglo:** un tip nuevo en la secuencia YA existente de
`src/ui/tutorial.ts` (toast de una línea, mismo patrón que los otros 5).
Dispara la PRIMERA vez que el jugador posee a un agente — el
prerrequisito real de la mecánica — no atado a proximidad de una puerta
(más simple, y "podés hacer esto" es más útil como aviso temprano que
como reacción justo al llegar a una puerta).

**Trampa a evitar (ya resuelta una vez para el pánico masivo, mismo
patrón a replicar):** los pasos del tutorial son un PUNTERO que solo
avanza — si el paso N recién se comprueba cuando el puntero YA está en N,
un evento que ocurrió ANTES (posesión temprana, mientras el puntero
todavía estaba en el paso 1 o 2) se perdería para siempre. Por eso
`vistoPanicoMasivo` es una bandera con MEMORIA que `Tutorial.actualizar`
mantiene actualizada en TODOS los frames, sin importar en qué paso esté
el puntero — replicar exactamente ese patrón con una nueva bandera
`vistoPosesion`.

Esto es 100% `src/ui/` — CERO cambios a `src/sim/` (solo LEE
`Citizen.esAgente`/`ordenControl`, ya expuestos).

## Task 1: Nuevo paso de tutorial, bandera con memoria

**Files:**
- Modify: `src/ui/tutorial.ts`

**Interfaces:**

```ts
/** true si en ESTE tick algún agente tiene `ordenControl` — o sea, la última
 * orden que se le aplicó fue una orden 'control' (posesión WASD, ver
 * src/sim/agentes.ts::aplicarOrden). Señal de "el jugador ya poseyó a
 * alguien al menos una vez", sin necesitar enganchar `Posesion` directamente
 * (mismo espíritu que `huboHabilidadDeJugador` lee del `world`, no de
 * `Controles`). */
export function huboPosesion(world: World): boolean {
  return world.citizens.some((c) => c.esAgente && c.ordenControl);
}
```

`crearPasos` — nuevo parámetro `vistoPosesion: () => boolean`, nuevo paso
insertado tras "¡Empezó!..." (posición 3, antes de "Todo tiene un
precio..." — para cuando el jugador ya probablemente experimentó con sus
agentes durante la escalada, no antes de que haya nada que hacer):

```ts
function crearPasos(vistoPanicoMasivo: () => boolean, vistoPosesion: () => boolean): Paso[] {
  return [
    { /* paciente cero, sin cambios */ },
    { /* primera transformación, sin cambios */ },
    {
      texto: 'Poseíste a un agente: caminá hasta la puerta de un edificio para refugiarlo adentro',
      cumplida: vistoPosesion,
    },
    { /* "todo tiene un precio", sin cambios */ },
    { /* megáfono, sin cambios */ },
    { /* obrero, sin cambios */ },
  ];
}
```

`Tutorial`:
```ts
private vistoPosesion = false; // junto a vistoPanicoMasivo, mismo patrón

constructor() {
  // ...
  this.pasos = crearPasos(() => this.vistoPanicoMasivo, () => this.vistoPosesion);
  // ...
}

actualizar(world: World, partida: Partida): void {
  // ...
  if (hayPanicoMasivo(world)) this.vistoPanicoMasivo = true;
  if (huboPosesion(world)) this.vistoPosesion = true; // mismo patrón, junto a la línea de arriba
  // ...
}
```

Sin tests unitarios (mismo criterio que el resto de `tutorial.ts` —
aunque OJO, `huboHabilidadDeJugador`/`hayPanicoMasivo` SÍ son funciones
puras exportadas fácilmente testeables si en algún momento se agregan
tests a este archivo; no es requisito de este plan, pero si el
implementador ve que ya existen tests de `tutorial.ts`, seguir el mismo
patrón para `huboPosesion` en vez de omitirlo).

- [ ] **Step 1: Implementar.**
- [ ] **Step 2:** `npx tsc --noEmit` limpio.
- [ ] **Step 3: Verificación en navegador** — con `localStorage` limpio
  (borrar la clave `pandemia-tutorial` antes de probar, mismo método que
  ya usaba la verificación original de Plan 4 Task 9), poseer un agente
  (`window.pandemia.posesion.activar(id)` o clic normal + doble clic) y
  confirmar que el tip nuevo aparece la PRIMERA vez que se aplica una
  orden 'control' — probar poseer ANTES de que aparezca el tick de
  paciente cero (posesión temprana) y confirmar que el tip de todos modos
  aparece más tarde, en su posición correcta de la secuencia, sin
  perderse (la trampa del puntero-que-no-retrocede). Sin errores de consola.
- [ ] **Step 4: Commit** — `feat: pista de tutorial para entrar a edificios poseido (Plan 15)`

---

## Task 2: Cierre

- [ ] **Step 1:** `npm test` completo (no debería tocar `src/sim/`) y
  `npx tsc --noEmit` limpios.
- [ ] **Step 2: Cierre** — checkboxes marcados, commit
  `chore: pista de entrar a edificios verificada (Plan 15 completo)`, push.
