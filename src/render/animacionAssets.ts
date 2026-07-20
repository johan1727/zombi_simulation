import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Primer THREE.SkinnedMesh encontrado recorriendo la jerarquía de una escena GLTF. */
function encontrarSkinnedMesh(escena: THREE.Object3D): THREE.SkinnedMesh {
  let encontrado: THREE.SkinnedMesh | null = null;
  escena.traverse((obj) => {
    if (encontrado === null && obj instanceof THREE.SkinnedMesh) {
      encontrado = obj;
    }
  });
  if (encontrado === null) {
    throw new Error('El GLB no contiene ningún SkinnedMesh');
  }
  return encontrado;
}

/**
 * Elige, de la lista de `AnimationClip` de un GLB de animación, el que
 * corresponde al ciclo real (por nombre, insensible a mayúsculas). Hallazgo
 * de verificación en navegador (Plan 9 Task 1): `survivor-anim-idle.glb`/
 * `survivor-anim-run.glb` traen DOS clips cada uno — `animations[0]` es
 * `"Root|0.Targeting Pose"` (una pose estática de referencia, no el ciclo) y
 * el segundo es el ciclo real (`"Root|Idle"`/`"Root|Run"`) — así que el plan
 * original (asumir `animations[0]`) era incorrecto para este asset; se busca
 * por nombre en vez de asumir un índice fijo, con el último clip como
 * fallback si ningún nombre calza.
 */
function elegirClip(clips: THREE.AnimationClip[], palabraClave: string): THREE.AnimationClip {
  const porNombre = clips.find((c) => c.name.toLowerCase().includes(palabraClave));
  if (porNombre) return porNombre;
  const ultimo = clips[clips.length - 1];
  if (!ultimo) throw new Error(`No se encontró ningún AnimationClip (buscando "${palabraClave}")`);
  return ultimo;
}

/**
 * Assets crudos (sin hornear) compartidos por los dos consumidores de
 * animación de personajes (Plan 11):
 * - `poseBake.ts`/`personajesView.ts` (Plan 9) los hornea en geometría
 *   plana para los pools `InstancedMesh` (ciudadanos lejos de la cámara).
 * - El pool de esqueletos reales (Plan 11 Task 2, `personajesAltaView.ts`)
 *   los usa en vivo: `skinnedBase` como plantilla para clonar un
 *   `SkinnedMesh` con huesos propios por slot, y `clipIdle`/`clipRun` como
 *   entrada de un `THREE.AnimationMixer` por slot.
 *
 * Decisión documentada para esa Task 2 (investigada aquí para no bloquear
 * su implementación): clonar `skinnedBase` con `.clone()` nativo de Three.js
 * NO sirve — `Object3D.clone()` copia la jerarquía de huesos como objetos
 * nuevos pero el `SkinnedMesh` clonado sigue referenciando el `Skeleton`
 * ORIGINAL (mismo `skeleton.bones`), así que animar un clon movería TODOS
 * los clones a la vez (comparten huesos). `THREE.SkeletonUtils.clone()`
 * (`three/examples/jsm/utils/SkeletonUtils.js`, confirmado presente en
 * `node_modules/three` de este proyecto) existe exactamente para este caso:
 * reconstruye el árbol de huesos y crea un `Skeleton` independiente por
 * clon, re-enlazando el `skinIndex` del mesh clonado a los huesos nuevos.
 * Es el patrón estándar de Three.js para "N copias animadas de forma
 * independiente del mismo rig" (mismo problema que instanciar personajes
 * con animación distinta por instancia). Task 2 debe importar
 * `SkeletonUtils` y usar `SkeletonUtils.clone(escenaBase)` (clona la escena
 * completa, no solo el mesh, porque el esqueleto cuelga de la jerarquía de
 * la escena) para obtener cada slot, en vez de `escenaBase.clone()`.
 */
export interface AssetsAnimacion {
  /** Raíz de la escena de `survivor-base.glb` — con la que corre el AnimationMixer del horneado (Plan 9) y la que Task 2 debe pasar a `SkeletonUtils.clone()` (no solo el mesh) para clonar esqueleto incluido. */
  escenaBase: THREE.Group;
  /** Único SkinnedMesh de `survivor-base.glb`; NUNCA se anima directamente (Plan 9 lo hornea, Task 2 debe clonarlo vía SkeletonUtils antes de animar). */
  skinnedBase: THREE.SkinnedMesh;
  clipIdle: THREE.AnimationClip;
  clipRun: THREE.AnimationClip;
}

/**
 * Carga `survivor-base.glb` + `survivor-anim-idle.glb` + `survivor-anim-run.glb`
 * UNA sola vez (antes esto vivía inline en `personajesView.ts::cargarPersonajes`,
 * Plan 9) y devuelve los assets crudos sin hornear. Único punto de red para
 * estos 3 `.glb`: tanto el pipeline de horneado (Plan 9) como el pool de
 * esqueletos reales (Plan 11) deben pasar por aquí en vez de volver a
 * llamar `GLTFLoader.loadAsync` sobre los mismos archivos.
 *
 * Hallazgo de Plan 9 Task 1 que sigue aplicando: los GLB de animación NO
 * traen su propio `SkinnedMesh` (solo esqueleto + clips, patrón de pack de
 * animación tipo Mixamo/Kenney para RETARGETING) — el `SkinnedMesh` real es
 * siempre el de `survivor-base.glb`; los clips se aplican sobre sus huesos
 * por nombre.
 */
export async function cargarAssetsAnimacion(): Promise<AssetsAnimacion> {
  const loader = new GLTFLoader();
  const gltfBase = await loader.loadAsync('/models/personajes/survivor-base.glb');

  const skinnedBase = encontrarSkinnedMesh(gltfBase.scene);

  const [gltfIdle, gltfRun] = await Promise.all([
    loader.loadAsync('/models/personajes/survivor-anim-idle.glb'),
    loader.loadAsync('/models/personajes/survivor-anim-run.glb'),
  ]);

  if (gltfIdle.animations.length === 0) {
    throw new Error('survivor-anim-idle.glb no contiene ningún AnimationClip');
  }
  if (gltfRun.animations.length === 0) {
    throw new Error('survivor-anim-run.glb no contiene ningún AnimationClip');
  }
  const clipIdle = elegirClip(gltfIdle.animations, 'idle');
  const clipRun = elegirClip(gltfRun.animations, 'run');

  return { escenaBase: gltfBase.scene, skinnedBase, clipIdle, clipRun };
}
