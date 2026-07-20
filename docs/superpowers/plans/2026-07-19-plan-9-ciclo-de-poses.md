# PANDEMIA — Plan 9: Ciclo de poses (animación real de movimiento) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea.

## Meta

Desde el Plan 6, los ciudadanos/zombis usan un modelo real horneado
(`hornearPose`, `personajesView.ts`) pero en UNA sola pose fija (bind pose,
brazos en T) — no cambia al caminar, correr, huir o cojear. El diseño
(`docs/superpowers/specs/2026-07-05-pandemia-design.md:220`, tabla de
calidad "Media — ciclo de poses") ya deja este siguiente paso previsto: el
pipeline de horneado (`poseBake.ts`) hornea la pose ACTUAL de un
`SkinnedMesh` sin más cambios; solo hace falta (1) hornear varios frames de
un clip de animación en vez de uno solo, (2) construir un pool de
`InstancedMesh` por (piel × pose × frame), y (3) elegir en `update()` qué
pool usar cada ciudadano cada frame, de forma determinista.

**Simplificación deliberada de assets**: el pack convertido en Plan 6 solo
trae `survivor-anim-{idle,run,jump}.glb` (sin "walk" propio). En vez de
salir a buscar/convertir un cuarto clip, este plan reusa **idle** para
quieto y **run** para cualquier movimiento (marcha normal, huida, incluso
posesión) — visualmente una marcha "trotada" en vez de un paso lento, pero
sin bloquear el plan en más descargas de assets. `jump` no se usa (el
juego no tiene mecánica de salto). Cojera (`zonaHerida === 'pierna'`) se
aproxima RALENTIZANDO el ciclo de `run` en vez de un clip dedicado — mismo
espíritu de "reusar lo que ya existe" que el resto del proyecto.

Esto es 100% `src/render/` — CERO cambios a `src/sim/` (el estado que
decide la pose ya vive en `Citizen.dirX/dirZ`/`salud`/`zonaHerida`, todo
leído, nunca escrito). Sin tests unitarios (igual que el resto de
`personajesView.ts`/`cameraRig.ts`): se verifica en navegador.

## Task 1: Hornear N frames de idle y run por piel

**Files:**
- Modify: `src/render/poseBake.ts` (nueva función auxiliar de muestreo, `hornearPose` NO cambia)
- Modify: `src/render/personajesView.ts` (`cargarPersonajes` hornea múltiples frames)

**Interfaces:** `hornearPose(skinned)` ya hornea "la pose actual" — para
sacar un frame de un clip hace falta posicionar la skeleton en un instante
del clip ANTES de llamar a `hornearPose`. Tres piezas nuevas en
`poseBake.ts`:

```ts
import { AnimationClip, AnimationMixer } from 'three';

/**
 * Hornea N frames muestreados uniformemente a lo largo de un clip (loop:
 * el último frame es el instante ANTERIOR al final, para que el ciclo no
 * repita el frame 0 dos veces al volver a empezar). `root` es el objeto
 * raíz sobre el que corre el AnimationMixer (normalmente `gltf.scene`);
 * `skinned` es el SkinnedMesh a hornear en cada instante.
 */
export function hornearCiclo(
  root: THREE.Object3D,
  skinned: THREE.SkinnedMesh,
  clip: AnimationClip,
  frames: number
): THREE.BufferGeometry[] {
  const mixer = new AnimationMixer(root);
  const accion = mixer.clipAction(clip);
  accion.play();
  const salida: THREE.BufferGeometry[] = [];
  for (let i = 0; i < frames; i++) {
    const t = (clip.duration * i) / frames;
    mixer.setTime(t);
    salida.push(hornearPose(skinned));
  }
  return salida;
}
```

`personajesView.ts`, `cargarPersonajes` — cargar los dos GLB de clips
además de `survivor-base.glb`, encontrar el `SkinnedMesh` de cada uno
(mismo patrón `traverse` ya usado), y hornear:

```ts
const FRAMES_IDLE = 4;
const FRAMES_RUN = 8;

// tras cargar survivor-base.glb (ya existente)...
const gltfIdle = await loader.loadAsync('/models/personajes/survivor-anim-idle.glb');
const gltfRun = await loader.loadAsync('/models/personajes/survivor-anim-run.glb');
const skinnedIdle = encontrarSkinnedMesh(gltfIdle.scene); // extraer el helper de "encontrado" existente a una función compartida
const skinnedRun = encontrarSkinnedMesh(gltfRun.scene);
const clipIdle = gltfIdle.animations[0]; // confirmar en consola/navegador que animations[0] es el clip correcto, no asumir
const clipRun = gltfRun.animations[0];

const framesIdle = hornearCiclo(gltfIdle.scene, skinnedIdle, clipIdle, FRAMES_IDLE);
const framesRun = hornearCiclo(gltfRun.scene, skinnedRun, clipRun, FRAMES_RUN);
```

(Ojo: `gltfIdle.scene`/`gltfRun.scene` son ARMADURAS independientes de
`survivor-base.glb` — confirmar en el propio Kenney/Synty pack que
comparten el mismo esqueleto/topología de vértices que `survivor-base.glb`,
ya que `hornearPose` asume que `skinIndex`/`skinWeight` del mesh horneado
corresponden 1:1 con `boneMatrices` de SU PROPIA skeleton — cada llamada a
`hornearCiclo` usa el skinned mesh y clip de SU PROPIO gltf, así que esto
ya es correcto por construcción; la única verificación real es que el
NÚMERO DE VÉRTICES coincida entre `survivor-base.glb` y
`survivor-anim-*.glb`, si no los pools de distintos frames tendrían
distinta topología y `InstancedMesh` compartiría geometría incorrectamente
— en ese caso, cada pool de frame necesitaría su PROPIA `InstancedMesh`,
lo cual ya es el diseño de Task 2 de todos modos, así que no es bloqueante).

`PersonajesAssets` gana los nuevos arrays de geometría por piel:
```ts
export interface PersonajesAssets {
  geometriaIdle: THREE.BufferGeometry[]; // FRAMES_IDLE elementos
  geometriaRun: THREE.BufferGeometry[]; // FRAMES_RUN elementos
  materiales: Map<NombrePiel, THREE.Material>;
}
```

- [ ] **Step 1: Implementar** — sin test unitario (lógica de carga de
  assets con `GLTFLoader`, mismo criterio que el resto de `personajesView.ts`).
- [ ] **Step 2:** `npx tsc --noEmit` limpio.
- [ ] **Step 3: Verificación en navegador** — confirmar en consola
  (`javascript_tool`) que `cargarPersonajes()` resuelve sin error, que
  `geometriaIdle.length === FRAMES_IDLE` y `geometriaRun.length ===
  FRAMES_RUN`, y que cada geometría tiene `attributes.position.count`
  IDÉNTICO al de la bind pose original (mismo número de vértices — si no,
  hay un mismatch de topología entre `survivor-base.glb` y los clips,
  investigar antes de seguir a Task 2). Sin errores de consola.
- [ ] **Step 4: Commit** — `feat: hornear frames de idle y run por clip de animacion (Plan 9)`

---

## Task 2: Pools por (piel × pose × frame) y selección determinista

**Files:**
- Modify: `src/render/personajesView.ts` (`PersonajesView`)
- Modify: `src/game/main.ts` (pasar `world.tickCount` a `personajesView.update`)

**Interfaces:** Hoy `PersonajesView` tiene 4 `InstancedMesh` (una por
piel). Con `FRAMES_IDLE + FRAMES_RUN` frames por piel, serían
`4 × (FRAMES_IDLE + FRAMES_RUN)` = `4 × 12` = 48 `InstancedMesh` con
`FRAMES_IDLE=4, FRAMES_RUN=8` — cada ciudadano se dibuja en EXACTAMENTE
una de esas 48 cada frame (todas las demás con escala ~0, mismo patrón ya
usado en `update()` para elegir piel). Estructura sugerida: un `Map` con
clave compuesta `` `${piel}:${pose}:${frame}` `` en vez de anidar
`Map<Map<Map>>>` (más simple de iterar en el loop de "ponlas todas a
escala 0 salvo la activa").

```ts
type Pose = 'idle' | 'run';

function claveMesh(piel: NombrePiel, pose: Pose, frame: number): string {
  return `${piel}:${pose}:${frame}`;
}
```

Selección de pose y frame — nueva función pura, sin estado, junto a
`pielActiva`:

```ts
const CICLO_TICKS = 6; // ticks de sim por frame de animacion (30 tps / 6 ≈ 5 fps de ciclo, ajustar a ojo en verificacion)

/** true si el ciudadano se está moviendo (dirX/dirZ no ambos 0) — mismo criterio que ya usa el estado 'caminando'/'quieto' en otras partes del render. */
function enMovimiento(c: Citizen): boolean {
  return c.dirX !== 0 || c.dirZ !== 0;
}

function poseYFrame(c: Citizen, tickCount: number): { pose: Pose; frame: number } {
  if (!enMovimiento(c) || c.salud === 'caido') return { pose: 'idle', frame: (tickCount + c.id) % FRAMES_IDLE_RUNTIME };
  // Cojera: ciclo de "run" a la MITAD de velocidad (aproximación sin clip propio, ver Meta).
  const factorCojera = c.zonaHerida === 'pierna' ? 2 : 1;
  const fase = Math.floor((tickCount + c.id * 7) / (CICLO_TICKS * factorCojera));
  return { pose: 'run', frame: fase % FRAMES_RUN_RUNTIME };
}
```

(Nombres `FRAMES_IDLE_RUNTIME`/`FRAMES_RUN_RUNTIME` como placeholder — usar
directamente `FRAMES_IDLE`/`FRAMES_RUN` si quedan como constantes de
módulo compartidas entre `poseBake.ts` y `personajesView.ts`, ajustar al
implementar; el desfase `c.id * 7` desincroniza a los ciudadanos entre sí
para que no anden todos en fase — mismo espíritu que el `c.id % 2` ya usado
en `pielActiva`, determinista y sin RNG.)

El agente caído (`c.salud === 'caido'`) ya se escala/aplana con
`scaleY = 0.35` en el código actual — mantener eso TAL CUAL (no tiene
sentido animar un ciclo de marcha sobre un cuerpo tumbado); solo se está
ajustando qué GEOMETRÍA de base usa (queda en `idle`, cualquier frame,
aplanada igual que hoy).

`update()` — el bucle interno que hoy hace `for (const nombre of
PIELES_DISPONIBLES)` pasa a iterar TODAS las claves `piel:pose:frame` (48
en vez de 4), poniendo a escala 0 todas salvo la combinación activa de
cada ciudadano. Con 800 ciudadanos × 48 meshes esto es
`800 × 48 = 38400` llamadas a `setMatrixAt` por frame — más que las 3200
de hoy (800×4) pero mismo ORDEN de magnitud que ya maneja el motor;
**Task 3 mide el costo real**, no asumir que está bien sin medir.

`personajesView.update(citizens, alpha, seleccionado)` gana un cuarto
parámetro `tickCount: number`; `main.ts` ya tiene `world.tickCount`
disponible en el `frame()` loop — pasar `world.tickCount` en la llamada
existente.

- [ ] **Step 1: Implementar** — sin test unitario.
- [ ] **Step 2:** `npx tsc --noEmit` limpio.
- [ ] **Step 3: Verificación en navegador** — con el gancho de dev
  (`window.pandemia.tick()`/`frame(alpha)`, SIEMPRE con `alpha` explícito),
  poseer un agente, caminar con WASD y confirmar visualmente (captura vía
  `canvas.toDataURL`, ver lección de CLAUDE.md) que el modelo cicla entre
  poses al moverse y vuelve a quieto (`idle`) al soltar las teclas; soltar
  posesión y observar civiles/zombis caminando por la calle — confirmar
  que NO todos comparten la misma fase (desfase por `c.id` funcionando).
  Sin errores de consola.
- [ ] **Step 4: Commit** — `feat: ciclo de poses real al caminar/correr/cojear (Plan 9)`

---

## Task 3: Verificación de rendimiento y cierre

**Files:** ninguno (solo verificación).

- [ ] **Step 1:** Con ~800 ciudadanos activos y el escenario más cargado
  posible (varios edificios con brecha, combate, muchos zombis en calle),
  medir FPS/tiempo de frame vía `javascript_tool` (mismo método que Plan 6
  Task 4 — leer `performance.now()` entre frames o el contador interno
  que ya exista). Comparar contra el ~2 ms/frame medido en Plan 6 para la
  pose única; si el costo de 48 pools resulta prohibitivo, considerar
  reducir `FRAMES_RUN`/`FRAMES_IDLE` (menos frames = pools más baratos,
  ciclo más entrecortado — documentar el trade-off elegido) ANTES de
  cerrar la task, no después.
- [ ] **Step 2:** `npm test` completo (no debería tocar nada de
  `src/sim/`, confirmar con `git diff --stat -- src/sim/` vacío) y
  `npx tsc --noEmit` limpios.
- [ ] **Step 3: Cierre** — actualizar la tabla de calidad del design doc
  (`docs/superpowers/specs/2026-07-05-pandemia-design.md:220`, "Media —
  ciclo de poses" pasa a ✅, corregir la referencia a "Plan 7" que quedó
  desactualizada), lecciones condensadas en CLAUDE.md si aplica, checkboxes
  marcados, commit `chore: ciclo de poses verificado (Plan 9 completo)`, push.
