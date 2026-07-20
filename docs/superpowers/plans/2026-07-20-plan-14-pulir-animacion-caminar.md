# PANDEMIA — Plan 14: Pulir animación de caminar (ciclo proporcional a la velocidad real) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea.

## Meta

Feedback directo del usuario jugando: la animación se ve "chafa". Causa
raíz identificada (no es solo "usar el clip de correr para caminar",
Plan 9): el ciclo de poses avanza a una velocidad de reproducción FIJA
(`CICLO_TICKS = 6` ticks por frame de animación, siempre) sin importar
qué tan rápido se mueve REALMENTE el ciudadano — un civil caminando
tranquilo (`CITIZENS.walkSpeed = 1.4 m/s`), uno huyendo
(`PANICO.velocidadHuida = 2.5 m/s`), un agente poseído con sprint
(`AGENTES.velocidad × factorSprint ≈ 3.5 m/s`) y uno cojeando
(`HERIDAS.factorVelocidadFractura` sobre lo que sea) todos ciclan las
piernas EXACTAMENTE igual de rápido — el clásico "patinaje de pies"
(foot sliding) que hace que cualquier animación se vea artificial,
independientemente de cuántos frames tenga el ciclo horneado.

**Investigación ya hecha (no repetir):** no hay ningún clip de "caminar"
en los assets ya descargados (`assets-src/kenney_animated-characters-{survivors,retro}/Animations/`
solo trae `idle.fbx`, `jump.fbx`, `run.fbx` — confirmado con `ls`).
Conseguir un clip de caminata real requeriría salir a buscar/convertir un
asset nuevo — **fuera de alcance de este plan a propósito** (mismo
espíritu de "reusar lo que ya existe" del resto del proyecto). Este plan
se enfoca en el arreglo de mayor impacto SIN assets nuevos: hacer que el
ciclo de "correr" avance a un ritmo proporcional a la velocidad REAL de
cada ciudadano, no a un ritmo fijo — elimina el patinaje de pies, que es
la parte más notoria de "se ve mal", incluso reusando la misma pose de
correr para todo.

**Cómo medir "velocidad real":** cada `Citizen` ya guarda `prevX/prevZ`
(posición del tick anterior) además de `x/z` — `sqrt((x-prevX)² +
(z-prevZ)²) / DT` da la velocidad INSTANTÁNEA real de este tick, sin
importar qué mecánica la causó (marcha normal, huida, sprint, cojera,
deambular lento dentro de un edificio, o incluso "empujado contra una
pared, casi sin avanzar aunque quiera moverse"). Esto es MEJOR que el
criterio actual (`dirX !== 0 || dirZ !== 0`, que es la dirección DESEADA,
no el movimiento real) — un ciudadano bloqueado por una multitud/pared
dejaría de mostrarse "corriendo en el lugar" y pasaría a 'idle' o a un
ciclo casi congelado, que es lo que se ve más natural. Esto también hace
REDUNDANTE el caso especial de cojera (`zonaHerida === 'pierna'`) que
`poseYFrame` tiene hoy — la sim YA reduce la velocidad real por fractura,
así que el cálculo general la captura sola, sin código aparte.

Aplica a los DOS sistemas de render de personajes (mismo criterio,
adaptado a cada uno):
- `PersonajesView` (Plan 9, pool horneado `InstancedMesh`): el ciclo
  avanza por FRAME DE ANIMACIÓN horneado (`CICLO_TICKS` ticks de sim por
  frame) — se hace proporcional a la velocidad.
- `PersonajesAltaView` (Plan 11, esqueletos reales con `AnimationMixer`):
  el ciclo avanza en TIEMPO REAL de reloj — se hace proporcional
  ajustando `AnimationAction.timeScale`.

Esto es 100% `src/render/` — CERO cambios a `src/sim/` (solo LEE
`prevX/prevZ`/`x/z`, ya expuestos).

## Task 1: Ciclo proporcional a la velocidad real en ambos sistemas

**Files:**
- Modify: `src/render/personajesView.ts` (`poseYFrame`)
- Modify: `src/render/personajesAltaView.ts` (selección de pose + `timeScale`)

**Interfaces:**

`personajesView.ts` — reemplazar el cálculo fijo de `poseYFrame`:

```ts
import { CITIZENS } from '../sim/config'; // walkSpeed como referencia — ya se importa DT/INTERIOR aquí, agregar CITIZENS

const CICLO_TICKS_BASE = 6; // ticks por frame de animación A LA VELOCIDAD DE REFERENCIA (CITIZENS.walkSpeed)
const UMBRAL_QUIETO = 0.05; // m/s: por debajo de esto, se considera "sin movimiento real" (pose idle)

/** Velocidad real instantánea (m/s) a partir del desplazamiento del último tick — no depende de qué mecánica la causó. */
function velocidadReal(c: Citizen): number {
  const dx = c.x - c.prevX;
  const dz = c.z - c.prevZ;
  return Math.sqrt(dx * dx + dz * dz) / DT;
}

function poseYFrame(c: Citizen, tickCount: number): { pose: Pose; frame: number } {
  const v = velocidadReal(c);
  if (v < UMBRAL_QUIETO || c.salud === 'caido') {
    return { pose: 'idle', frame: (tickCount + c.id) % FRAMES_IDLE };
  }
  const factor = v / CITIZENS.walkSpeed; // 1.0 a la velocidad de referencia; >1 más rápido, <1 más lento
  const cicloTicks = Math.max(1, Math.round(CICLO_TICKS_BASE / factor));
  const fase = Math.floor((tickCount + c.id * 7) / cicloTicks);
  return { pose: 'run', frame: fase % FRAMES_RUN };
}
```

(Quita el parámetro/uso de `enMovimiento(c)` y el caso especial de
`zonaHerida === 'pierna'`/`factorCojera` de esta función — ya no hacen
falta, ver Meta. OJO: `enMovimiento` sigue exportada y usada por
`personajesAltaView.ts` — no borrarla del todo, revisar todos sus usos
antes de tocarla; si ya no la necesita nadie más, sí se puede quitar,
pero verificar primero con un grep real.)

`personajesAltaView.ts` — mismo criterio de velocidad real para decidir
pose, y AJUSTAR `timeScale` de la acción activa en vez de dejarlo
siempre en 1:

```ts
// dentro del bucle de actualización de cada slot activo, junto a donde hoy se decide `poseDeseada`:
const v = velocidadReal(c); // misma función, exportarla desde personajesView.ts o duplicarla — decidir al implementar
const poseDeseada: Pose = v < UMBRAL_QUIETO ? 'idle' : 'run';
// ...crossfade existente sin cambios...
const accionActiva = slot.poseActual === 'run' ? slot.accionRun : slot.accionIdle;
if (poseDeseada === 'run') {
  accionActiva.timeScale = Math.max(v / CITIZENS.walkSpeed, 0.15); // piso para no congelar del todo
}
```

(`velocidadReal` — decidir si se exporta desde `personajesView.ts` o se
duplica en `personajesAltaView.ts`; dado que ambos archivos ya comparten
`colorFor`/`pielActiva`/`PARPADEO_FRAMES` vía export desde
`personajesView.ts`, lo más consistente es exportarla también desde ahí y
reusarla, no duplicar.)

Sin tests unitarios (mismo criterio que el resto de estos dos archivos,
lógica de render puro). Verificación en navegador.

- [x] **Step 1: Implementar.**
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — poseer un agente y comparar
  visualmente caminar normal vs. sostener Shift (sprint): el ciclo de
  piernas debe verse claramente MÁS RÁPIDO al esprintar, sin patinaje de
  pies aparente en ninguno de los dos casos (capturas con
  `canvas.toDataURL`, método documentado en CLAUDE.md, en ambos estados).
  Confirmar que un ciudadano cojeando (`zonaHerida === 'pierna'`, forzar
  el estado desde el gancho de dev si hace falta) cicla notablemente más
  lento sin código especial nuevo. Confirmar que un ciudadano bloqueado
  (empujando contra una pared/multitud sin avanzar) no se ve "corriendo
  en el lugar" a toda velocidad. Repetir la comparación con la cámara
  cerca (esqueleto real, Plan 11) y lejos (pool horneado, Plan 9) para
  confirmar que ambos sistemas laten igual de bien. Sin errores de consola.
- [x] **Step 4: Commit** — `feat: ciclo de animacion proporcional a la velocidad real, sin patinaje de pies (Plan 14)`

---

## Task 2: Cierre

- [x] **Step 1:** `npm test` completo (no debería tocar `src/sim/`) y
  `npx tsc --noEmit` limpios; medir FPS rápidamente (método ya
  establecido) para confirmar que el cálculo extra de `velocidadReal` por
  ciudadano y frame no tiene costo perceptible (es una resta y una raíz
  cuadrada por ciudadano, del mismo orden que otros cálculos que ya corren
  ahí — no debería medirse, pero confirmar).
- [x] **Step 2: Cierre** — checkboxes marcados, commit
  `chore: animacion de caminar pulida y verificada (Plan 14 completo)`, push.
