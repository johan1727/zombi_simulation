# PANDEMIA — Plan 12: Minimapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea.

## Meta

Feedback directo del usuario jugando: con la cámara en modo director
(zoom continuo, escala íntima de calle), no hay forma de ver de un
vistazo qué pasa en el resto de la ciudad — solo lo que entra en cámara.
Un minimapa fijo en una esquina resuelve esto sin tocar la cámara
principal.

**Decisión de diseño clave:** el minimapa NO es una segunda cámara
Three.js (eso duplicaría el costo de render de toda la escena 3D). Es un
`<canvas>` 2D plano, dibujado con la API `CanvasRenderingContext2D`,
proyectando `(x, z)` del mundo a `(px, py)` de un rectángulo pequeño —
mismo espíritu que `resultado.ts` ya dibuja el gráfico de curvas con SVG
en vez de reusar Three.js. Es barato: unos cientos de `arc()`/`fillRect()`
sobre un canvas de ~180×180px, redibujado a una cadencia MODESTA (no cada
frame de render — no hace falta esa precisión para una vista de conjunto).

Alcance del MVP (deliberadamente acotado):
- Silueta del límite de la ciudad + edificios jugables (puntos fijos,
  distintos si tienen brecha).
- Ciudadanos: puntos por salud/rol, mismo criterio de color que ya usa
  `personajesView.ts` (paleta DUPLICADA aquí a propósito, ver Task 1 —
  no importar desde `src/render/` para no acoplar `src/ui/` a los
  internals de un módulo de render; son 4-5 valores hex, no vale la pena
  la dependencia).
- Marcador del punto de foco de la cámara (`rig.focusPoint`, ya público).
- **Fuera de alcance de este plan** (candidatos a mejora futura, no
  bloqueantes): click-to-pan (clic en el minimapa mueve la cámara ahí),
  rectángulo de frustum real (necesitaría exponer `CameraRig.dist`, hoy
  privado), toggle para ocultar/mostrar.

Esto es 100% `src/ui/` — CERO cambios a `src/sim/`.

## Task 1: `Minimapa` — canvas 2D con ciudad, edificios y ciudadanos

**Files:**
- Create: `src/ui/minimapa.ts`
- Modify: `index.html` (nuevo `<canvas id="minimapa">` + estilos)
- Modify: `src/game/main.ts` (instanciar y actualizar junto al resto del HUD)

**Interfaces:**

```ts
// src/ui/minimapa.ts
import type { World } from '../sim/world';
import type { Citizen, Salud } from '../sim/types';

const TAMANO_PX = 180;
/** Redibuja cada N frames de render (no cada uno — es una vista de conjunto, no necesita 60fps). */
const FRAMES_POR_REDIBUJO = 6;

/** Paleta PROPIA, deliberadamente duplicada de personajesView.ts (ver Meta) — mantener en sync a ojo si esa paleta cambia. */
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

export class Minimapa {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private frameCount = 0;

  constructor(private readonly world: World) {
    this.canvas = document.getElementById('minimapa') as HTMLCanvasElement;
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
      ctx.fillStyle = color;
      ctx.fillRect(px - (c.esAgente ? 1.5 : 1), pz - (c.esAgente ? 1.5 : 1), c.esAgente ? 3 : 2, c.esAgente ? 3 : 2);
    }

    // Foco de cámara.
    const [fx, fz] = this.aPixel(focoX, focoZ);
    ctx.strokeStyle = COLOR_FOCO;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fx - 5, fz - 5, 10, 10);
  }
}
```

(Snippet ilustrativo — ajustar nombres/estructura al estilo real que ya
usa el resto de `src/ui/` si difiere; `world.city.width`/`depth` y
`world.brecha[b.id]` ya se usan así en `cityView.ts`/`jugablesView.ts`,
confirmar los mismos accesores.)

`index.html` — nuevo elemento, esquina libre (abajo-derecha; `#marcador-rival`/`#aviso-rival` ya ocupan arriba-derecha, `#panel-agentes` ocupa abajo-centro):

```html
<canvas id="minimapa"></canvas>
```
```css
#minimapa {
  position: fixed; bottom: 12px; right: 12px; z-index: 10;
  width: 180px; height: 180px; border-radius: 8px;
  border: 1px solid rgba(234, 242, 255, 0.25);
  pointer-events: none; /* MVP: sin click-to-pan, ver Meta */
}
```

`main.ts` — construir `new Minimapa(world)` junto al resto de vistas de
UI, llamar `minimapa.update(foco.x, foco.z)` en el loop de `frame(alpha)`
(mismo `foco` que ya se calcula ahí para `jugablesView.update`/
`cityView.updateOcclusion` — reusar la variable existente, no recalcular).

- [ ] **Step 1: Implementar.**
- [ ] **Step 2:** `npx tsc --noEmit` limpio.
- [ ] **Step 3: Verificación en navegador** — confirmar que el minimapa
  aparece en la esquina inferior derecha sin superponerse al panel de
  agentes; que muestra puntos moviéndose acordes a los ciudadanos reales
  (comparar contra el estado real vía `window.pandemia.world.citizens`);
  que los edificios con brecha cambian de color; que el marcador de foco
  se mueve al panear/hacer zoom la cámara principal. Confirmar que NO baja
  el FPS de forma perceptible (redibujo cada 6 frames, cientos de
  `fillRect` — barato, pero medir con el método ya establecido si hay
  dudas). Sin errores de consola.
- [ ] **Step 4: Commit** — `feat: minimapa fijo con ciudad, edificios y ciudadanos (Plan 12)`

---

## Task 2: Cierre

- [ ] **Step 1:** `npm test` completo (no debería tocar `src/sim/`,
  confirmar con `git diff --stat -- src/sim/` vacío) y `npx tsc --noEmit`
  limpios.
- [ ] **Step 2: Cierre** — checkboxes marcados, commit
  `chore: minimapa verificado (Plan 12 completo)`, push.
