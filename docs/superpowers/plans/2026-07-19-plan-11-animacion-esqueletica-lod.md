# PANDEMIA — Plan 11: Nivel "Alta" — animación esquelética real con LOD — Implementation Plan

> **For agentic workers:** Depende de Plan 9 (ciclo de poses) — usa los
> MISMOS GLB de clips (`survivor-anim-*.glb`) ya cargados por
> `personajesView.ts`; conviene implementarse después, reusando esa carga
> en vez de duplicarla. Es la task más experimental/sensible a rendimiento
> del roadmap de assets — el Task 3 (medición de FPS) es OBLIGATORIO antes
> de cerrar, no un "nice to have".

## Meta

El diseño (`docs/superpowers/specs/2026-07-05-pandemia-design.md`, tabla
de calidad) reserva un nivel "Alta" nunca implementado: animación
esquelética REAL (huesos moviéndose por `AnimationMixer`, no poses
horneadas) para los ciudadanos más cercanos a la cámara, con un sistema de
LOD (level of detail) que sigue usando los pools `InstancedMesh` baratos
del Plan 9 para todo lo que esté lejos.

**Por qué hace falta LOD y no "todos con hueso real":**
`THREE.InstancedMesh` no soporta skinning por instancia (ya confirmado en
Plan 6) — animación esquelética real significa UN `THREE.SkinnedMesh` +
`THREE.AnimationMixer` POR CIUDADANO, cada uno con su propio costo de CPU
(actualizar la skeleton) y su propio draw call (sin instancing). Con ~800
ciudadanos eso es inviable a la vez; la técnica estándar es un **pool
acotado de N "slots" esqueléticos reales**, asignados dinámicamente a los
ciudadanos más cercanos a la cámara cada frame, con todo lo demás
renderizado por los pools baratos ya existentes (Plan 6/9).

Esto es 100% `src/render/` — CERO cambios a `src/sim/`.

## Task 1: Extraer la carga de clips a un módulo compartido

**Files:**
- Modify: `src/render/personajesView.ts` (si Plan 9 dejó la carga de
  `survivor-anim-*.glb` inline en `cargarPersonajes`, extraerla)
- Create o modify: `src/render/animacionAssets.ts` (GLTFs + `AnimationClip`s
  crudos, compartidos entre el pipeline de horneado de Plan 9 y los
  `SkinnedMesh` reales de este plan — evita cargar los mismos `.glb` dos
  veces)

**Interfaces:** Depende del estado real de `personajesView.ts` tras Plan 9
— leer el archivo primero. Objetivo: un único punto que carga
`survivor-base.glb` + `survivor-anim-idle.glb` + `survivor-anim-run.glb`
UNA vez, expone tanto los `SkinnedMesh`/`AnimationClip` crudos (para este
plan) como lo que Plan 9 ya necesita (geometrías horneadas). Evitar
duplicar `fetch`/`GLTFLoader.loadAsync` de los mismos archivos.

- [ ] **Step 1: Implementar** (refactor de carga, sin cambio de comportamiento visible).
- [ ] **Step 2:** `npx tsc --noEmit` limpio; verificación en navegador de que Plan 9 sigue funcionando igual (sin regresión).
- [ ] **Step 3: Commit** — `refactor: assets de animacion compartidos entre ciclo de poses y skinning real (Plan 11)`

---

## Task 2: Pool de slots esqueléticos con LOD por distancia a cámara

**Files:**
- Create: `src/render/personajesAltaView.ts` (o extender `PersonajesView`
  con un segundo sub-sistema interno — decidir al implementar según qué
  quede más legible; probablemente un archivo separado es más claro dado
  que la lógica de asignación de slots no tiene nada que ver con
  `InstancedMesh`)
- Modify: `src/game/main.ts` (instanciar y actualizar el nuevo sistema
  junto a `personajesView`)

**Interfaces:**

```ts
const RADIO_LOD = 30; // m: dentro de este radio de la cámara, esqueleto real
const MAX_SLOTS = 24; // tope duro de SkinnedMesh simultáneos, medir en Task 3 y ajustar
```

Cada frame:
1. Calcular distancia² de cada ciudadano VISIBLE (mismo criterio que ya
   usa `cityView.updateOcclusion`/`JugablesView` para "cerca de la cámara"
   — reusar `rig.camera.position`, NO `rig.focusPoint`, ya que aquí
   importa la distancia real a la cámara, no el punto de foco del pan)
   a la cámara.
2. Tomar los `MAX_SLOTS` ciudadanos más cercanos dentro de `RADIO_LOD`
   (un `sort`/`nth-element` parcial sobre como mucho unas pocas decenas de
   candidatos — NO iterar los 800 cada frame con un cálculo caro; un
   filtro previo por AABB/radio grueso antes del sort, o reusar
   `world.grid.queryCircle` alrededor de la posición de la cámara
   proyectada al suelo si el radio de consulta lo permite).
3. Para cada ciudadano en ese conjunto: si YA tiene un slot asignado de un
   frame anterior, reusarlo (evita "pop"/reinicio de animación al no
   cambiar); si es nuevo en el conjunto, asignarle un slot libre (o robar
   el slot del ciudadano MÁS LEJANO que ya no califica, si no hay libres).
   Ciudadanos que SALEN del conjunto liberan su slot y vuelven a
   dibujarse por el pool barato de Plan 9 sin discontinuidad visible
   (mismo criterio de pose/frame determinista de Plan 9 para que la
   transición esqueleto-real → pool-horneado no salte de fase).
4. Cada slot activo: `AnimationMixer` corriendo el clip que corresponda
   (`idle`/`run`, MISMO criterio `enMovimiento(c)` de Plan 9 — no inventar
   un criterio nuevo), posicionado/orientado según `c.x/z` interpolado y
   `Math.atan2`... **ojo**: `atan2` está PROHIBIDO en `src/sim/` pero este
   código vive en `src/render/` — sí está permitido aquí (la prohibición
   de `CLAUDE.md` es solo para `src/sim/`, confirmarlo releyendo la regla
   antes de que un revisor lo marque por error).
5. Ciudadanos FUERA del conjunto (la inmensa mayoría) se siguen dibujando
   exactamente como hoy vía `PersonajesView` (Plan 6/9) — este sistema
   nuevo solo AÑADE los slots reales encima, no reemplaza el pool barato.
   **Los ciudadanos con slot real deben OCULTARSE del pool barato ese
   frame** (escala 0 en su instancia de `InstancedMesh`, igual que ya se
   hace para "no dibujar en esta piel/pose") — si no, se ven DOS copias
   superpuestas.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2:** `npx tsc --noEmit` limpio.
- [ ] **Step 3: Verificación en navegador** — acercar la cámara a un grupo
  de ciudadanos (zoom/pan en modo director, o poseer un agente y caminar
  hacia una multitud) y confirmar visualmente que los más cercanos animan
  con huesos reales (transición de pose fluida, no a saltos de frame como
  el pool horneado) y que alejarse los devuelve al pool barato SIN un
  "pop" visible de posición/pose. Confirmar que nunca hay doble-render
  (silueta duplicada). Sin errores de consola.
- [ ] **Step 4: Commit** — `feat: animacion esqueletica real con LOD para ciudadanos cercanos (Plan 11)`

---

## Task 3: Verificación de rendimiento — OBLIGATORIA antes de cerrar

**Files:** ninguno (solo medición; ajustes de `MAX_SLOTS`/`RADIO_LOD` si hace falta).

- [ ] **Step 1:** Medir FPS/tiempo de frame (mismo método de
  `javascript_tool` que Plan 6 Task 4 y Plan 9 Task 3) en el peor caso
  realista: cámara cerca de una multitud grande (asedio, combate) con
  `MAX_SLOTS` esqueletos reales activos A LA VEZ que el resto de la
  ciudad simulando. Comparar contra el baseline de Plan 9 (sin este
  sistema). Si el costo es prohibitivo, bajar `MAX_SLOTS` (menos
  ciudadanos con hueso real, más margen) ANTES de cerrar — este plan NO
  se considera terminado con FPS peor que Plan 9 sin una razón documentada.
- [ ] **Step 2:** `npm test` completo (no debería tocar nada de `src/sim/`)
  y `npx tsc --noEmit` limpios.
- [ ] **Step 3: Cierre** — actualizar la tabla de calidad del design doc
  (nivel "Alta" pasa a ✅, con los valores finales de `MAX_SLOTS`/`RADIO_LOD`
  documentados), lecciones en CLAUDE.md, checkboxes marcados, commit
  `chore: animacion esqueletica con LOD verificada (Plan 11 completo)`, push.
