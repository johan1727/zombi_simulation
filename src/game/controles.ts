import * as THREE from 'three';
import type { World } from '../sim/world';

/** Distancia máxima (m) para que un click sobre el suelo seleccione un agente. */
const SELECCION_RADIO = 1.5;
/** Umbral de arrastre en píxeles: por encima de esto, un down/up es drag de cámara, no click. */
const DRAG_UMBRAL_PX = 6;

export interface ControlesCallbacks {
  /** Se llama cuando cambia el agente seleccionado (-1 si se deselecciona). */
  onSeleccion?: (idx: number) => void;
  /** Doble click sobre un agente vivo, o tecla E con uno seleccionado: pide poseerlo. */
  onPoseer?: (idx: number) => void;
  /** Escape mientras se posee: sale de la posesión (en vez de deseleccionar). */
  onEscapePosesion?: () => void;
  /** true mientras la posesión está activa — Controles cede clicks y teclas a Posesion. */
  estaPoseido?: () => boolean;
}

/**
 * Selección y órdenes del jugador en "modo director": click para seleccionar
 * agentes y moverlos, teclas 1-4 para seleccionar por índice, Q/botón para
 * armar el modo habilidad, Escape para deseleccionar. Toda orden entra por
 * `world.encolarOrden` — este módulo NUNCA muta la sim directamente.
 */
export class Controles {
  seleccionado: number = -1;
  modoHabilidad = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: World;
  private readonly callbacks: ControlesCallbacks;

  private readonly raycaster = new THREE.Raycaster();
  private readonly suelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();

  private leftDown = false;
  private downPos = { x: 0, y: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.PerspectiveCamera,
    world: World,
    callbacks: ControlesCallbacks = {}
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.world = world;
    this.callbacks = callbacks;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.leftDown = true;
      this.downPos = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.leftDown) return;
      this.leftDown = false;
      const dx = e.clientX - this.downPos.x;
      const dz = e.clientY - this.downPos.y;
      if (Math.sqrt(dx * dx + dz * dz) > DRAG_UMBRAL_PX) return; // fue drag de cámara, no click
      if (this.callbacks.estaPoseido?.()) return; // Posesion maneja sus propios clicks
      this.manejarClick(e.clientX, e.clientY);
    });
    canvas.addEventListener('dblclick', (e) => {
      if (this.callbacks.estaPoseido?.()) return;
      const punto = this.raycastSuelo(e.clientX, e.clientY);
      if (!punto) return;
      const idx = this.agenteVivoEn(punto.x, punto.z);
      if (idx >= 0) this.callbacks.onPoseer?.(idx);
    });
    window.addEventListener('keydown', (e) => {
      const poseido = this.callbacks.estaPoseido?.() ?? false;
      if (e.key === 'Escape') {
        if (poseido) this.callbacks.onEscapePosesion?.();
        else this.deseleccionar();
        return;
      }
      if (poseido) return; // WASD y clicks los maneja Posesion mientras se posee
      if (e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key) - 1;
        const agentes = this.world.agentes;
        if (idx < agentes.length) this.seleccionar(agentes[idx].id);
      } else if (e.key === 'q' || e.key === 'Q') {
        if (this.seleccionado >= 0) this.modoHabilidad = !this.modoHabilidad;
      } else if (e.key === 'e' || e.key === 'E') {
        if (this.seleccionado >= 0) this.callbacks.onPoseer?.(this.seleccionado);
      }
    });
  }

  /** Selecciona un agente por índice en `world.citizens` (usado por teclas y panel). */
  seleccionar(idx: number): void {
    this.seleccionado = idx;
    this.modoHabilidad = false;
    this.callbacks.onSeleccion?.(idx);
  }

  /** Arma el modo habilidad para el agente seleccionado (usado por Q y el botón del panel). */
  activarModoHabilidad(): void {
    if (this.seleccionado < 0) return;
    this.modoHabilidad = true;
  }

  private deseleccionar(): void {
    this.seleccionado = -1;
    this.modoHabilidad = false;
    this.callbacks.onSeleccion?.(-1);
  }

  private manejarClick(clientX: number, clientY: number): void {
    const punto = this.raycastSuelo(clientX, clientY);
    if (!punto) return;

    const idx = this.agenteVivoEn(punto.x, punto.z);
    if (idx >= 0) {
      this.seleccionar(idx);
      return;
    }
    if (this.seleccionado < 0) return;
    if (this.modoHabilidad) {
      this.world.encolarOrden({ agente: this.seleccionado, tipo: 'habilidad', x: punto.x, z: punto.z });
      this.modoHabilidad = false;
      return;
    }
    this.world.encolarOrden({ agente: this.seleccionado, tipo: 'mover', x: punto.x, z: punto.z });
  }

  private agenteVivoEn(x: number, z: number): number {
    let mejor = -1;
    let mejorD2 = SELECCION_RADIO * SELECCION_RADIO;
    for (const a of this.world.agentes) {
      if (a.salud === 'zombi' || a.salud === 'eliminado') continue;
      const d2 = (a.x - x) ** 2 + (a.z - z) ** 2;
      if (d2 <= mejorD2) {
        mejorD2 = d2;
        mejor = a.id;
      }
    }
    return mejor;
  }

  private raycastSuelo(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const golpe = this.raycaster.ray.intersectPlane(this.suelo, this.hit);
    if (!golpe) return null;
    return { x: this.hit.x, z: this.hit.z };
  }

  /** Llamado cada frame: sincroniza el cursor con el modo habilidad. */
  update(): void {
    this.canvas.classList.toggle('modo-habilidad', this.modoHabilidad);
  }
}
