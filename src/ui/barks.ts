import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Citizen, Personality } from '../sim/types';
import { INTERIOR } from '../sim/config';

/**
 * Frases cortas en español, SIN pistas de estrategia — solo color. 'generico'
 * es un cajón de sastre para personalidades futuras/no mapeadas; hoy ningún
 * `Citizen.personality` real cae ahí (las 6 literales de `types.ts` siempre
 * tienen su propia entrada), pero mantiene `elegirFrase` total.
 */
const FRASES: Record<Personality | 'generico', readonly string[]> = {
  cobarde: ['¡CORRE!', '¡Nos va a matar!', '¡Nos vamos a morir!'],
  protector: ['¿Y mi hija?', '¡No te sueltes!', '¡No los voy a dejar!'],
  lider: ['¡A la azotea!', '¡Síganme!', '¡Por aquí, rápido!'],
  valiente: ['¡Aguanten!', '¡No retrocedan!', '¡Vamos a salir de esta!'],
  egoista: ['¡Cada quien por su cuenta!', '¡Yo me largo!', '¡Suéltame!'],
  imprudente: ['¡Vamos a verlo de cerca!', '¡No puede ser tan malo!', '¡Voy por él!'],
  generico: ['¡Zombis!', '¡Corran!', '¡Ayuda!'],
};

/**
 * Elección de frase PURA y determinista: `id % longitud`, NUNCA `Math.random`
 * (aunque `src/ui/` lo permitiría) — así un desafío grabado se ve/lee igual
 * en cualquier repetición. `id` es `Citizen.id`, que coincide con su índice
 * en `world.citizens` (ver `spawnCitizens`/`crearAgente`).
 */
export function elegirFrase(personality: Personality | 'generico', id: number): string {
  const opciones = FRASES[personality];
  return opciones[id % opciones.length];
}

/** Máximo de burbujas visibles a la vez (pool fijo, sin crear/destruir nodos). */
const POOL = 3;
/** Cuánto dura una burbuja en pantalla antes de desvanecerse. */
const DURACION_MS = 2600;
/** Un mismo ciudadano no vuelve a hablar antes de este tiempo. */
const COOLDOWN_MS = 10000;
/** Altura (m) sobre la base del ciudadano donde flota la burbuja (ver personajesView: mismo anclaje `y` que antes, base ~0.85m). */
const ALTURA_SOBRE_CABEZA = 1.2;

interface Burbuja {
  readonly el: HTMLDivElement;
  /** id del ciudadano dueño de la burbuja, -1 = slot libre. */
  ciudadano: number;
  /** `Date.now()` a partir del cual esta burbuja se apaga. */
  ocultarEn: number;
}

/**
 * Diálogos flotantes ("barks") sobre la cabeza de un ciudadano cuando ENTRA
 * en pánico, o cuando un familiar reacciona a la transformación de la cabeza
 * de familia. Overlay 2D en HTML (no objetos de la escena 3D: más simple que
 * `CSS2DRenderer` y evita sumar geometría a `scene`), posicionado cada frame
 * con `camera.project()` — igual en espíritu a como `Controles`/`Posesion`
 * ya usan la cámara para ir de mundo a pantalla (o viceversa) sin tocar la
 * sim. Pool fijo de `POOL` burbujas: los nodos DOM se crean UNA vez en el
 * constructor y se reciclan (mover, cambiar texto, opacity) — nunca se
 * crean/destruyen por frame.
 *
 * Nota de interfaz: el brief de la task describe `constructor(scene:
 * THREE.Scene)` sin cámara, pero proyectar mundo→pantalla exige la cámara
 * (no está disponible desde `scene`) — se añadió como segundo parámetro del
 * constructor en vez de colarla en `update()`, para mantener esa firma tal
 * cual la describe el brief. `scene` en sí no se usa (no hay geometría que
 * añadir con el enfoque de overlay DOM elegido); se conserva el parámetro
 * por fidelidad a la interfaz documentada.
 */
export class Barks {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly burbujas: Burbuja[] = [];
  private readonly cooldownHasta = new Map<number, number>();
  private readonly punto = new THREE.Vector3();
  /** `animo` del frame anterior por índice de ciudadano; null hasta el primer `update`. */
  private animoPrevio: Uint8Array | null = null;
  /** Cuántos `world.hitos` ya se revisaron (el array solo crece, tope 300 — ver world.ts). */
  private hitosConsumidos = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    void scene;
    this.camera = camera;

    const contenedor = document.getElementById('barks');
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'bark-burbuja';
      contenedor?.appendChild(el);
      this.burbujas.push({ el, ciudadano: -1, ocultarEn: 0 });
    }
  }

  /** Llamado cada frame de render (no por tick de sim), con el mismo `alpha` que el resto de vistas. */
  update(world: World, alpha: number): void {
    if (!this.animoPrevio || this.animoPrevio.length !== world.citizens.length) {
      this.animoPrevio = new Uint8Array(world.citizens.length);
      for (let i = 0; i < world.citizens.length; i++) {
        this.animoPrevio[i] = world.citizens[i].animo === 'panico' ? 1 : 0;
      }
    }

    const ahora = Date.now();

    // 1) Disparo principal: ciudadano que ENTRA en pánico este frame (transición
    // tranquilo -> pánico), leído directo de `world.citizens.animo` — la MISMA
    // condición que hoy dispara el grito en panico.ts (`entrarEnPanico`), pero
    // inspeccionada desde fuera sin tocar la sim y sin depender de `world.ruidos`
    // (ese array se compacta in-place cada tick — ver audio.ts, que por eso
    // tampoco lo usa — así que un pánico contagiado sin grito, o dos entradas
    // en pánico el mismo tick, se perderían si solo mirásemos ruidos nuevos).
    const previo = this.animoPrevio;
    for (let i = 0; i < world.citizens.length; i++) {
      const c = world.citizens[i];
      const enPanico = c.animo === 'panico' ? 1 : 0;
      if (enPanico === 1 && previo[i] === 0) this.intentarBark(c, ahora);
      previo[i] = enPanico;
    }

    // 2) Disparo secundario: transformación de la cabeza de familia — habla el
    // primer familiar aún vivo (en el orden fijo de `familiares`, estático desde
    // que nace), como reacción. Delta sobre `world.hitos` (SOLO crece, igual
    // patrón que audio.ts).
    for (let i = this.hitosConsumidos; i < world.hitos.length; i++) {
      const h = world.hitos[i];
      if (h.tipo !== 'transformacion_cabeza') continue;
      const cabeza = world.citizens[h.a];
      if (!cabeza) continue;
      for (const fid of cabeza.familiares) {
        const f = world.citizens[fid];
        if (f && f.salud !== 'eliminado' && f.salud !== 'zombi') {
          this.intentarBark(f, ahora);
          break;
        }
      }
    }
    this.hitosConsumidos = world.hitos.length;

    // 3) Reposiciona/desvanece las burbujas activas.
    for (const b of this.burbujas) {
      if (b.ciudadano < 0) continue;
      const c = world.citizens[b.ciudadano];
      if (!c || c.salud === 'eliminado' || c.salud === 'zombi' || ahora >= b.ocultarEn) {
        b.el.style.opacity = '0';
        b.ciudadano = -1;
        continue;
      }
      this.posicionar(b, c, alpha);
    }
  }

  private intentarBark(c: Citizen, ahora: number): void {
    if ((this.cooldownHasta.get(c.id) ?? 0) > ahora) return;
    const slot = this.burbujas.find((b) => b.ciudadano < 0);
    if (!slot) return; // pool lleno (máx. POOL a la vez): este bark se pierde, a propósito
    this.cooldownHasta.set(c.id, ahora + COOLDOWN_MS);
    slot.ciudadano = c.id;
    slot.ocultarEn = ahora + DURACION_MS;
    slot.el.textContent = elegirFrase(c.personality, c.id);
  }

  private posicionar(b: Burbuja, c: Citizen, alpha: number): void {
    const x = c.prevX + (c.x - c.prevX) * alpha;
    const z = c.prevZ + (c.z - c.prevZ) * alpha;
    const y = 0.85 + c.piso * INTERIOR.alturaPiso + ALTURA_SOBRE_CABEZA;
    this.punto.set(x, y, z);
    // El resto del frame corre ANTES de renderer.render(): forzar aquí el
    // recálculo de matrixWorld/matrixWorldInverse de la cámara (Camera la
    // sobreescribe para incluir matrixWorldInverse) evita proyectar con la
    // matriz del frame anterior.
    this.camera.updateMatrixWorld();
    this.punto.project(this.camera);
    if (this.punto.z > 1) {
      b.el.style.opacity = '0'; // detrás de la cámara
      return;
    }
    const sx = (this.punto.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this.punto.y * 0.5 + 0.5) * window.innerHeight;
    b.el.style.left = `${sx.toFixed(1)}px`;
    b.el.style.top = `${sy.toFixed(1)}px`;
    b.el.style.opacity = '1';
  }
}
