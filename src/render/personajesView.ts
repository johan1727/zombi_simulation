import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Citizen, RolAgente, Salud } from '../sim/types';
import { INTERIOR } from '../sim/config';
import { hornearPose } from './poseBake';

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

/** Cada cuántos frames de render alterna visible/oculto un agente caído. */
const PARPADEO_FRAMES = 15;

function colorFor(c: Citizen): number {
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
function pielActiva(c: Citizen): NombrePiel {
  return PIELES_POR_GRUPO[grupoPiel(c)][c.id % 2];
}

export interface PersonajesAssets {
  geometria: THREE.BufferGeometry;
  materiales: Map<NombrePiel, THREE.Material>;
}

/**
 * Carga `survivor-base.glb` UNA vez, hornea su bind pose (pose neutra: no se
 * toca la skeleton tras cargar, así que `skeleton.boneMatrices` ya está en
 * bind pose) en una `BufferGeometry` plana, y prepara un material por piel
 * (clonado del material base "skin" del GLB — confirmado sin `map` propio,
 * ver investigación de la task — con la textura de piel correspondiente
 * asignada). La geometría horneada es la MISMA para las 4 pieles: solo
 * cambia el material/textura.
 */
export async function cargarPersonajes(): Promise<PersonajesAssets> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/models/personajes/survivor-base.glb');

  let encontrado: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((obj) => {
    if (encontrado === null && obj instanceof THREE.SkinnedMesh) {
      encontrado = obj;
    }
  });
  if (encontrado === null) {
    throw new Error('survivor-base.glb no contiene ningún SkinnedMesh');
  }
  const skinned: THREE.SkinnedMesh = encontrado;
  const geometria = hornearPose(skinned);

  const materialBase = Array.isArray(skinned.material) ? skinned.material[0] : skinned.material;
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

  return { geometria, materiales };
}

export class PersonajesView {
  private readonly meshes: Map<NombrePiel, THREE.InstancedMesh>;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private readonly cachePiel: Array<NombrePiel | null>;
  private readonly cacheColor: Array<number | null>;
  private readonly ring: THREE.Mesh;
  private frameCount = 0;

  constructor(scene: THREE.Scene, count: number, assets: PersonajesAssets) {
    this.meshes = new Map();
    for (const nombre of PIELES_DISPONIBLES) {
      const material = assets.materiales.get(nombre);
      if (!material) throw new Error(`Falta el material de la piel: ${nombre}`);
      const mesh = new THREE.InstancedMesh(assets.geometria, material, count);
      // Trampa conocida (CLAUDE.md, lección de SplatsView): con `count` fijo
      // pero no todas las instancias usadas cada frame (la mayoría ocultas
      // con escala ~0 salvo en su pool activo), el boundingSphere del primer
      // render puede quedar inválido y recortar instancias reales del
      // frustum. `frustumCulled = false` evita el problema por completo.
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.set(nombre, mesh);
    }
    this.cachePiel = new Array<NombrePiel | null>(count).fill(null);
    this.cacheColor = new Array<number | null>(count).fill(null);

    const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  update(citizens: Citizen[], alpha: number, seleccionado: number): void {
    this.frameCount++;
    const parpadeoOculto = Math.floor(this.frameCount / PARPADEO_FRAMES) % 2 === 1;
    const pielesSucias = new Set<NombrePiel>();

    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i];
      const caido = c.salud === 'caido';
      const oculto = c.salud === 'eliminado' || (caido && parpadeoOculto);
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      const baseY = 0.85 + c.piso * INTERIOR.alturaPiso;
      const y = caido ? baseY * 0.35 : baseY;
      let scaleY = 1;
      if (c.esAgente && c.salud !== 'zombi' && c.salud !== 'eliminado') {
        scaleY = caido ? 0.35 : 1.25;
      }

      const piel = pielActiva(c);
      for (const nombre of PIELES_DISPONIBLES) {
        const mesh = this.meshes.get(nombre)!;
        this.dummy.position.set(x, y, z);
        if (nombre === piel && !oculto) this.dummy.scale.set(1, scaleY, 1);
        else this.dummy.scale.set(0.0001, 0.0001, 0.0001);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }

      const color = colorFor(c);
      if (this.cachePiel[i] !== piel || this.cacheColor[i] !== color) {
        this.cachePiel[i] = piel;
        this.cacheColor[i] = color;
        this.tmp.setHex(color);
        this.meshes.get(piel)!.setColorAt(i, this.tmp);
        pielesSucias.add(piel);
      }
    }

    for (const [nombre, mesh] of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (pielesSucias.has(nombre) && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
