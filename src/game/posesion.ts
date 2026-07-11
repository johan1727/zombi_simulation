import * as THREE from 'three';
import type { World } from '../sim/world';
import type { CameraRig } from '../render/cameraRig';
import { AGENTES, DT } from '../sim/config';

/**
 * Paso por tick de la orden 'control'. La fórmula del spec (~3 ticks adelante,
 * `AGENTES.velocidad * DT * 3` ≈ 0.22 m) queda POR DEBAJO de `AGENTES.llegadaOrden`
 * (0.6 m, T1): `updateAgente` la trataría como "ya llegada" el mismo tick en que se
 * encola y jamás movería al agente (se limpia `ordenX/ordenZ` sin llamar a
 * `moveWithSlide`). Se suma `AGENTES.llegadaOrden` como piso para que el punto
 * proyectado quede SIEMPRE fuera del radio de llegada — el agente avanza a
 * velocidad plena cada tick — conservando el resto (~3 ticks) como margen de
 * "coaster" al soltar las teclas (~0.1 s hasta detenerse, imperceptible).
 */
const PASO = AGENTES.llegadaOrden + AGENTES.velocidad * DT * 3;
const TECLAS_MOVIMIENTO = new Set(['w', 'a', 's', 'd']);
/** Duración del flash rojo al caer (debe coincidir con la transición CSS de #flash-caida). */
const FLASH_MS = 300;

/**
 * Posesión en tercera persona de un agente del jugador. WASD encola UNA
 * orden 'control' por tick de sim (misma cola determinista que el modo
 * director — este módulo NUNCA muta la sim). La cámara la gestiona
 * `CameraRig` (offset fijo + yaw suavizado); Posesion solo decide CUÁNDO
 * cambiar de modo, qué encolar y cuándo forzar la salida (caída).
 */
export class Posesion {
  activo = false;
  idAgente = -1;

  private readonly world: World;
  private readonly rig: CameraRig;
  private readonly canvas: HTMLCanvasElement;
  private readonly teclas = new Set<string>();

  private readonly raycaster = new THREE.Raycaster();
  private readonly suelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();

  private readonly flashEl: HTMLElement | null;
  private flashTimer: number | undefined;

  constructor(canvas: HTMLCanvasElement, rig: CameraRig, world: World) {
    this.canvas = canvas;
    this.rig = rig;
    this.world = world;
    this.flashEl = document.getElementById('flash-caida');

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (this.activo && TECLAS_MOVIMIENTO.has(k)) this.teclas.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (TECLAS_MOVIMIENTO.has(k)) this.teclas.delete(k);
    });
    window.addEventListener('blur', () => this.teclas.clear());

    canvas.addEventListener('pointerup', (e) => {
      if (!this.activo || e.button !== 0) return;
      const punto = this.raycastSuelo(e.clientX, e.clientY);
      if (!punto) return;
      this.world.encolarOrden({ agente: this.idAgente, tipo: 'habilidad', x: punto.x, z: punto.z });
    });
  }

  /** Entra en posesión de un agente vivo (id = índice en world.citizens). Sin efecto si no aplica. */
  activar(idAgente: number): void {
    if (this.activo) return;
    const a = this.world.citizens[idAgente];
    if (!a || !a.esAgente || a.salud !== 'sano') return;
    this.activo = true;
    this.idAgente = idAgente;
    this.teclas.clear();
    this.rig.entrarTercera(a.dirX, a.dirZ);
  }

  /** Sale de la posesión; la cámara vuelve al modo director enfocando al agente. */
  desactivar(): void {
    if (!this.activo) return;
    const a = this.world.citizens[this.idAgente];
    this.activo = false;
    this.idAgente = -1;
    this.teclas.clear();
    if (a) this.rig.volverADirector(a.x, a.z);
  }

  /** Llamado UNA vez por tick de sim, justo ANTES de `world.tick()`. */
  alTick(): void {
    if (!this.activo) return;
    const a = this.world.citizens[this.idAgente];
    if (!a || a.salud !== 'sano') {
      const cayo = !!a && a.salud === 'caido';
      this.desactivar();
      if (cayo) this.flashCaida();
      return;
    }
    const dir = this.direccionMundo();
    if (!dir) return; // sin teclas: no se encola nada, el agente frena solo (T1)
    this.world.encolarOrden({
      agente: this.idAgente,
      tipo: 'control',
      x: a.x + dir.x * PASO,
      z: a.z + dir.z * PASO,
    });
  }

  /** Llamado cada frame de render mientras `activo`: posiciona la cámara tras el agente. */
  actualizarCamara(alpha: number): void {
    const a = this.world.citizens[this.idAgente];
    if (!a) return;
    const px = a.prevX + (a.x - a.prevX) * alpha;
    const pz = a.prevZ + (a.z - a.prevZ) * alpha;
    this.rig.actualizarTercera(px, pz, a.dirX, a.dirZ);
  }

  /** WASD combinado con el yaw ACTUAL de cámara (adelante/derecha relativos a cámara). */
  private direccionMundo(): { x: number; z: number } | null {
    if (this.teclas.size === 0) return null;
    const yaw = this.rig.yawCamaraTercera;
    const sen = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // adelante = (sen, cos) — igual que CameraRig.actualizarTercera.
    // derecha = cross(adelante, arriba) en three.js = (-cos, sen).
    let dx = 0;
    let dz = 0;
    if (this.teclas.has('w')) {
      dx += sen;
      dz += cos;
    }
    if (this.teclas.has('s')) {
      dx -= sen;
      dz -= cos;
    }
    if (this.teclas.has('d')) {
      dx -= cos;
      dz += sen;
    }
    if (this.teclas.has('a')) {
      dx += cos;
      dz -= sen;
    }
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) return null;
    return { x: dx / d, z: dz / d };
  }

  private raycastSuelo(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const golpe = this.raycaster.ray.intersectPlane(this.suelo, this.hit);
    if (!golpe) return null;
    return { x: this.hit.x, z: this.hit.z };
  }

  private flashCaida(): void {
    if (!this.flashEl) return;
    this.flashEl.classList.add('activo');
    if (this.flashTimer !== undefined) window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.flashEl?.classList.remove('activo'), FLASH_MS);
  }
}
