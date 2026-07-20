import * as THREE from 'three';
import type { Citizen, RolAgente, Salud } from '../sim/types';
import { INTERIOR } from '../sim/config';
import { hornearPose, hornearCiclo } from './poseBake';
import { cargarAssetsAnimacion, type AssetsAnimacion } from './animacionAssets';

const COLORES: Record<Salud, number> = {
  sano: 0x9fd8ff,
  incubando: 0xffc46b,
  zombi: 0x8bff5a,
  eliminado: 0x8bff5a,
  caido: 0xffffff, // sin uso real: los agentes caídos toman color de rol (ver colorFor)
};

/** Color propio por rol de agente; sustituye al color por salud salvo zombi/eliminado. */
const ROL_COLORES: Record<Exclude<RolAgente, ''>, number> = {
  policia: 0x4d9bff,
  paramedico: 0xff5d5d,
  megafono: 0xffd23e,
  obrero: 0xff9430,
};

/** La marca del paramédico sobre un incubando diagnosticado. */
const COLOR_DIAGNOSTICADO = 0xff3ea5;

/** Cada cuántos frames de render alterna visible/oculto un agente caído.
 * Exportado para que `PersonajesAltaView` (Plan 11 Task 2) parpadee sus
 * slots de esqueleto real con la MISMA cadencia — ambos incrementan su
 * propio contador una vez por frame de render, así que se mantienen
 * sincronizados mientras ambos `update()` se llamen una vez por frame. */
export const PARPADEO_FRAMES = 15;

/**
 * Exportado para Plan 11 Task 2 (`personajesAltaView.ts`): el pool de
 * esqueletos reales debe teñir sus slots con el MISMO criterio de color que
 * el pool barato, no inventar uno nuevo.
 */
export function colorFor(c: Citizen): number {
  if (c.esAgente && c.salud !== 'zombi' && c.salud !== 'eliminado') {
    return ROL_COLORES[c.rolAgente as Exclude<RolAgente, ''>];
  }
  if (c.salud === 'incubando' && c.diagnosticadoTicks > 0) return COLOR_DIAGNOSTICADO;
  return COLORES[c.salud];
}

/**
 * Diseño de pools (Plan 6 Task 3, ver p6-task-3-report.md para la
 * justificación completa): `THREE.InstancedMesh` no soporta huesos por
 * instancia, así que se hornea UNA sola geometría plana (bind pose de
 * `survivor-base.glb`, vía `hornearPose`) y se reutiliza en 4 `InstancedMesh`
 * — una por piel — en vez de un único mesh con color dinámico. El estado
 * (`Salud`) sigue viniendo 100% de `world.citizens`; lo único que cambia es
 * EN CUÁL de los 4 pools se dibuja cada ciudadano y qué tinte de color recibe
 * (mismo `colorFor` de siempre, ahora multiplicado sobre la textura de piel
 * en vez de sobre una cápsula blanca lisa).
 *
 * Subconjunto de pieles elegido (de las 8 disponibles en
 * `public/models/personajes/skins/`): 2 de sobreviviente
 * (`survivorFemaleA`, `survivorMaleB`) + 2 de zombi (`zombieFemaleA`,
 * `zombieMaleA`) — el mínimo viable que pide el brief. Las 4 restantes
 * (`humanFemaleA`, `humanMaleA`, `zombieA`, `zombieC`, pensadas para
 * `retro-base.glb`, un segundo modelo que esta task NO carga) quedan sin
 * usar; variedad adicional es una mejora futura, no bloqueante aquí.
 */
export const PIELES_DISPONIBLES = [
  'survivorFemaleA',
  'survivorMaleB',
  'zombieFemaleA',
  'zombieMaleA',
] as const;
export type NombrePiel = (typeof PIELES_DISPONIBLES)[number];

type GrupoPiel = 'sobreviviente' | 'zombi';

/** Sano/incubando/caído (agente derribado, aún humano) usan el bando "sobreviviente";
 * zombi/eliminado usan el bando "zombi" (eliminado reutiliza el pool de zombi porque,
 * igual que en `citizensView.ts`, su color siempre coincidía con el de zombi). */
function grupoPiel(c: Citizen): GrupoPiel {
  return c.salud === 'zombi' || c.salud === 'eliminado' ? 'zombi' : 'sobreviviente';
}

const PIELES_POR_GRUPO: Record<GrupoPiel, readonly [NombrePiel, NombrePiel]> = {
  sobreviviente: ['survivorFemaleA', 'survivorMaleB'],
  zombi: ['zombieFemaleA', 'zombieMaleA'],
};

/**
 * Piel activa de un ciudadano: determinista por `citizen.id % 2` dentro de
 * su bando actual (sin `Math.random`, mismo espíritu que `elegirModelo` de
 * `buildingModels.ts`). Los agentes del jugador NO tienen piel dedicada:
 * comparten estas 2 pieles de sobreviviente con los civiles (decisión
 * documentada en el reporte) y se distinguen visualmente por el tinte de
 * `ROL_COLORES` en `colorFor`, igual que ya hacían sobre la cápsula lisa.
 */
/** Exportado por el mismo motivo que `colorFor` (ver comentario arriba). */
export function pielActiva(c: Citizen): NombrePiel {
  return PIELES_POR_GRUPO[grupoPiel(c)][c.id % 2];
}

/**
 * Ciclo de poses (Plan 9 Task 2): cada ciudadano se dibuja en exactamente
 * un pool `(piel, pose, frame)` por frame de render. Ver Meta del plan
 * sobre por qué "run" cubre toda marcha/huida/posesión (no hay clip de
 * "walk" propio) y por qué la cojera ralentiza "run" en vez de usar un
 * clip dedicado.
 */
type Pose = 'idle' | 'run';

function claveMesh(piel: NombrePiel, pose: Pose, frame: number): string {
  return `${piel}:${pose}:${frame}`;
}

/** true si el ciudadano se está moviendo (mismo criterio que el resto del render).
 * Exportado por el mismo motivo que `colorFor` (ver comentario arriba). */
export function enMovimiento(c: Citizen): boolean {
  return c.dirX !== 0 || c.dirZ !== 0;
}

/** Ticks de sim por frame de animación en pose "run" (30 tps / 6 ≈ 5 fps de ciclo). */
const CICLO_TICKS = 6;

/**
 * Pose y frame activos de un ciudadano en un tick dado. Determinista: sin
 * `Math.random`, el desfase `c.id * 7` desincroniza a los ciudadanos entre
 * sí (mismo espíritu que `c.id % 2` de `pielActiva`). Los agentes caídos
 * quedan en 'idle' (cualquier frame sirve: el cuerpo se aplana con
 * `scaleY = 0.35` en `update()`, no tiene sentido animar un ciclo de
 * marcha tumbado).
 */
function poseYFrame(c: Citizen, tickCount: number): { pose: Pose; frame: number } {
  if (!enMovimiento(c) || c.salud === 'caido') {
    return { pose: 'idle', frame: (tickCount + c.id) % FRAMES_IDLE };
  }
  // Cojera: ciclo de "run" a la mitad de velocidad (aproximación sin clip propio, ver Meta).
  const factorCojera = c.zonaHerida === 'pierna' ? 2 : 1;
  const fase = Math.floor((tickCount + c.id * 7) / (CICLO_TICKS * factorCojera));
  return { pose: 'run', frame: fase % FRAMES_RUN };
}

export interface PersonajesAssets {
  geometria: THREE.BufferGeometry;
  geometriaIdle: THREE.BufferGeometry[]; // FRAMES_IDLE elementos
  geometriaRun: THREE.BufferGeometry[]; // FRAMES_RUN elementos
  materiales: Map<NombrePiel, THREE.Material>;
  /**
   * Assets crudos (sin hornear) de `animacionAssets.ts`, cargados por la
   * misma llamada de red que ya trajo `geometria*`/`materiales` — expuestos
   * aquí para que Plan 11 Task 2 (pool de esqueletos reales) los reuse sin
   * volver a pedir los mismos 3 `.glb` por HTTP. No los usa el pipeline de
   * horneado (Plan 9) después de construirse este objeto.
   */
  crudos: AssetsAnimacion;
}

/** Cuántos frames se hornean por ciclo (Plan 9 Task 1: usados recién en Task 2). */
export const FRAMES_IDLE = 4;
export const FRAMES_RUN = 8;

/**
 * Carga `survivor-base.glb` UNA vez, hornea su bind pose (pose neutra: no se
 * toca la skeleton tras cargar, así que `skeleton.boneMatrices` ya está en
 * bind pose) en una `BufferGeometry` plana, y prepara un material por piel
 * (clonado del material base "skin" del GLB — confirmado sin `map` propio,
 * ver investigación de la task — con la textura de piel correspondiente
 * asignada). La geometría horneada es la MISMA para las 4 pieles: solo
 * cambia el material/textura.
 *
 * Además carga `survivor-anim-{idle,run}.glb` para sus `AnimationClip` y
 * hornea `FRAMES_IDLE`/`FRAMES_RUN` frames de cada uno vía `hornearCiclo`.
 * Hallazgo de verificación en navegador (Plan 9 Task 1, desviación del
 * plan): a diferencia de lo asumido en el plan, estos GLB de animación NO
 * traen su propio `SkinnedMesh` — son solo esqueleto + clips (patrón típico
 * de packs de animación tipo Mixamo/Kenney pensados para RETARGETING). Por
 * eso `hornearCiclo` se llama con el `root`/`skinned` de `survivor-base.glb`
 * (el único mesh real) y el `clip` sacado del GLB de animación — el
 * `AnimationMixer` conecta los tracks del clip a los huesos del esqueleto
 * base por NOMBRE (confirmado: ambos rigs comparten los mismos nombres de
 * hueso, p.ej. `LeftForeArm`), sin que haga falta un `SkinnedMesh` propio en
 * el GLB de animación. Esto también hace irrelevante la preocupación
 * original del plan sobre "coincidencia de topología de vértices" entre
 * `survivor-base.glb` y los GLB de animación: como ambos ciclos se hornean
 * sobre la MISMA geometría/skinIndex/skinWeight de `survivor-base.glb`, el
 * conteo de vértices coincide por construcción (ver verificación abajo).
 *
 * La carga en sí (los 3 `loader.loadAsync`) vive en `animacionAssets.ts`
 * (Plan 11 Task 1: extraída de aquí para que el pool de esqueletos reales,
 * Task 2, pueda reusar los mismos assets crudos sin duplicar la petición de
 * red) — esta función solo hornea sobre lo que esa carga devuelve.
 */
export async function cargarPersonajes(): Promise<PersonajesAssets> {
  const crudos = await cargarAssetsAnimacion();
  const { escenaBase, skinnedBase, clipIdle, clipRun } = crudos;

  const geometria = hornearPose(skinnedBase);
  // root/skinned SIEMPRE los de survivor-base.glb (ver comentario arriba):
  // los GLB de animación no traen mesh propio, solo el clip a retargetear.
  const geometriaIdle = hornearCiclo(escenaBase, skinnedBase, clipIdle, FRAMES_IDLE);
  const geometriaRun = hornearCiclo(escenaBase, skinnedBase, clipRun, FRAMES_RUN);

  const materialBase = Array.isArray(skinnedBase.material) ? skinnedBase.material[0] : skinnedBase.material;
  const textureLoader = new THREE.TextureLoader();
  const materiales = new Map<NombrePiel, THREE.Material>();
  await Promise.all(
    PIELES_DISPONIBLES.map(async (nombre) => {
      const textura = await textureLoader.loadAsync(`/models/personajes/skins/${nombre}.png`);
      textura.colorSpace = THREE.SRGBColorSpace;
      const material = materialBase.clone();
      (material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial).map = textura;
      material.needsUpdate = true;
      materiales.set(nombre, material);
    })
  );

  return { geometria, geometriaIdle, geometriaRun, materiales, crudos };
}

export class PersonajesView {
  /** Un InstancedMesh por combinación (piel, pose, frame): 4 × (FRAMES_IDLE + FRAMES_RUN) = 48. */
  private readonly meshes: Map<string, THREE.InstancedMesh>;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private readonly cacheClave: Array<string | null>;
  private readonly cacheColor: Array<number | null>;
  private readonly ring: THREE.Mesh;
  private frameCount = 0;

  constructor(scene: THREE.Scene, count: number, assets: PersonajesAssets) {
    this.meshes = new Map();
    for (const nombre of PIELES_DISPONIBLES) {
      const material = assets.materiales.get(nombre);
      if (!material) throw new Error(`Falta el material de la piel: ${nombre}`);
      const geometriasPorPose: Array<[Pose, THREE.BufferGeometry[]]> = [
        ['idle', assets.geometriaIdle],
        ['run', assets.geometriaRun],
      ];
      for (const [pose, geometrias] of geometriasPorPose) {
        for (let frame = 0; frame < geometrias.length; frame++) {
          const mesh = new THREE.InstancedMesh(geometrias[frame], material, count);
          // Trampa conocida (CLAUDE.md, lección de SplatsView): con `count` fijo
          // pero no todas las instancias usadas cada frame (la mayoría ocultas
          // con escala ~0 salvo en su pool activo), el boundingSphere del primer
          // render puede quedar inválido y recortar instancias reales del
          // frustum. `frustumCulled = false` evita el problema por completo.
          mesh.frustumCulled = false;
          scene.add(mesh);
          this.meshes.set(claveMesh(nombre, pose, frame), mesh);
        }
      }
    }
    this.cacheClave = new Array<string | null>(count).fill(null);
    this.cacheColor = new Array<number | null>(count).fill(null);

    const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  /**
   * `ocultosPorAlta` (Plan 11 Task 2): ids de ciudadano cubiertos ESTE frame
   * por un slot de esqueleto real (`PersonajesAltaView`) — se fuerzan a
   * escala 0 en TODAS sus combinaciones piel/pose/frame para no dibujarlos
   * dos veces (silueta duplicada, pool barato + esqueleto real superpuestos).
   */
  update(
    citizens: Citizen[],
    alpha: number,
    seleccionado: number,
    tickCount: number,
    ocultosPorAlta?: Set<number>
  ): void {
    this.frameCount++;
    const parpadeoOculto = Math.floor(this.frameCount / PARPADEO_FRAMES) % 2 === 1;
    const clavesSucias = new Set<string>();

    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i];
      const caido = c.salud === 'caido';
      const oculto =
        c.salud === 'eliminado' || (caido && parpadeoOculto) || (ocultosPorAlta?.has(c.id) ?? false);
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      const baseY = 0.85 + c.piso * INTERIOR.alturaPiso;
      const y = caido ? baseY * 0.35 : baseY;
      let scaleY = 1;
      if (c.esAgente && c.salud !== 'zombi' && c.salud !== 'eliminado') {
        scaleY = caido ? 0.35 : 1.25;
      }

      const piel = pielActiva(c);
      const { pose, frame } = poseYFrame(c, tickCount);
      const clave = claveMesh(piel, pose, frame);
      for (const [claveMeshActual, mesh] of this.meshes) {
        this.dummy.position.set(x, y, z);
        if (claveMeshActual === clave && !oculto) this.dummy.scale.set(1, scaleY, 1);
        else this.dummy.scale.set(0.0001, 0.0001, 0.0001);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }

      const color = colorFor(c);
      if (this.cacheClave[i] !== clave || this.cacheColor[i] !== color) {
        this.cacheClave[i] = clave;
        this.cacheColor[i] = color;
        this.tmp.setHex(color);
        this.meshes.get(clave)!.setColorAt(i, this.tmp);
        clavesSucias.add(clave);
      }
    }

    for (const [clave, mesh] of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (clavesSucias.has(clave) && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    if (
      seleccionado >= 0 &&
      citizens[seleccionado] &&
      citizens[seleccionado].salud !== 'eliminado' &&
      citizens[seleccionado].salud !== 'zombi'
    ) {
      const c = citizens[seleccionado];
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      this.ring.visible = true;
      this.ring.position.set(x, 0.05, z);
    } else {
      this.ring.visible = false;
    }
  }
}
