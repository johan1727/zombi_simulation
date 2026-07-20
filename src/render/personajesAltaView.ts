import * as THREE from 'three';
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Citizen } from '../sim/types';
import { INTERIOR } from '../sim/config';
import type { AssetsAnimacion } from './animacionAssets';
import {
  PIELES_DISPONIBLES,
  PARPADEO_FRAMES,
  colorFor,
  enMovimiento,
  pielActiva,
  type NombrePiel,
} from './personajesView';

/**
 * Nivel "Alta" del sistema de LOD de personajes (Plan 11 Task 2): un pool
 * ACOTADO de `THREE.SkinnedMesh` con huesos reales, animados por
 * `THREE.AnimationMixer`, asignados dinámicamente a los ciudadanos más
 * cercanos a la cámara. Todo lo demás sigue dibujándose por el pool barato
 * de `PersonajesView` (Plan 6/9) — este sistema solo AÑADE detalle encima
 * y expone (`update()` devuelve un `Set<number>`) qué ids cubrió este frame
 * para que `PersonajesView` los oculte y no se dibujen dos veces.
 */
export const RADIO_LOD = 30; // m: dentro de este radio de la cámara, esqueleto real.
export const MAX_SLOTS = 24; // tope duro de SkinnedMesh simultáneos (medir/ajustar en Task 3).

/** Duración del crossfade idle<->run al cambiar de pose (segundos). */
const CROSSFADE_SEGUNDOS = 0.2;

type Pose = 'idle' | 'run';

interface Slot {
  /** Raíz del clon completo de `escenaBase` (SkeletonUtils.clone) — cuelga de ella el Skeleton propio. */
  grupo: THREE.Object3D;
  skinned: THREE.SkinnedMesh;
  mixer: THREE.AnimationMixer;
  accionIdle: THREE.AnimationAction;
  accionRun: THREE.AnimationAction;
  /** null = slot libre. */
  ciudadanoId: number | null;
  /** Piel actualmente aplicada al material del slot; null si aún no se asignó ninguna. */
  pielActual: NombrePiel | null;
  poseActual: Pose;
  /** Último yaw calculado; se conserva cuando el ciudadano deja de moverse (dirX===dirZ===0). */
  yaw: number;
  /** Distancia² a la cámara de su ocupante ESTE frame; usada para decidir a quién "robarle" el slot. */
  distancia2: number;
}

/** Primer THREE.SkinnedMesh encontrado recorriendo la jerarquía de un clon (mismo
 * patrón que `encontrarSkinnedMesh` de `animacionAssets.ts`, no exportado desde ahí). */
function encontrarSkinnedMesh(raiz: THREE.Object3D): THREE.SkinnedMesh {
  let encontrado: THREE.SkinnedMesh | null = null;
  raiz.traverse((obj) => {
    if (encontrado === null && obj instanceof THREE.SkinnedMesh) encontrado = obj;
  });
  if (encontrado === null) throw new Error('El clon de escenaBase no contiene ningún SkinnedMesh');
  return encontrado;
}

/** El material de `survivor-base.glb` puede venir como array de 1 elemento o como
 * Material suelto (mismo hallazgo que ya documentó `cargarPersonajes`); normalizamos. */
function materialUnico(m: THREE.Material | THREE.Material[]): THREE.Material {
  return Array.isArray(m) ? m[0] : m;
}

function setWeight(accion: THREE.AnimationAction, peso: number): void {
  accion.enabled = true;
  accion.setEffectiveTimeScale(1);
  accion.setEffectiveWeight(peso);
}

/** Patrón estándar de crossfade de Three.js (webgl_animation_skinning_blending):
 * la acción entrante se activa a peso 1 y la saliente hace `crossFadeTo` hacia ella. */
function crossFade(saliente: THREE.AnimationAction, entrante: THREE.AnimationAction, duracion: number): void {
  setWeight(entrante, 1);
  entrante.time = 0;
  saliente.crossFadeTo(entrante, duracion, true);
}

/** Vuelve un slot a su estado "libre": pose base en idle sin crossfade (el
 * salto de pose no se ve, el slot está oculto), sin ciudadano asignado. */
function liberarSlot(slot: Slot): void {
  slot.ciudadanoId = null;
  slot.grupo.visible = false;
  setWeight(slot.accionIdle, 1);
  setWeight(slot.accionRun, 0);
  slot.accionIdle.time = 0;
  slot.accionRun.time = 0;
  slot.poseActual = 'idle';
}

function asignarSlot(slot: Slot, ciudadanoId: number, distancia2: number): void {
  slot.ciudadanoId = ciudadanoId;
  slot.distancia2 = distancia2;
  slot.grupo.visible = true;
}

const tmpColor = new THREE.Color();

export class PersonajesAltaView {
  private readonly slots: Slot[] = [];
  private frameCount = 0;

  constructor(scene: THREE.Scene, assets: AssetsAnimacion, private readonly materiales: Map<NombrePiel, THREE.Material>) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const grupo = clonarEsqueleto(assets.escenaBase) as THREE.Object3D;
      const skinned = encontrarSkinnedMesh(grupo);

      // Material PROPIO del slot (nunca el compartido de PersonajesView): el pool
      // barato tiñe cada instancia vía `instanceColor` sobre un material COMPARTIDO
      // por piel; un slot de esqueleto real es un Mesh normal (sin instancing), así
      // que si mutara ese material compartido (`material.color`) cambiaría el color
      // de TODAS las instancias del pool barato que usan esa piel al mismo tiempo.
      // Clonar el material ya construido de la primera piel (mapa+vertexColors ya
      // configurados por `cargarPersonajes`) le da a este slot un `.color`/`.map`
      // mutables sin pisar el pool barato; se re-clona si la piel cambia (ver update()).
      const materialInicial = materialUnico(materiales.get(PIELES_DISPONIBLES[0])!).clone();
      skinned.material = materialInicial;
      // Mismo motivo que en PersonajesView: evita sorpresas de frustum culling
      // con un boundingSphere calculado antes de que el objeto esté bien posicionado.
      skinned.frustumCulled = false;

      grupo.visible = false;
      scene.add(grupo);

      const mixer = new THREE.AnimationMixer(grupo);
      const accionIdle = mixer.clipAction(assets.clipIdle);
      const accionRun = mixer.clipAction(assets.clipRun);
      accionIdle.play();
      accionRun.play();
      setWeight(accionIdle, 1);
      setWeight(accionRun, 0);

      this.slots.push({
        grupo,
        skinned,
        mixer,
        accionIdle,
        accionRun,
        ciudadanoId: null,
        pielActual: null,
        poseActual: 'idle',
        yaw: 0,
        distancia2: Infinity,
      });
    }
  }

  /**
   * Devuelve el conjunto de `citizen.id` cubiertos ESTE frame por un slot de
   * esqueleto real — `main.ts` debe pasarlo a `PersonajesView.update` para que
   * oculte esas mismas instancias en su pool barato (evita doble-render).
   */
  update(citizens: Citizen[], alpha: number, tickCount: number, dtSegundos: number, camara: THREE.Camera): Set<number> {
    void tickCount; // el pool de esqueleto real no usa ciclos horneados por tick; el mixer corre en tiempo real.
    this.frameCount++;
    const parpadeoOculto = Math.floor(this.frameCount / PARPADEO_FRAMES) % 2 === 1;

    // 1) Filtro barato: candidatos vivos/visibles dentro de RADIO_LOD, por id -> dist2.
    const radio2 = RADIO_LOD * RADIO_LOD;
    const candidatosPorId = new Map<number, number>();
    for (const c of citizens) {
      if (c.salud === 'eliminado') continue;
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      const dx = x - camara.position.x;
      const dz = z - camara.position.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 <= radio2) candidatosPorId.set(c.id, dist2);
    }

    // 2) Slots ya ocupados: si su ciudadano sigue calificando, se reusa (evita "pop");
    //    si no, el slot queda libre. Los ids reusados se quitan de `candidatosPorId`
    //    para que el paso 3 solo vea a los "nuevos".
    for (const slot of this.slots) {
      if (slot.ciudadanoId === null) continue;
      const dist2 = candidatosPorId.get(slot.ciudadanoId);
      if (dist2 !== undefined) {
        slot.distancia2 = dist2;
        candidatosPorId.delete(slot.ciudadanoId);
      } else {
        liberarSlot(slot);
      }
    }

    // 3) Candidatos nuevos, más cercanos primero.
    const nuevos = Array.from(candidatosPorId.entries()).sort((a, b) => a[1] - b[1]);

    // 4) Asignar slots libres a los nuevos más cercanos.
    const libres = this.slots.filter((s) => s.ciudadanoId === null);
    let iNuevo = 0;
    while (iNuevo < nuevos.length && libres.length > 0) {
      const slot = libres.pop()!;
      const [id, dist2] = nuevos[iNuevo];
      asignarSlot(slot, id, dist2);
      iNuevo++;
    }

    // 5) Sin slots libres: robar el slot del ocupante MÁS LEJANO si un candidato
    //    nuevo está más cerca que él. `nuevos` está ordenado ascendente, así que en
    //    cuanto el candidato más cercano restante ya no gana al peor ocupante, ninguno
    //    de los siguientes (más lejanos aún) podría ganarle tampoco.
    while (iNuevo < nuevos.length) {
      let peor: Slot | null = null;
      for (const slot of this.slots) {
        if (slot.ciudadanoId === null) continue;
        if (peor === null || slot.distancia2 > peor.distancia2) peor = slot;
      }
      if (peor === null) break; // no debería pasar (implicaría slots libres sin asignar arriba)
      const [id, dist2] = nuevos[iNuevo];
      if (dist2 >= peor.distancia2) break;
      liberarSlot(peor);
      asignarSlot(peor, id, dist2);
      iNuevo++;
    }

    // 6) Actualizar cada slot ACTIVO: posición/orientación/mixer/piel/color.
    const cubiertos = new Set<number>();
    for (const slot of this.slots) {
      if (slot.ciudadanoId === null) continue;
      const c = citizens[slot.ciudadanoId];
      cubiertos.add(slot.ciudadanoId);

      const caido = c.salud === 'caido';
      const oculto = caido && parpadeoOculto;

      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      const baseY = 0.85 + c.piso * INTERIOR.alturaPiso;
      const y = caido ? baseY * 0.35 : baseY;
      let scaleY = 1;
      if (c.esAgente && c.salud !== 'zombi' && c.salud !== 'eliminado') {
        scaleY = caido ? 0.35 : 1.25;
      }

      if (c.dirX !== 0 || c.dirZ !== 0) slot.yaw = Math.atan2(c.dirX, c.dirZ);

      slot.grupo.position.set(x, y, z);
      slot.grupo.rotation.y = slot.yaw;
      slot.grupo.scale.set(1, scaleY, 1);
      slot.grupo.visible = !oculto;

      const poseDeseada: Pose = enMovimiento(c) ? 'run' : 'idle';
      if (slot.poseActual !== poseDeseada) {
        const saliente = slot.poseActual === 'run' ? slot.accionRun : slot.accionIdle;
        const entrante = poseDeseada === 'run' ? slot.accionRun : slot.accionIdle;
        crossFade(saliente, entrante, CROSSFADE_SEGUNDOS);
        slot.poseActual = poseDeseada;
      }

      const piel = pielActiva(c);
      if (slot.pielActual !== piel) {
        const base = materialUnico(this.materiales.get(piel)!);
        const anterior = slot.skinned.material as THREE.Material;
        const nuevo = base.clone();
        slot.skinned.material = nuevo;
        anterior.dispose();
        slot.pielActual = piel;
      }
      const mat = slot.skinned.material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
      tmpColor.setHex(colorFor(c));
      mat.color.copy(tmpColor);

      slot.mixer.update(dtSegundos);
    }

    return cubiertos;
  }
}
