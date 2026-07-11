import * as THREE from 'three';
import type { Citizen, RolAgente, Salud } from '../sim/types';
import { INTERIOR } from '../sim/config';

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

export class CitizensView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private readonly colorCache: Array<number | null>;
  private readonly ring: THREE.Mesh;
  private frameCount = 0;

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.CapsuleGeometry(0.3, 1.1, 3, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.colorCache = new Array<number | null>(count).fill(null);
    scene.add(this.mesh);

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
    let colorSucio = false;
    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i];
      const caido = c.salud === 'caido';
      const oculto = c.salud === 'eliminado' || (caido && parpadeoOculto);
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      const baseY = 0.85 + c.piso * INTERIOR.alturaPiso;
      const y = caido ? baseY * 0.35 : baseY;
      this.dummy.position.set(x, y, z);
      let scaleY = 1;
      if (c.esAgente && c.salud !== 'zombi' && c.salud !== 'eliminado') {
        scaleY = caido ? 0.35 : 1.25;
      }
      if (oculto) this.dummy.scale.set(0.0001, 0.0001, 0.0001);
      else this.dummy.scale.set(1, scaleY, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      const color = colorFor(c);
      if (this.colorCache[i] !== color) {
        this.colorCache[i] = color;
        this.tmp.setHex(color);
        this.mesh.setColorAt(i, this.tmp);
        colorSucio = true;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorSucio && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

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
