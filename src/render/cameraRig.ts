import * as THREE from 'three';

const PITCH = THREE.MathUtils.degToRad(52); // inclinación estilo Project Zomboid
const YAW = THREE.MathUtils.degToRad(45); // vista diagonal fija
const MIN_DIST = 16;
const MAX_DIST = 130;
const DIST_INICIAL = 32; // escala íntima por defecto
const EDGE_PX = 24; // margen de pantalla que activa el paneo
const EDGE_SPEED = 0.55;

// ——— Tercera persona (posesión, Plan 4 Task 3) ———
const TERCERA_ATRAS = 6; // m detrás del agente
const TERCERA_ARRIBA = 3.5; // m sobre el agente
const TERCERA_MIRA = 4; // m adelante del agente hacia donde apunta la cámara
const TERCERA_SUAVIZADO = 8; // 1/s: tasa de suavizado exponencial del yaw de cámara

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private readonly focus = new THREE.Vector3();
  private dist = DIST_INICIAL;
  private dragging = false;
  private last = { x: 0, y: 0 };
  private pointer = { x: -1, y: -1 };
  /** true solo si el último pointermove cayó sobre el canvas (no sobre un panel de la interfaz). */
  private sobreCanvas = false;
  private readonly bounds: { w: number; d: number };

  private modo: 'director' | 'tercera' = 'director';
  private yawTercera = 0;
  private ultimoTerceraMs = 0;
  /** true mientras el jugador arrastra el mouse en modo tercera (mirar alrededor manual, Plan 7). */
  private mirandoManual = false;

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
      // Al soltar, el auto-seguimiento de actualizarTercera vuelve a mandar
      // (sin salto: yawTercera queda donde el arrastre lo dejó).
      this.mirandoManual = false;
    });
    window.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      // El panel de agentes vive al pie de la pantalla, justo en la banda de
      // paneo por borde: sin esto, acercar el ratón a un botón de habilidad
      // arrastraba la cámara sola (hallazgo de juego, feedback directo).
      this.sobreCanvas = e.target === canvas;
      if (!this.dragging) return;
      if (this.modo === 'tercera') {
        // Modo tercera persona (posesión, Plan 7): arrastrar gira la cámara
        // libremente alrededor del agente en vez de desplazar el foco (eso
        // solo tiene sentido en modo director).
        this.mirandoManual = true;
        const SENSIBILIDAD = 0.005; // rad por pixel de arrastre horizontal
        this.yawTercera -= (e.clientX - this.last.x) * SENSIBILIDAD;
        this.last = { x: e.clientX, y: e.clientY };
        return; // no cae al paneo de modo director
      }
      const escala = (this.dist / window.innerHeight) * 1.6;
      // Convención "agarrar el suelo": el terreno sigue a la mano en los DOS
      // ejes (arrastrar a la derecha mueve el contenido a la derecha en
      // pantalla, arrastrar hacia arriba lo mueve hacia arriba). El eje
      // vertical estaba en la convención opuesta a la horizontal — se sentía
      // "raro"/inconsistente al jugar (feedback directo). Signo de upAmt
      // invertido para que ambos ejes usen la misma convención.
      this.panScreen(
        (e.clientX - this.last.x) * escala,
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

  get focusPoint(): { x: number; z: number } {
    return { x: this.focus.x, z: this.focus.z };
  }

  /** true mientras la cámara está en modo tercera persona (posesión activa). */
  get modoTercera(): boolean {
    return this.modo === 'tercera';
  }

  /** Yaw actual de la cámara en tercera persona (rad); usado por Posesion para WASD relativo a cámara. */
  get yawCamaraTercera(): number {
    return this.yawTercera;
  }

  /** Entra en tercera persona; arranca el yaw mirando la dirección dada (sin salto si es (0,0)). */
  entrarTercera(dirX: number, dirZ: number): void {
    this.modo = 'tercera';
    if (dirX !== 0 || dirZ !== 0) this.yawTercera = Math.atan2(dirX, dirZ);
    this.ultimoTerceraMs = performance.now();
  }

  /** Vuelve al modo director, con el foco centrado en el punto dado (el agente poseído). */
  volverADirector(x: number, z: number): void {
    this.modo = 'director';
    this.focus.set(x, 0, z);
  }

  /**
   * Tercera persona: llamar cada frame EN VEZ de `update()` mientras `modoTercera`.
   * `px/pz` = posición interpolada del agente; `dirX/dirZ` = su eje de marcha actual
   * (0,0 si está quieto). `alturaSuelo` = offset vertical del piso actual (0 en la
   * calle; `piso * INTERIOR.alturaPiso` dentro de un edificio, Plan 8 — sin este
   * offset la cámara se queda a nivel de calle mientras el personaje sube pisos,
   * ver `personajesView.ts` que sí lo aplica al renderizar). El yaw de cámara
   * sigue el movimiento con suavizado exponencial (render-only: no toca la sim
   * ni afecta el determinismo).
   */
  actualizarTercera(px: number, pz: number, dirX: number, dirZ: number, alturaSuelo: number): void {
    const ahora = performance.now();
    const dt = Math.min((ahora - this.ultimoTerceraMs) / 1000, 0.1);
    this.ultimoTerceraMs = ahora;

    if (!this.mirandoManual && (dirX !== 0 || dirZ !== 0)) {
      const objetivo = Math.atan2(dirX, dirZ);
      let diff = objetivo - this.yawTercera;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const factor = 1 - Math.exp(-TERCERA_SUAVIZADO * dt);
      this.yawTercera += diff * factor;
    }

    const sen = Math.sin(this.yawTercera);
    const cos = Math.cos(this.yawTercera);
    this.camera.position.set(px - sen * TERCERA_ATRAS, TERCERA_ARRIBA + alturaSuelo, pz - cos * TERCERA_ATRAS);
    this.camera.lookAt(px + sen * TERCERA_MIRA, 1.4 + alturaSuelo, pz + cos * TERCERA_MIRA);
    this.focus.set(px, 0, pz);
  }

  update(): void {
    // Paneo por bordes: solo si el puntero está sobre el canvas (no sobre un
    // panel de la interfaz, p. ej. el panel de agentes al pie de pantalla,
    // que vive justo en la banda de borde) y no se está arrastrando.
    if (!this.dragging && this.sobreCanvas) {
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
