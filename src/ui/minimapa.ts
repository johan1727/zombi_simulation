import type { Citizen } from '../sim/types';
import type { World } from '../sim/world';

const TAMANO_PX = 180;
/** Redibuja cada N frames de render (no cada uno — es una vista de conjunto barata, no necesita 60fps). */
const FRAMES_POR_REDIBUJO = 6;

/**
 * Paleta PROPIA, deliberadamente duplicada de personajesView.ts (ver Meta del
 * Plan 12) — mantener en sync a ojo si esa paleta cambia; son 4-5 valores
 * hex, no vale la pena acoplar src/ui/ a los internals de un módulo de render.
 */
const COLOR_SANO = '#9fd8ff';
const COLOR_ZOMBI = '#8bff5a';
const COLOR_INCUBANDO = '#ffc46b';
const COLOR_AGENTE = '#ffffff';
const COLOR_EDIFICIO = '#5a6b7d';
const COLOR_EDIFICIO_BRECHA = '#ff5a5a';
const COLOR_FOCO = '#ffd23e';

function colorDe(c: Citizen): string | null {
  if (c.salud === 'eliminado') return null; // no dibujar
  if (c.esAgente) return COLOR_AGENTE;
  if (c.salud === 'zombi') return COLOR_ZOMBI;
  if (c.salud === 'incubando') return COLOR_INCUBANDO;
  return COLOR_SANO;
}

/**
 * Minimapa fijo (esquina inferior derecha): NO es una segunda cámara Three.js
 * (duplicaría el costo de render de la escena 3D) — es un `<canvas>` 2D
 * plano que proyecta `(x, z)` del mundo a `(px, py)` del rectángulo, mismo
 * espíritu que `resultado.ts` dibuja su gráfico con SVG en vez de reusar
 * Three.js. Redibuja cada `FRAMES_POR_REDIBUJO` frames — vista de conjunto
 * barata, no necesita precisión de 60fps.
 */
export class Minimapa {
  private readonly canvas = document.getElementById('minimapa') as HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private frameCount = 0;

  constructor(private readonly world: World) {
    this.ctx = this.canvas.getContext('2d')!;
    // Resolución interna = tamaño CSS × devicePixelRatio, para que no se vea borroso en pantallas HiDPI.
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = TAMANO_PX * dpr;
    this.canvas.height = TAMANO_PX * dpr;
    this.ctx.scale(dpr, dpr);
  }

  update(focoX: number, focoZ: number): void {
    this.frameCount++;
    if (this.frameCount % FRAMES_POR_REDIBUJO !== 0) return;
    this.dibujar(focoX, focoZ);
  }

  private aPixel(x: number, z: number): [number, number] {
    const escalaX = TAMANO_PX / this.world.city.width;
    const escalaZ = TAMANO_PX / this.world.city.depth;
    return [x * escalaX, z * escalaZ];
  }

  private dibujar(focoX: number, focoZ: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, TAMANO_PX, TAMANO_PX);
    ctx.fillStyle = 'rgba(13, 15, 20, 0.75)';
    ctx.fillRect(0, 0, TAMANO_PX, TAMANO_PX);

    // Edificios jugables.
    for (const b of this.world.city.buildings) {
      if (b.kind !== 'jugable') continue;
      const [px, pz] = this.aPixel(b.x + b.width / 2, b.z + b.depth / 2);
      ctx.fillStyle = this.world.brecha[b.id] ? COLOR_EDIFICIO_BRECHA : COLOR_EDIFICIO;
      ctx.fillRect(px - 2, pz - 2, 4, 4);
    }

    // Ciudadanos.
    for (const c of this.world.citizens) {
      const color = colorDe(c);
      if (!color) continue;
      const [px, pz] = this.aPixel(c.x, c.z);
      const r = c.esAgente ? 1.5 : 1;
      ctx.fillStyle = color;
      ctx.fillRect(px - r, pz - r, r * 2, r * 2);
    }

    // Foco de cámara.
    const [fx, fz] = this.aPixel(focoX, focoZ);
    ctx.strokeStyle = COLOR_FOCO;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fx - 5, fz - 5, 10, 10);
  }
}
