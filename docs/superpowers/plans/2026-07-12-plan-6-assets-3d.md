# PANDEMIA — Plan 6: Assets 3D reales (Fase 3 adelantada) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Meta

Reemplazar los marcadores geométricos (cápsulas, cajas) por los modelos
low-poly reales ya descargados y verificados (`assets-src/`, CC0, Kenney):
edificios de fondo, autos decorativos, y ciudadanos/zombis con silueta real.
Nivel de calidad **Media** del diseño (§8): low-poly, sin esqueleto animado
por instancia (`InstancedMesh` no soporta skinning nativo en Three.js —
confirmado en investigación previa). Fuera de alcance de este plan (documentado
explícitamente, no un descuido):

- **Edificios `jugables`** (los que se pueden entrar): siguen 100% geometría
  procedural (`src/render/jugablesView.ts`) — esa geometría es funcional (el
  recorte de piso/pared para la vista interior de Plan 3 depende de ella
  pieza por pieza), no cosmética. Tocarla es un riesgo real para una mecánica
  que ya funciona; un facade cosmético sobre esa geometría queda para un plan
  futuro si hace falta.
- **Animación real de caminata por ciudadano**: los modelos SÍ tienen
  animaciones (idle/run/jump) convertidas a `.glb`, pero instanciar 800
  `SkinnedMesh` individuales (sin soporte de `InstancedMesh`) no es viable a
  60 fps en navegador. Este plan entrega una POSE ESTÁTICA horneada (bake) en
  vez de animación real — el "ciclo de poses instanciado" (varias poses
  horneadas, alternadas por fase de movimiento) queda para un Plan 7 si hace
  falta más adelante; aquí se deja el pipeline de horneado LISTO (Task 3) para
  que ese plan futuro solo necesite hornear más frames, no rehacer el resto.

## Estado de los assets (ya verificado, no repetir la investigación)

- `public/models/personajes/survivor-base.glb` y `retro-base.glb`: MISMA
  malla/rig (confirmado: mismo nombre de mesh `characterMedium`, mismo
  conteo de huesos, mismo tamaño de archivo ±1 byte) — se puede tratar como
  una sola geometría base para las 8 pieles.
- `public/models/personajes/skins/*.png` (8 archivos): 4 de `survivors`
  (survivorFemaleA, survivorMaleB, zombieA, zombieC) + 4 de `retro`
  (humanFemaleA, humanMaleA, zombieFemaleA, zombieMaleA).
- `public/models/personajes/{survivor,retro}-anim-{idle,jump,run}.glb`:
  clips de animación ya convertidos (para el Plan 7 de animación real).
- `public/models/props/edificios/*.glb` (41 archivos): `building-a..n.glb`,
  `building-skyscraper-a..e.glb`, `low-detail-building-a..d.glb`,
  `detail-awning*.glb`/`detail-overhang*.glb`/`detail-parasol*.glb` — GLB
  listos, sin conversión (Kenney los distribuye así).
- `public/models/props/autos/*.glb` (7 archivos): sedan, suv, taxi, police,
  ambulance, van, hatchback-sports.
- Licencia: CC0 1.0 (Kenney), sin atribución requerida.

## Arquitectura nueva (por task)

### Task 1: Edificios de fondo con geometría real

**Files:**
- Create: `src/render/buildingModels.ts` (carga y caché de GLB de edificios)
- Modify: `src/render/cityView.ts` (usar modelos reales en vez de `BoxGeometry`)
- Test: `tests/buildingModels.test.ts` (solo la función pura de selección determinista)

**Interfaces:**

Solo 48 bloques (`CITY.blocksX=6 × CITY.blocksY=8`) → los edificios `fondo`
son pocos (decenas, no cientos), así que NO hace falta `InstancedMesh` aquí:
un `THREE.Mesh` individual por edificio (clonando geometría/material de un
GLB cargado una vez) es perfectamente viable.

```ts
// src/render/buildingModels.ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Nombres de archivo (sin extensión) de los edificios de fondo disponibles. */
export const MODELOS_FONDO = [
  'building-a', 'building-b', 'building-c', 'building-d', 'building-e',
  'building-f', 'building-g', 'building-h', 'building-i', 'building-j',
  'building-k', 'building-l', 'building-m', 'building-n',
] as const;

export const MODELOS_SKYSCRAPER = [
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c',
  'building-skyscraper-d', 'building-skyscraper-e',
] as const;

/**
 * Selección determinista de modelo por edificio: SOLO depende de `id`
 * (índice fijo en `city.buildings`, ya determinista desde cityGen), nunca de
 * `Math.random`. `alto` (height > umbral) usa el pool de rascacielos.
 */
export function elegirModelo(id: number, alto: boolean): string {
  const pool = alto ? MODELOS_SKYSCRAPER : MODELOS_FONDO;
  return pool[id % pool.length];
}

/** Carga todos los GLB de un pool una sola vez; devuelve geometría+material por nombre. */
export async function cargarModelosFondo(): Promise<Map<string, THREE.Object3D>> {
  const loader = new GLTFLoader();
  const nombres = [...MODELOS_FONDO, ...MODELOS_SKYSCRAPER];
  const entradas = await Promise.all(
    nombres.map(async (n) => {
      const gltf = await loader.loadAsync(`/models/props/edificios/${n}.glb`);
      return [n, gltf.scene] as const;
    })
  );
  return new Map(entradas);
}
```

`cityView.ts` — reemplazar el `InstancedMesh` de cajas por meshes reales
(cambio quirúrgico, mismo patrón de posición/escala que ya existe en
`setAltura`, pero clonando el modelo real en vez de escalar un cubo):

```ts
// dentro de CityView, tras cargarModelosFondo() (async, se llama desde main.ts
// ANTES de construir CityView — ver Step de wiring abajo):
constructor(scene: THREE.Scene, city: CityLayout, modelos: Map<string, THREE.Object3D>) {
  this.fondos = city.buildings.filter((b) => b.kind === 'fondo');
  // ...suelo igual que hoy...
  this.grupos = this.fondos.map((b, i) => {
    const nombre = elegirModelo(b.id, b.height > 12);
    const base = modelos.get(nombre)!;
    const clon = base.clone(true); // clone(true): recursivo, comparte geometría/material (barato)
    // Kenney exporta sus kits a una escala de ~1 unidad = 1 metro de bloque;
    // reescalar al footprint real del edificio (ancho/profundidad del layout)
    // y a la altura ya calculada por cityGen, igual que hacía BoxGeometry.
    const bbox = new THREE.Box3().setFromObject(clon);
    const tam = new THREE.Vector3();
    bbox.getSize(tam);
    clon.scale.set(b.width / tam.x, b.height / tam.y, b.depth / tam.z);
    clon.position.set(b.x + b.width / 2, 0, b.z + b.depth / 2);
    scene.add(clon);
    return clon;
  });
}
```

`updateOcclusion` (aplanar edificios entre cámara y foco): en vez de
`setAltura` reescalando una `InstancedMesh`, escalar `grupos[i].scale.y` y
reposicionar en Y — mismo criterio (`altura > 6`), aplicado al `THREE.Group`
clonado en vez de a una matriz de instancia.

**Wiring (`src/game/main.ts`):** `cargarModelosFondo()` es `async` — llamarla
ANTES de construir `CityView` (el resto de la construcción de escena ya es
síncrona; envolver el arranque en una función `async function iniciar()` si
`main.ts` no lo es ya, y mostrar el HUD/loading normal mientras carga — los
GLB de edificios pesan ~2-3 MB en total, carga típica <1s en localhost).

- [x] **Step 1: Test que falla — `tests/buildingModels.test.ts`** (solo la función pura, sin cargar GLB real — vitest no tiene DOM/WebGL):

```ts
import { describe, expect, it } from 'vitest';
import { elegirModelo, MODELOS_FONDO, MODELOS_SKYSCRAPER } from '../src/render/buildingModels';

describe('elegirModelo', () => {
  it('es determinista: mismo id + alto siempre da el mismo modelo', () => {
    expect(elegirModelo(5, false)).toBe(elegirModelo(5, false));
    expect(elegirModelo(5, true)).toBe(elegirModelo(5, true));
  });
  it('usa el pool de rascacielos solo si alto=true', () => {
    expect(MODELOS_SKYSCRAPER as readonly string[]).toContain(elegirModelo(3, true));
    expect(MODELOS_FONDO as readonly string[]).toContain(elegirModelo(3, false));
  });
  it('cicla por módulo (id y id+longitud del pool dan el mismo modelo)', () => {
    expect(elegirModelo(2, false)).toBe(elegirModelo(2 + MODELOS_FONDO.length, false));
  });
});
```

- [x] **Step 2-4:** TDD para la función pura; `cityView.ts` se verifica en
  navegador (no hay DOM/WebGL en vitest) — cargar la partida, confirmar
  visualmente edificios con fachadas reales (no cajas lisas) y que
  `updateOcclusion` sigue aplanando sin errores de consola al mover la cámara
  detrás de un edificio alto. `npx tsc --noEmit` limpio.
- [x] **Step 5: Commit** — `feat: edificios de fondo con modelos reales de Kenney (Plan 6)`

---

### Task 2: Autos decorativos en las calles

**Files:**
- Create: `src/render/carsView.ts`
- Modify: `src/game/main.ts` (wiring)

**Interfaces:** Puramente decorativo — SIN colisión, SIN lógica de sim. Autos
estacionados en posiciones deterministas (derivadas de `city`, NUNCA
`Math.random` — este archivo vive en `src/render/`, pero mantener el mismo
hábito de determinismo del proyecto para que un desafío grabado se vea
idéntico). Reusar el patrón de `cargarModelosFondo` (Task 1) para cargar los
7 `.glb` de autos una vez; posicionar ~1-2 autos por cuadra en el borde de la
calle (offset fijo desde `corridorCenter`, `src/sim/cityGen.ts`), eligiendo
modelo por `(bloqueIndex % 7)`.

- [x] **Step 1: Implementar** (sin test unitario obligatorio — puramente
  visual/decorativo, sin función pura nueva de peso; si se extrae una función
  determinista de posición/modelo, testearla igual que `elegirModelo` arriba).
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — autos visibles en las calles,
  sin interferir con el movimiento de ciudadanos/zombis/agentes (son
  puramente visuales, sin AABB de colisión — confirmar que un ciudadano
  camina "a través" de un auto sin que nada crashee ni se vea raro de más:
  es una simplificación aceptada, documentar si el auto se ve muy invasivo).
- [x] **Step 4: Commit** — `feat: autos decorativos en las calles (Plan 6)`

---

### Task 3: Ciudadanos y zombis con silueta real (pose estática horneada)

**Files:**
- Create: `src/render/poseBake.ts` (utilidad de horneado), `src/render/personajesView.ts` (reemplaza a `citizensView.ts`)
- Modify: `src/game/main.ts` (wiring)
- Test: `tests/poseBake.test.ts` — NO ejecuta WebGL real; testea la matemática de skinning con datos sintéticos mínimos (ver abajo).

**El problema técnico (ya investigado, no redescubrir):** `THREE.InstancedMesh`
no soporta huesos por instancia — cada instancia comparte una sola
`geometry`. Para dibujar 800 ciudadanos en pocas llamadas de draw, hace falta
"hornear" (bake) la deformación del esqueleto en una posición fija UNA vez
(offline/al cargar), produciendo una `BufferGeometry` PLANA (sin huesos) que
sí se puede usar en `InstancedMesh` normal — exactamente el patrón ya usado
para las cápsulas hoy.

**Interfaces:**

```ts
// src/render/poseBake.ts
import * as THREE from 'three';

/**
 * Hornea la pose ACTUAL de un THREE.SkinnedMesh (tras posicionar su
 * AnimationMixer/Skeleton donde se quiera) en una BufferGeometry plana,
 * aplicando skinning lineal por vértice (misma fórmula que el vertex
 * shader estándar de Three.js para SkinnedMesh, hecha una vez en CPU).
 */
export function hornearPose(skinned: THREE.SkinnedMesh): THREE.BufferGeometry {
  skinned.skeleton.update();
  const geoOrig = skinned.geometry;
  const pos = geoOrig.attributes.position;
  const skinIndex = geoOrig.attributes.skinIndex;
  const skinWeight = geoOrig.attributes.skinWeight;
  const boneMatrices = skinned.skeleton.boneMatrices; // Float32Array, 16 por hueso

  const salida = new Float32Array(pos.count * 3);
  const vTmp = new THREE.Vector3();
  const vAcum = new THREE.Vector3();
  const m = new THREE.Matrix4();

  for (let i = 0; i < pos.count; i++) {
    vAcum.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const peso = skinWeight.getComponent(i, j);
      if (peso === 0) continue;
      const huesoIdx = skinIndex.getComponent(i, j);
      m.fromArray(boneMatrices, huesoIdx * 16);
      vTmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m);
      vAcum.addScaledVector(vTmp, peso);
    }
    salida[i * 3] = vAcum.x;
    salida[i * 3 + 1] = vAcum.y;
    salida[i * 3 + 2] = vAcum.z;
  }

  const geoHorneada = new THREE.BufferGeometry();
  geoHorneada.setAttribute('position', new THREE.BufferAttribute(salida, 3));
  if (geoOrig.attributes.uv) geoHorneada.setAttribute('uv', geoOrig.attributes.uv.clone());
  if (geoOrig.index) geoHorneada.setIndex(geoOrig.index.clone());
  geoHorneada.computeVertexNormals();
  return geoHorneada;
}
```

`skinned.skeleton.boneMatrices` ya incluye la transformación
bind-pose-inversa (`skeleton.boneInverses`) multiplicada — Three.js la
mantiene actualizada en `skeleton.update()`, así que la fórmula de arriba es
literalmente el linear blend skinning estándar, sin pasos extra. Para
hornear el bind pose (pose neutra "T-pose" o la de reposo del modelo, la más
simple y segura para un primer entregable — NO requiere reproducir ningún
frame de animación), basta con NO tocar la skeleton tras cargar el GLB
(`skeleton.boneMatrices` en su estado inicial ya es la bind pose) antes de
llamar `hornearPose`.

`personajesView.ts` — mismo esqueleto de clase que `citizensView.ts` actual
(pools por color/salud), pero con un `InstancedMesh` POR (piel × salud
relevante) en vez de uno solo compartido:

```ts
// Pools: una InstancedMesh por combinación piel+rol que puede aparecer.
// Ejemplo mínimo viable: 2 pieles de sobreviviente (sano/incubando) +
// 2 pieles de zombi (zombi/eliminado-oculto) = 4 InstancedMesh, cada
// ciudadano/zombi se dibuja en la pool que corresponde a su `salud` y a
// `citizen.id % 2` para variedad visual entre las 2 pieles de cada bando.
```

(El diseño detallado de las pools —cuántas, criterio de asignación,
manejo de agentes con su propio color de rol— es DECISIÓN DE IMPLEMENTACIÓN
de esta task: seguir el patrón de `citizensView.ts` actual línea por línea
donde aplique —parpadeo de caído, anillo de selección, oculto si eliminado—
y solo cambiar CÓMO se posiciona/colorea cada instancia, nunca la lógica de
qué citizen entra en qué estado.)

- [x] **Step 1: Test que falla — `tests/poseBake.test.ts`** (sin WebGL real; usa un `SkinnedMesh` sintético mínimo — 2 vértices, 2 huesos, para verificar la matemática sin depender de cargar un GLB):

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hornearPose } from '../src/render/poseBake';

describe('hornearPose', () => {
  it('con matrices de hueso identidad, la posición horneada es igual a la original', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([1, 2, 3, 4, 5, 6]), 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0], 4));
    const hueso = new THREE.Bone();
    const skeleton = new THREE.Skeleton([hueso]);
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    mesh.add(hueso);
    mesh.bind(skeleton);
    const horneada = hornearPose(mesh);
    const p = horneada.attributes.position;
    expect(p.getX(0)).toBeCloseTo(1);
    expect(p.getY(0)).toBeCloseTo(2);
    expect(p.getZ(0)).toBeCloseTo(3);
    expect(p.getX(1)).toBeCloseTo(4);
  });
});
```

- [x] **Step 2-4:** TDD para `hornearPose`; el resto (`personajesView.ts`,
  carga de GLB/pieles) se verifica en navegador — cargar partida, confirmar
  ciudadanos con silueta real (no cápsulas), colores/estados (incubando,
  zombi, caído, eliminado) siguen funcionando igual que antes, sin errores de
  consola, y el anillo de selección sigue apareciendo sobre el ciudadano
  correcto. Revisar la trampa YA CONOCIDA de `InstancedMesh` con `count`
  inicial (lección en CLAUDE.md: `boundingSphere` inválido si nace vacía) —
  aplica aquí igual que a `SplatsView`.
- [x] **Step 5: Commit** — `feat: ciudadanos y zombis con silueta real horneada de un solo frame (Plan 6)`

---

### Task 4: Verificación de rendimiento y cierre

**Files:** `CLAUDE.md` (lecciones), este plan (checkboxes), `docs/superpowers/specs/2026-07-05-pandemia-design.md` §8 (marcar nivel Media como entregado).

- [x] **Step 1:** `npm test` completo en verde, `npx tsc --noEmit` limpio.
- [x] **Step 2: Verificación de rendimiento en navegador** — partida completa
  con 800 ciudadanos + edificios/autos reales cargados: FPS estable (usar
  `javascript_tool`/eval para leer FPS real, NO confiar solo en percepción
  visual — lección ya en CLAUDE.md), memoria sin fuga tras ~2 min (Chrome
  DevTools Performance/Memory vía las herramientas de preview), sin errores
  de consola. Si el FPS cae de forma notable con los modelos reales vs. las
  cápsulas de antes, documentar el número exacto (antes/después) — no
  minimizar un problema real de rendimiento.
- [x] **Step 3: Cierre** — lecciones condensadas en CLAUDE.md (mantener el
  límite de ~10-11), checkboxes marcados, commit
  `chore: assets 3D reales verificados (Plan 6 completo)`, push.
