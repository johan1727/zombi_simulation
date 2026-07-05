import * as THREE from 'three';

const PITCH = THREE.MathUtils.degToRad(52); // inclinación estilo Project Zomboid
const YAW = THREE.MathUtils.degToRad(45); // vista diagonal fija
const MIN_DIST = 16;
const MAX_DIST = 130;
const DIST_INICIAL = 32; // escala íntima por defecto
const EDGE_PX = 24; // margen de pantalla que activa el paneo
const EDGE_SPEED = 0.55;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private readonly focus = new THREE.Vector3();
  private dist = DIST_INICIAL;
  private dragging = false;
  private last = { x: 0, y: 0 };
  private pointer = { x: -1, y: -1 };
  private readonly bounds: { w: number; d: number };

  constructor(canvas: HTMLCanvasElement, bounds: { w: number; d: number }) {
    this.bounds = bounds;
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1500
    );
    this.focus.set(bounds.w / 2, 0, bounds.d / 2);

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.12 : 0.89;
        this.dist = THREE.MathUtils.clamp(this.dist * factor, MIN_DIST, MAX_DIST);
      },
      { passive: false }
    );

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      if (!this.dragging) return;
      const escala = (this.dist / window.innerHeight) * 1.6;
      this.panScreen(
        (this.last.x - e.clientX) * escala,
        (e.clientY - this.last.y) * escala
      );
      this.last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  /**
   * Mueve el foco en ejes de pantalla proyectados al suelo:
   * rightAmt = hacia la derecha de la pantalla, upAmt = hacia arriba.
   */
  private panScreen(rightAmt: number, upAmt: number): void {
    const cos = Math.cos(YAW);
    const sin = Math.sin(YAW);
    this.focus.x += rightAmt * cos + upAmt * sin;
    this.focus.z += -rightAmt * sin + upAmt * cos;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, 0, this.bounds.w);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, 0, this.bounds.d);
  }

  update(): void {
    // Paneo por bordes (solo si el puntero ya entró a la ventana y no se arrastra).
    if (!this.dragging && this.pointer.x >= 0) {
      const s = EDGE_SPEED * (this.dist / 60);
      if (this.pointer.x < EDGE_PX) this.panScreen(-s, 0);
      else if (this.pointer.x > window.innerWidth - EDGE_PX) this.panScreen(s, 0);
      if (this.pointer.y < EDGE_PX) this.panScreen(0, s);
      else if (this.pointer.y > window.innerHeight - EDGE_PX) this.panScreen(0, -s);
    }

    const r = Math.cos(PITCH) * this.dist;
    this.camera.position.set(
      this.focus.x - Math.sin(YAW) * r,
      Math.sin(PITCH) * this.dist,
      this.focus.z - Math.cos(YAW) * r
    );
    this.camera.lookAt(this.focus);
  }
}
