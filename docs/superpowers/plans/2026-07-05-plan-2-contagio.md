# PANDEMIA — Plan 2 de 4: El Contagio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El brote completo y determinista: paciente cero, incubación, transformación con salpicaduras de pintura, zombis que cazan por vista y ruido, pánico contagioso modulado por personalidad, refugio en edificios (bomba de tiempo interior), combate en grupo, y cámara que aplana edificios que estorban. Sin intervención del jugador, la ciudad colapsa sola entre 1:30 y 8:00.

**Architecture:** Todo el brote vive en `src/sim/` como sistemas puros que consumen streams de RNG separados por subsistema (`pandemia:<seed>:<sistema>`). Una rejilla espacial determinista (arreglos planos, orden fijo) da consultas de vecinos O(1). El render solo lee: colores por estado, salpicaduras instanciadas, edificios aplanados anti-oclusión.

**Tech Stack:** El existente (TypeScript strict + Vite + Three.js + Vitest). Sin dependencias nuevas.

**Diseño de referencia:** `docs/superpowers/specs/2026-07-05-pandemia-design.md` (secciones 3.1–3.5)
**Estado previo:** Plan 1 fusionado en master: sim determinista (`World`, 800 ciudadanos por corredores), render instanciado, cámara PZ, 24 tests.

## Global Constraints

- Todas las del Plan 1 siguen vigentes: TS strict; PROHIBIDO en `src/sim/`: `three`, `Math.random`, `Date.now`, `performance.now`; paso fijo `TICK_RATE = 30`; UI en español; commits en español (`feat:`/`test:`/`chore:`).
- **Streams de RNG por subsistema:** cada sistema usa SOLO su stream (`rngCiudad`, `rngCiudadanos`, `rngInfeccion`, `rngZombis`, `rngPanico`, `rngCombate`). Nunca mezclar.
- **`SpatialGrid.queryCircle` no se anida** (reusa un scratch interno): terminar de consumir un resultado antes de la siguiente consulta.
- **Teletransportes resetean `prevX/prevZ`** (entrar/salir de edificios, re-engancharse a la calle) para que el render no dibuje estelas.
- `tests/determinism.test.ts` debe quedar en verde tras CADA tarea (los dos mundos con la misma semilla siempre idénticos).
- Los valores de balance (velocidades, radios, probabilidades) son los de `config.ts` de este plan; SOLO la Task 10 autoriza ajustarlos.

---

### Task 1: Estados de salud, streams de RNG y hash extendido

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/citizens.ts` (spawn + firma de updateCitizen), `src/sim/world.ts`, `CLAUDE.md`
- Test: `tests/estado.test.ts`

**Interfaces:**
- Consumes: todo el Plan 1.
- Produces:
  - `types.ts`: `type Salud = 'sano' | 'incubando' | 'zombi' | 'eliminado'`; `type Animo = 'tranquilo' | 'panico'`; `interface Splat { x: number; z: number; tono: number }`; `interface Ruido { x: number; z: number; radio: number; ticks: number }`; `Citizen` suma los campos `salud: Salud; incubacionTicks: number; animo: Animo; animoTicks: number; dentroDe: number; cdMordida: number`.
  - `config.ts`: constantes `INFECCION`, `ZOMBIS`, `PANICO`, `PROB_PANICO_POR_GRITO`, `COMBATE`, `REFUGIO`, `GRID_CELDA` (valores exactos abajo).
  - `citizens.ts`: `updateCitizen(c, rng, factorVelocidad = 1)` (tercer parámetro nuevo).
  - `world.ts`: streams públicos `rngCiudadanos`, `rngInfeccion`, `rngZombis`, `rngPanico`, `rngCombate`; arreglos `splats: Splat[]`, `ruidos: Ruido[]`, `ocupantes: number[]`, `brecha: boolean[]`; getter `stats: { vivos: number; zombis: number }`; `hashState()` mezcla también salud/ánimo/dentroDe.

- [ ] **Step 1: Escribir el test que falla — `tests/estado.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

describe('estado del brote (Task 1)', () => {
  it('los ciudadanos nacen sanos, tranquilos y fuera de edificios', () => {
    const w = new World('estado', 100);
    for (const c of w.citizens) {
      expect(c.salud).toBe('sano');
      expect(c.animo).toBe('tranquilo');
      expect(c.dentroDe).toBe(-1);
      expect(c.incubacionTicks).toBe(0);
      expect(c.cdMordida).toBe(0);
    }
    expect(w.stats).toEqual({ vivos: 100, zombis: 0 });
    expect(w.splats).toEqual([]);
    expect(w.ruidos).toEqual([]);
    expect(w.ocupantes.length).toBe(w.city.buildings.length);
    expect(w.brecha.length).toBe(w.city.buildings.length);
  });

  it('los streams por subsistema mantienen el determinismo', () => {
    const a = new World('streams', 200);
    const b = new World('streams', 200);
    for (let t = 0; t < 300; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — `salud`/`stats`/`splats` no existen.

- [ ] **Step 3: Implementar**

**(a)** En `src/sim/types.ts`, añadir al final (y ampliar `Citizen`):

```ts
export type Salud = 'sano' | 'incubando' | 'zombi' | 'eliminado';
export type Animo = 'tranquilo' | 'panico';

/** Mancha de pintura en el suelo (la "sangre" del juego). */
export interface Splat {
  x: number;
  z: number;
  /** 0..1: elige color de la paleta, rotación y tamaño. */
  tono: number;
}

/** Fuente de ruido temporal (gritos, brechas). Atrae zombis y contagia pánico. */
export interface Ruido {
  x: number;
  z: number;
  radio: number;
  ticks: number;
}
```

Y dentro de `interface Citizen`, añadir estos campos al final:

```ts
  salud: Salud;
  /** Ticks restantes de incubación (si salud === 'incubando'). */
  incubacionTicks: number;
  animo: Animo;
  /** Ticks sin ver zombis (para calmarse). */
  animoTicks: number;
  /** id del edificio en el que se refugia, o -1. */
  dentroDe: number;
  /** Enfriamiento de mordida (solo zombis). */
  cdMordida: number;
```

**(b)** En `src/sim/config.ts`, añadir al final:

```ts
// ——— Plan 2: el brote ———

export const INFECCION = {
  pacienteCeroTick: 5 * TICK_RATE, // el brote empieza a los 5 segundos
  radioMordida: 1.2, // m
  incubacionMinTicks: 10 * TICK_RATE,
  incubacionMaxTicks: 20 * TICK_RATE,
  velocidadIncubando: 0.8, // multiplicador al caminar
} as const;

export const ZOMBIS = {
  velocidad: 3.4, // m/s persiguiendo (estilo Guerra Mundial Z)
  velocidadErrante: 0.9,
  radioVision: 20,
  enfriamientoMordidaTicks: 12,
  probCambiarRumbo: 0.02, // por tick, errando sin presa
} as const;

export const PANICO = {
  radioVerZombi: 15,
  radioGrito: 12,
  duracionGritoTicks: TICK_RATE,
  velocidadHuida: 2.8, // m/s (más lento que un zombi cazando)
  ticksCalmarse: 10 * TICK_RATE,
} as const;

/** Probabilidad POR TICK de entrar en pánico al oír un grito, por personalidad. */
export const PROB_PANICO_POR_GRITO: Record<string, number> = {
  cobarde: 0.08,
  protector: 0.04,
  egoista: 0.04,
  imprudente: 0.01,
  valiente: 0.01,
  lider: 0.005,
};

export const COMBATE = {
  radioPelea: 2.5,
  humanosParaGanar: 3,
  probInfeccionAlGanar: 0.25,
} as const;

export const REFUGIO = {
  radioEntrar: 2.5,
  capacidad: 40,
} as const;

export const GRID_CELDA = 4; // m por celda de la rejilla espacial
```

**(c)** En `src/sim/citizens.ts`:
- En `spawnCitizens`, dentro del objeto `citizens.push({ ... })`, añadir al final:

```ts
      salud: 'sano',
      incubacionTicks: 0,
      animo: 'tranquilo',
      animoTicks: 0,
      dentroDe: -1,
      cdMordida: 0,
```

- Cambiar la firma de `updateCitizen` y la línea del paso:

```ts
export function updateCitizen(c: Citizen, rng: Rng, factorVelocidad = 1): void {
```

```ts
  const paso = CITIZENS.walkSpeed * DT * factorVelocidad;
```

**(d)** Reemplazar `src/sim/world.ts` completo:

```ts
import { createRng, type Rng } from './rng';
import { generateCity, type CityLayout } from './cityGen';
import { spawnCitizens, updateCitizen } from './citizens';
import type { Citizen, Ruido, Splat } from './types';
import { CITIZENS } from './config';

export class World {
  readonly seed: string;
  readonly city: CityLayout;
  readonly citizens: Citizen[];
  tickCount = 0;

  /** Streams de RNG por subsistema: cada sistema usa SOLO el suyo. */
  readonly rngCiudadanos: Rng;
  readonly rngInfeccion: Rng;
  readonly rngZombis: Rng;
  readonly rngPanico: Rng;
  readonly rngCombate: Rng;

  readonly splats: Splat[] = [];
  readonly ruidos: Ruido[] = [];
  readonly ocupantes: number[];
  readonly brecha: boolean[];

  constructor(seed: string, citizenCount: number = CITIZENS.count) {
    this.seed = seed;
    const rngCiudad = createRng(`pandemia:${seed}:ciudad`);
    this.rngCiudadanos = createRng(`pandemia:${seed}:ciudadanos`);
    this.rngInfeccion = createRng(`pandemia:${seed}:infeccion`);
    this.rngZombis = createRng(`pandemia:${seed}:zombis`);
    this.rngPanico = createRng(`pandemia:${seed}:panico`);
    this.rngCombate = createRng(`pandemia:${seed}:combate`);
    this.city = generateCity(rngCiudad);
    this.citizens = spawnCitizens(this.rngCiudadanos, citizenCount);
    this.ocupantes = this.city.buildings.map(() => 0);
    this.brecha = this.city.buildings.map(() => false);
  }

  get stats(): { vivos: number; zombis: number } {
    let vivos = 0;
    let zombis = 0;
    for (const c of this.citizens) {
      if (c.salud === 'zombi') zombis++;
      else if (c.salud !== 'eliminado') vivos++;
    }
    return { vivos, zombis };
  }

  tick(): void {
    for (const c of this.citizens) updateCitizen(c, this.rngCiudadanos);
    this.tickCount++;
  }

  /**
   * Huella FNV del estado para los tests de determinismo.
   * Mezcla 24 bits por valor: suficiente hasta mapas de ~1.6 km.
   */
  hashState(): number {
    let h = 0x811c9dc5;
    const mix = (n: number): void => {
      h ^= n & 0xff;
      h = Math.imul(h, 0x01000193);
      h ^= (n >>> 8) & 0xff;
      h = Math.imul(h, 0x01000193);
      h ^= (n >>> 16) & 0xff;
      h = Math.imul(h, 0x01000193);
    };
    const SALUD = { sano: 1, incubando: 2, zombi: 3, eliminado: 4 } as const;
    mix(this.tickCount);
    for (const c of this.citizens) {
      mix(Math.round(c.x * 100));
      mix(Math.round(c.z * 100));
      mix(SALUD[c.salud]);
      mix(c.animo === 'panico' ? 2 : 1);
      mix(c.dentroDe + 1);
    }
    return h >>> 0;
  }
}
```

**(e)** En `CLAUDE.md`, dentro de la sección "## Determinismo (sagrado)", añadir estas viñetas:

```markdown
- Streams de RNG por subsistema (`pandemia:<seed>:<sistema>`): cada sistema
  usa SOLO su stream; nunca mezclar.
- `SpatialGrid.queryCircle` reusa un scratch interno: NUNCA anidar consultas.
- Todo teletransporte (entrar/salir de edificios, re-enganche a la calle)
  resetea `prevX/prevZ` para no dejar estelas en el render.
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test` → PASS (los 24 previos + 2 nuevos). Run: `npx tsc --noEmit` → limpio.

- [ ] **Step 5: Commit**

```bash
git add src/sim tests/estado.test.ts CLAUDE.md
git commit -m "feat: salud/animo del ciudadano, streams de RNG por subsistema y hash extendido"
```

---

### Task 2: Rejilla espacial determinista

**Files:**
- Create: `src/sim/spatialGrid.ts`
- Test: `tests/grid.test.ts`

**Interfaces:**
- Produces: `class SpatialGrid<T extends { x: number; z: number }> { rebuild(items: readonly T[], activo: (item: T) => boolean): void; queryCircle(x: number, z: number, r: number): readonly number[] }` — devuelve ÍNDICES de `items`, en orden determinista (celda por celda, orden de inserción).

- [ ] **Step 1: Test que falla — `tests/grid.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/sim/spatialGrid';

const p = (x: number, z: number, activo = true) => ({ x, z, activo });

describe('rejilla espacial', () => {
  it('encuentra vecinos dentro del radio y excluye lejanos', () => {
    const items = [p(10, 10), p(12, 10), p(40, 40), p(10.5, 10.5)];
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, (it) => it.activo);
    const res = g.queryCircle(10, 10, 3);
    expect([...res].sort()).toEqual([0, 1, 3]);
  });

  it('excluye inactivos', () => {
    const items = [p(10, 10), p(11, 10, false)];
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, (it) => it.activo);
    expect([...g.queryCircle(10, 10, 5)]).toEqual([0]);
  });

  it('el orden del resultado es determinista', () => {
    const items = Array.from({ length: 50 }, (_, i) => p(5 + (i % 10), 5 + Math.floor(i / 10)));
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, () => true);
    const a = [...g.queryCircle(9, 7, 6)];
    g.rebuild(items, () => true);
    const b = [...g.queryCircle(9, 7, 6)];
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('tolera coordenadas en el borde del mapa', () => {
    const items = [p(0, 0), p(271.5, 359.5)];
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, () => true);
    expect([...g.queryCircle(0, 0, 2)]).toEqual([0]);
    expect([...g.queryCircle(271, 359, 2)]).toEqual([1]);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `src/sim/spatialGrid.ts`**

```ts
import { CITY_DEPTH, CITY_WIDTH, GRID_CELDA } from './config';

/**
 * Rejilla espacial uniforme y determinista (arreglos planos, orden fijo).
 * Reconstruir cada tick con rebuild(); queryCircle() devuelve índices.
 * ATENCIÓN: queryCircle reusa un scratch interno — no anidar consultas.
 */
export class SpatialGrid<T extends { x: number; z: number }> {
  readonly cols = Math.ceil(CITY_WIDTH / GRID_CELDA);
  readonly rows = Math.ceil(CITY_DEPTH / GRID_CELDA);

  private readonly cells: number[][] = Array.from(
    { length: this.cols * this.rows },
    () => []
  );
  private readonly scratch: number[] = [];
  private items: readonly T[] = [];

  rebuild(items: readonly T[], activo: (item: T) => boolean): void {
    for (const cell of this.cells) cell.length = 0;
    this.items = items;
    for (let i = 0; i < items.length; i++) {
      if (!activo(items[i])) continue;
      const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(items[i].x / GRID_CELDA)));
      const cz = Math.min(this.rows - 1, Math.max(0, Math.floor(items[i].z / GRID_CELDA)));
      this.cells[cz * this.cols + cx].push(i);
    }
  }

  /** Índices de items activos a distancia <= r de (x,z), orden determinista. */
  queryCircle(x: number, z: number, r: number): readonly number[] {
    const out = this.scratch;
    out.length = 0;
    const c0 = Math.max(0, Math.floor((x - r) / GRID_CELDA));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / GRID_CELDA));
    const r0 = Math.max(0, Math.floor((z - r) / GRID_CELDA));
    const r1 = Math.min(this.rows - 1, Math.floor((z + r) / GRID_CELDA));
    const r2 = r * r;
    for (let cz = r0; cz <= r1; cz++) {
      for (let cx = c0; cx <= c1; cx++) {
        for (const i of this.cells[cz * this.cols + cx]) {
          const it = this.items[i];
          if ((it.x - x) ** 2 + (it.z - z) ** 2 <= r2) out.push(i);
        }
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Verificar que pasa** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/spatialGrid.ts tests/grid.test.ts
git commit -m "feat: rejilla espacial determinista para consultas de vecinos"
```

---

### Task 3: Colisión con edificios

**Files:**
- Create: `src/sim/collision.ts`
- Test: `tests/collision.test.ts`

**Interfaces:**
- Produces: `buildingAt(city: CityLayout, x: number, z: number): Building | null` (null en calle/acera/fuera del mapa); `moveWithSlide(city: CityLayout, c: { x: number; z: number }, nx: number, nz: number): void` (avanza deslizándose por paredes, clampa al mapa).

- [ ] **Step 1: Test que falla — `tests/collision.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { generateCity } from '../src/sim/cityGen';
import { buildingAt, moveWithSlide } from '../src/sim/collision';
import { CITY, CITY_PERIOD } from '../src/sim/config';

const city = generateCity(createRng('colision'));
const b0 = city.buildings[0]; // manzana (0,0): x,z = calle+margen = 10

describe('colisión con edificios', () => {
  it('la calle y la acera no son edificio', () => {
    expect(buildingAt(city, 4, 4)).toBeNull(); // calle
    expect(buildingAt(city, CITY.streetWidth + 1, CITY.streetWidth + 1)).toBeNull(); // acera
    expect(buildingAt(city, -5, 10)).toBeNull(); // fuera del mapa
  });

  it('el interior de la manzana es su edificio', () => {
    const cx = b0.x + b0.width / 2;
    const cz = b0.z + b0.depth / 2;
    expect(buildingAt(city, cx, cz)).toBe(b0);
    // manzana (1,0): índice = blocksY (bx * blocksY + bz)
    expect(buildingAt(city, cx + CITY_PERIOD, cz)).toBe(city.buildings[CITY.blocksY]);
  });

  it('moveWithSlide no atraviesa paredes y se desliza', () => {
    const c = { x: b0.x - 1, z: b0.z + 5 }; // pegado a la pared oeste, en la acera
    moveWithSlide(city, c, b0.x + 2, c.z + 0.3); // intenta entrar en diagonal
    expect(buildingAt(city, c.x, c.z)).toBeNull(); // sigue fuera
    expect(c.z).toBeCloseTo(b0.z + 5.3, 5); // se deslizó en z
    expect(c.x).toBeCloseTo(b0.x - 1, 5); // x bloqueada
  });

  it('clampa a los límites del mapa', () => {
    const c = { x: 2, z: 2 };
    moveWithSlide(city, c, -10, -10);
    expect(c.x).toBe(1);
    expect(c.z).toBe(1);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.

- [ ] **Step 3: Implementar `src/sim/collision.ts`**

```ts
import { CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH } from './config';
import type { Building, CityLayout } from './cityGen';

const MARGEN_ACERA = 2; // igual que el margin de generateCity

/** Edificio cuyo interior contiene (x,z), o null si es calle/acera/fuera. */
export function buildingAt(city: CityLayout, x: number, z: number): Building | null {
  if (x < 0 || z < 0 || x >= CITY_WIDTH || z >= CITY_DEPTH) return null;
  const fx = x % CITY_PERIOD;
  const fz = z % CITY_PERIOD;
  if (fx < CITY.streetWidth || fz < CITY.streetWidth) return null; // calle
  const dentroX = fx >= CITY.streetWidth + MARGEN_ACERA && fx < CITY_PERIOD - MARGEN_ACERA;
  const dentroZ = fz >= CITY.streetWidth + MARGEN_ACERA && fz < CITY_PERIOD - MARGEN_ACERA;
  if (!dentroX || !dentroZ) return null; // acera
  const bx = Math.floor(x / CITY_PERIOD);
  const bz = Math.floor(z / CITY_PERIOD);
  return city.buildings[bx * CITY.blocksY + bz];
}

/** Avanza hacia (nx,nz) deslizándose por las paredes; clampa al mapa. */
export function moveWithSlide(
  city: CityLayout,
  c: { x: number; z: number },
  nx: number,
  nz: number
): void {
  if (!buildingAt(city, nx, nz)) {
    c.x = nx;
    c.z = nz;
  } else if (!buildingAt(city, nx, c.z)) {
    c.x = nx;
  } else if (!buildingAt(city, c.x, nz)) {
    c.z = nz;
  }
  c.x = Math.min(Math.max(c.x, 1), CITY_WIDTH - 1);
  c.z = Math.min(Math.max(c.z, 1), CITY_DEPTH - 1);
}
```

- [ ] **Step 4: Verificar que pasa** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/collision.ts tests/collision.test.ts
git commit -m "feat: colision con edificios y movimiento con deslizamiento"
```

---

### Task 4: Infección — paciente cero, incubación, transformación

**Files:**
- Create: `src/sim/infeccion.ts`
- Modify: `src/sim/world.ts` (tick: paciente cero + rejilla + incubación)
- Test: `tests/infeccion.test.ts`

**Interfaces:**
- Produces: `elegirPacienteCero(citizens, rng): number`; `infectar(c: Citizen, rng: Rng): void`; `actualizarIncubacion(c: Citizen, world: World): void`.
- `World` suma: `grid: SpatialGrid<Citizen>` (público, reconstruido cada tick).

- [ ] **Step 1: Test que falla — `tests/infeccion.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { INFECCION, TICK_RATE } from '../src/sim/config';

describe('infección', () => {
  it('el paciente cero aparece en el tick configurado y es determinista', () => {
    const a = new World('brote-1', 300);
    const b = new World('brote-1', 300);
    for (let t = 0; t <= INFECCION.pacienteCeroTick; t++) { a.tick(); b.tick(); }
    const infA = a.citizens.findIndex((c) => c.salud === 'incubando');
    const infB = b.citizens.findIndex((c) => c.salud === 'incubando');
    expect(infA).toBeGreaterThanOrEqual(0);
    expect(infA).toBe(infB);
  });

  it('la incubación dura entre 10 y 20 segundos y termina en zombi con salpicadura', () => {
    const w = new World('brote-2', 300);
    for (let t = 0; t <= INFECCION.pacienteCeroTick; t++) w.tick();
    const c = w.citizens.find((x) => x.salud === 'incubando')!;
    expect(c.incubacionTicks).toBeGreaterThanOrEqual(10 * TICK_RATE - 1);
    expect(c.incubacionTicks).toBeLessThanOrEqual(20 * TICK_RATE);
    for (let t = 0; t < 20 * TICK_RATE + 5; t++) w.tick();
    expect(c.salud).toBe('zombi');
    expect(w.splats.length).toBeGreaterThanOrEqual(1);
    expect(w.stats.zombis).toBeGreaterThanOrEqual(1);
  });

  it('infectar es idempotente sobre no-sanos', () => {
    const w = new World('brote-3', 10);
    const c = w.citizens[0];
    c.salud = 'zombi';
    const antes = w.hashState();
    // infectar no debe tocar a un zombi
    // (se importa aquí para probar la función pura)
    return import('../src/sim/infeccion').then(({ infectar }) => {
      infectar(c, w.rngInfeccion);
      expect(c.salud).toBe('zombi');
      expect(w.hashState()).toBe(antes);
    });
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.

- [ ] **Step 3: Implementar**

**(a)** Crear `src/sim/infeccion.ts`:

```ts
import type { Rng } from './rng';
import type { Citizen } from './types';
import type { World } from './world';
import { INFECCION } from './config';

export function elegirPacienteCero(citizens: readonly Citizen[], rng: Rng): number {
  return rng.int(0, citizens.length - 1);
}

export function infectar(c: Citizen, rng: Rng): void {
  if (c.salud !== 'sano') return;
  c.salud = 'incubando';
  c.incubacionTicks = rng.int(INFECCION.incubacionMinTicks, INFECCION.incubacionMaxTicks);
}

export function actualizarIncubacion(c: Citizen, world: World): void {
  if (c.salud !== 'incubando') return;
  c.incubacionTicks--;
  if (c.incubacionTicks > 0) return;
  c.salud = 'zombi';
  c.animo = 'tranquilo';
  c.cdMordida = 0;
  world.splats.push({ x: c.x, z: c.z, tono: world.rngInfeccion.next() });
}
```

**(b)** En `src/sim/world.ts`: añadir imports y el campo `grid`, y reemplazar `tick()`:

```ts
import { SpatialGrid } from './spatialGrid';
import { actualizarIncubacion, elegirPacienteCero, infectar } from './infeccion';
import { INFECCION } from './config';
```

```ts
  readonly grid = new SpatialGrid<Citizen>();
```

```ts
  tick(): void {
    if (this.tickCount === INFECCION.pacienteCeroTick) {
      infectar(this.citizens[elegirPacienteCero(this.citizens, this.rngInfeccion)], this.rngInfeccion);
    }
    this.grid.rebuild(this.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
    for (const c of this.citizens) {
      if (c.salud === 'eliminado') { c.prevX = c.x; c.prevZ = c.z; continue; }
      updateCitizen(c, this.rngCiudadanos, c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1);
      actualizarIncubacion(c, this);
    }
    this.tickCount++;
  }
```

- [ ] **Step 4: Verificar que pasa** — `npm test` → PASS (incluye determinism.test intacto).

- [ ] **Step 5: Commit**

```bash
git add src/sim/infeccion.ts src/sim/world.ts tests/infeccion.test.ts
git commit -m "feat: paciente cero, incubacion y transformacion con salpicadura"
```

---

### Task 5: Zombis — caza por vista y ruido, mordida

**Files:**
- Create: `src/sim/zombis.ts`
- Modify: `src/sim/world.ts` (dispatch + decaimiento de ruidos)
- Test: `tests/zombis.test.ts`

**Interfaces:**
- Produces: `updateZombi(c: Citizen, world: World): void`. `world.tick()` despacha: zombi → `updateZombi`; humano → `updateCitizen` (+incubación). Los ruidos decaen al final del tick (compactación estable in situ).

- [ ] **Step 1: Test que falla — `tests/zombis.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { TICK_RATE } from '../src/sim/config';

function prepara(): { w: World; zombi: World['citizens'][0]; presa: World['citizens'][0] } {
  const w = new World('caza-1', 2);
  const [zombi, presa] = w.citizens;
  zombi.salud = 'zombi';
  zombi.x = 50; zombi.z = 4; zombi.prevX = 50; zombi.prevZ = 4;
  presa.x = 58; presa.z = 4; presa.prevX = 58; presa.prevZ = 4;
  presa.dirX = 0; presa.dirZ = 1; // que no huya en línea recta por construcción
  return { w, zombi, presa };
}

describe('zombis', () => {
  it('persigue y muerde a la presa más cercana', () => {
    const { w, presa } = prepara();
    for (let t = 0; t < 10 * TICK_RATE; t++) w.tick();
    expect(presa.salud).not.toBe('sano'); // fue mordida (incubando o ya zombi)
  });

  it('la mordida genera un grito (ruido)', () => {
    const { w, zombi, presa } = prepara();
    let ruidoVisto = false;
    for (let t = 0; t < 10 * TICK_RATE; t++) {
      w.tick();
      if (w.ruidos.length > 0) { ruidoVisto = true; break; }
    }
    expect(ruidoVisto).toBe(true);
    expect(zombi.cdMordida).toBeGreaterThanOrEqual(0);
    expect(presa.salud).not.toBe('sano');
  });

  it('los ruidos decaen y desaparecen', () => {
    const w = new World('caza-2', 1);
    w.ruidos.push({ x: 10, z: 10, radio: 12, ticks: 3 });
    for (let t = 0; t < 5; t++) w.tick();
    expect(w.ruidos.length).toBe(0);
  });

  it('sin presa a la vista, erra sin congelarse', () => {
    const w = new World('caza-3', 1);
    const z = w.citizens[0];
    z.salud = 'zombi';
    const x0 = z.x;
    const z0 = z.z;
    for (let t = 0; t < 5 * TICK_RATE; t++) w.tick();
    const movio = Math.abs(z.x - x0) + Math.abs(z.z - z0) > 0.5;
    expect(movio).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.

- [ ] **Step 3: Implementar**

**(a)** Crear `src/sim/zombis.ts`:

```ts
import type { Citizen } from './types';
import type { World } from './world';
import { DT, INFECCION, PANICO, ZOMBIS } from './config';
import { moveWithSlide } from './collision';
import { infectar } from './infeccion';

export function updateZombi(c: Citizen, world: World): void {
  c.prevX = c.x;
  c.prevZ = c.z;
  if (c.cdMordida > 0) c.cdMordida--;

  // presa: el humano activo más cercano a la vista
  let objetivo: Citizen | null = null;
  let mejorD2 = ZOMBIS.radioVision * ZOMBIS.radioVision;
  for (const i of world.grid.queryCircle(c.x, c.z, ZOMBIS.radioVision)) {
    const o = world.citizens[i];
    if (o.salud === 'zombi' || o.salud === 'eliminado' || o.dentroDe >= 0) continue;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      objetivo = o;
    }
  }

  let dx = 0;
  let dz = 0;
  let vel = ZOMBIS.velocidadErrante;
  if (objetivo) {
    dx = objetivo.x - c.x;
    dz = objetivo.z - c.z;
    vel = ZOMBIS.velocidad;
  } else {
    // sin presa: ir hacia el ruido más cercano (se oye 3× su radio)
    let mejorR2 = Infinity;
    for (const r of world.ruidos) {
      const d2 = (r.x - c.x) ** 2 + (r.z - c.z) ** 2;
      if (d2 < (r.radio * 3) ** 2 && d2 < mejorR2) {
        mejorR2 = d2;
        dx = r.x - c.x;
        dz = r.z - c.z;
      }
    }
    if (mejorR2 < Infinity) {
      vel = ZOMBIS.velocidad * 0.8;
    } else if (world.rngZombis.chance(ZOMBIS.probCambiarRumbo) || (c.dirX === 0 && c.dirZ === 0)) {
      const ang = world.rngZombis.next() * Math.PI * 2;
      c.dirX = Math.cos(ang);
      c.dirZ = Math.sin(ang);
    }
  }

  const len = Math.hypot(dx, dz);
  if (len > 0.001) {
    c.dirX = dx / len;
    c.dirZ = dz / len;
  }
  moveWithSlide(world.city, c, c.x + c.dirX * vel * DT, c.z + c.dirZ * vel * DT);

  // mordida
  if (objetivo && c.cdMordida === 0) {
    const d2 = (objetivo.x - c.x) ** 2 + (objetivo.z - c.z) ** 2;
    if (d2 <= INFECCION.radioMordida ** 2) {
      infectar(objetivo, world.rngInfeccion);
      objetivo.animo = 'panico';
      objetivo.animoTicks = 0;
      world.ruidos.push({
        x: objetivo.x,
        z: objetivo.z,
        radio: PANICO.radioGrito,
        ticks: PANICO.duracionGritoTicks,
      });
      c.cdMordida = ZOMBIS.enfriamientoMordidaTicks;
    }
  }
}
```

**(b)** En `src/sim/world.ts`: importar `updateZombi` y reemplazar el bucle del `tick()` por:

```ts
    for (const c of this.citizens) {
      if (c.salud === 'eliminado') { c.prevX = c.x; c.prevZ = c.z; continue; }
      if (c.salud === 'zombi') {
        updateZombi(c, this);
      } else {
        updateCitizen(c, this.rngCiudadanos, c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1);
        actualizarIncubacion(c, this);
      }
    }
    // decaimiento de ruidos (compactación estable, sin filter para no asignar)
    let w = 0;
    for (const r of this.ruidos) {
      r.ticks--;
      if (r.ticks > 0) this.ruidos[w++] = r;
    }
    this.ruidos.length = w;
```

- [ ] **Step 4: Verificar que pasa** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/zombis.ts src/sim/world.ts tests/zombis.test.ts
git commit -m "feat: zombis que cazan por vista y ruido, mordida con grito"
```

---

### Task 6: Pánico, huida y personalidades

**Files:**
- Create: `src/sim/panico.ts`
- Modify: `src/sim/world.ts` (humanos → `updateHumano`), `tests/determinism.test.ts` (test 3: ya no aplica "siempre en calles")
- Test: `tests/panico.test.ts`

**Interfaces:**
- Produces: `updateHumano(c: Citizen, world: World): void` — percepción de zombis (umbral por personalidad), grito al entrar en pánico, contagio de pánico por ruidos (prob. por personalidad POR TICK), huida vectorial con colisión, calma tras `ticksCalmarse` y re-enganche a la calle más cercana (teletransporte ⇒ resetea prev).
- `world.tick()` usa `updateHumano` para humanos (que internamente llama a `updateCitizen` cuando está tranquilo).

- [ ] **Step 1: Test que falla — `tests/panico.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { isStreet } from '../src/sim/cityGen';
import { PANICO, TICK_RATE } from '../src/sim/config';

function conZombi(seed: string): { w: World; humano: World['citizens'][0]; zombi: World['citizens'][0] } {
  const w = new World(seed, 2);
  const [humano, zombi] = w.citizens;
  zombi.salud = 'zombi';
  zombi.x = 50; zombi.z = 4; zombi.prevX = 50; zombi.prevZ = 4;
  humano.x = 56; humano.z = 4; humano.prevX = 56; humano.prevZ = 4;
  humano.personality = 'cobarde';
  return { w, humano, zombi };
}

describe('pánico', () => {
  it('un cobarde entra en pánico al ver un zombi y grita', () => {
    const { w, humano } = conZombi('miedo-1');
    w.tick();
    expect(humano.animo).toBe('panico');
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1);
  });

  it('huye alejándose del zombi', () => {
    const { w, humano, zombi } = conZombi('miedo-2');
    const d0 = Math.hypot(humano.x - zombi.x, humano.z - zombi.z);
    // congelar al zombi para medir solo la huida
    zombi.salud = 'eliminado';
    humano.animo = 'panico';
    humano.dirX = 1; humano.dirZ = 0;
    w.tick();
    // sin zombis a la vista sigue en pánico y avanza en su dirección de huida
    const d1 = Math.hypot(humano.x - zombi.x, humano.z - zombi.z);
    expect(d1).toBeGreaterThan(d0 - 0.01);
  });

  it('se calma tras el tiempo configurado y vuelve a una calle', () => {
    const { w, humano, zombi } = conZombi('miedo-3');
    w.tick(); // entra en pánico
    zombi.salud = 'eliminado'; // ya no hay amenaza
    for (let t = 0; t <= PANICO.ticksCalmarse + TICK_RATE; t++) w.tick();
    expect(humano.animo).toBe('tranquilo');
    expect(isStreet(humano.x, humano.z)).toBe(true);
  });

  it('dos mundos con pánico siguen siendo deterministas', () => {
    const a = new World('miedo-4', 300);
    const b = new World('miedo-4', 300);
    for (let t = 0; t < 20 * TICK_RATE; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.

- [ ] **Step 3: Implementar**

**(a)** Crear `src/sim/panico.ts`:

```ts
import type { Citizen } from './types';
import type { World } from './world';
import {
  CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH, DT,
  INFECCION, PANICO, PROB_PANICO_POR_GRITO,
} from './config';
import { corridorCenter } from './cityGen';
import { moveWithSlide } from './collision';
import { updateCitizen } from './citizens';

/** A qué distancia de un zombi reacciona cada personalidad. */
const UMBRAL_VER: Record<string, number> = {
  cobarde: 15,
  protector: 12,
  egoista: 12,
  lider: 10,
  valiente: 8,
  imprudente: 5,
};

export function updateHumano(c: Citizen, world: World): void {
  // 1) percepción directa de zombis
  let n = 0;
  let cx = 0;
  let cz = 0;
  let mejorD2 = Infinity;
  for (const i of world.grid.queryCircle(c.x, c.z, PANICO.radioVerZombi)) {
    const o = world.citizens[i];
    if (o.salud !== 'zombi') continue;
    n++;
    cx += o.x;
    cz += o.z;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) mejorD2 = d2;
  }
  if (n > 0 && c.animo === 'tranquilo' && Math.sqrt(mejorD2) <= UMBRAL_VER[c.personality]) {
    entrarEnPanico(c, world, true);
  }

  // 2) contagio de pánico por gritos
  if (c.animo === 'tranquilo') {
    for (const r of world.ruidos) {
      const d2 = (r.x - c.x) ** 2 + (r.z - c.z) ** 2;
      if (d2 <= r.radio * r.radio && world.rngPanico.chance(PROB_PANICO_POR_GRITO[c.personality])) {
        entrarEnPanico(c, world, false);
        break;
      }
    }
  }

  if (c.animo === 'panico') {
    c.prevX = c.x;
    c.prevZ = c.z;
    if (n > 0) {
      const dx = c.x - cx / n;
      const dz = c.z - cz / n;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) {
        c.dirX = dx / len;
        c.dirZ = dz / len;
      }
      c.animoTicks = 0;
    } else {
      c.animoTicks++;
      if (c.animoTicks >= PANICO.ticksCalmarse) {
        calmarse(c, world);
        return;
      }
    }
    const vel = PANICO.velocidadHuida * (c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1);
    moveWithSlide(world.city, c, c.x + c.dirX * vel * DT, c.z + c.dirZ * vel * DT);
  } else {
    updateCitizen(c, world.rngCiudadanos, c.salud === 'incubando' ? INFECCION.velocidadIncubando : 1);
  }
}

function entrarEnPanico(c: Citizen, world: World, grita: boolean): void {
  c.animo = 'panico';
  c.animoTicks = 0;
  if (grita) {
    world.ruidos.push({ x: c.x, z: c.z, radio: PANICO.radioGrito, ticks: PANICO.duracionGritoTicks });
  }
}

/** Vuelve a la calma y se re-engancha a la calle más cercana (teletransporte corto). */
function calmarse(c: Citizen, world: World): void {
  c.animo = 'tranquilo';
  const kx = Math.max(0, Math.min(CITY.blocksX, Math.round((c.x - CITY.streetWidth / 2) / CITY_PERIOD)));
  const kz = Math.max(0, Math.min(CITY.blocksY, Math.round((c.z - CITY.streetWidth / 2) / CITY_PERIOD)));
  const cxv = corridorCenter(kx);
  const czh = corridorCenter(kz);
  if (Math.abs(cxv - c.x) <= Math.abs(czh - c.z)) {
    c.x = cxv + c.laneOffset;
    c.dirX = 0;
    c.dirZ = world.rngPanico.chance(0.5) ? 1 : -1;
  } else {
    c.z = czh + c.laneOffset;
    c.dirZ = 0;
    c.dirX = world.rngPanico.chance(0.5) ? 1 : -1;
  }
  c.lastCrossing = -1;
  c.x = Math.min(Math.max(c.x, 1), CITY_WIDTH - 1);
  c.z = Math.min(Math.max(c.z, 1), CITY_DEPTH - 1);
  c.prevX = c.x; // teletransporte: sin estela en el render
  c.prevZ = c.z;
}
```

**(b)** En `src/sim/world.ts`: importar `updateHumano` y en el dispatch del tick reemplazar la rama de humanos:

```ts
      } else {
        updateHumano(c, this);
        actualizarIncubacion(c, this);
      }
```

**(c)** En `tests/determinism.test.ts`, reemplazar el test `'los ciudadanos siguen sobre las calles tras caminar'` por:

```ts
  it('ningún ciudadano termina dentro de un edificio', async () => {
    const { buildingAt } = await import('../src/sim/collision');
    const w = new World('caminata', 300);
    for (let t = 0; t < 900; t++) w.tick();
    for (const c of w.citizens) {
      if (c.salud === 'eliminado' || c.dentroDe >= 0) continue;
      expect(buildingAt(w.city, c.x, c.z)).toBeNull();
    }
  });
```

- [ ] **Step 4: Verificar que pasa** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/panico.ts src/sim/world.ts tests/panico.test.ts tests/determinism.test.ts
git commit -m "feat: panico contagioso con personalidades, huida y calma"
```

---

### Task 7: Combate en grupo

**Files:**
- Create: `src/sim/combate.ts`
- Modify: `src/sim/world.ts` (llamar `resolverCombates` tras el bucle)
- Test: `tests/combate.test.ts`

**Interfaces:**
- Produces: `resolverCombates(world: World): void` — por cada zombi activo sin otros zombis cerca: si hay ≥3 humanos a ≤`radioPelea` y al menos un `valiente`, el zombi pasa a `'eliminado'` (+salpicadura); con prob. `probInfeccionAlGanar` un participante sale infectado (stream `rngCombate`).

- [ ] **Step 1: Test que falla — `tests/combate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { resolverCombates } from '../src/sim/combate';

function escena(seed: string, humanos: number, conValiente: boolean): World {
  const w = new World(seed, humanos + 1);
  const z = w.citizens[0];
  z.salud = 'zombi';
  z.x = 50; z.z = 4;
  for (let i = 1; i <= humanos; i++) {
    const h = w.citizens[i];
    h.x = 50 + (i % 2 === 0 ? 1 : -1) * (0.8 + i * 0.1);
    h.z = 4 + (i % 3 === 0 ? 1 : -0.5);
    h.personality = conValiente && i === 1 ? 'valiente' : 'cobarde';
  }
  w.grid.rebuild(w.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
  return w;
}

describe('combate en grupo', () => {
  it('3 humanos con un valiente eliminan a un zombi aislado', () => {
    const w = escena('pelea-1', 3, true);
    resolverCombates(w);
    expect(w.citizens[0].salud).toBe('eliminado');
    expect(w.splats.length).toBe(1);
  });

  it('sin valiente no se atreven', () => {
    const w = escena('pelea-2', 3, false);
    resolverCombates(w);
    expect(w.citizens[0].salud).toBe('zombi');
  });

  it('2 humanos no bastan', () => {
    const w = escena('pelea-3', 2, true);
    resolverCombates(w);
    expect(w.citizens[0].salud).toBe('zombi');
  });

  it('es determinista (mismo seed ⇒ mismo resultado de infección)', () => {
    const a = escena('pelea-4', 4, true);
    const b = escena('pelea-4', 4, true);
    resolverCombates(a);
    resolverCombates(b);
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.

- [ ] **Step 3: Implementar**

**(a)** Crear `src/sim/combate.ts`:

```ts
import type { Citizen } from './types';
import type { World } from './world';
import { COMBATE } from './config';
import { infectar } from './infeccion';

/**
 * 3+ humanos junto a 1 zombi aislado (con al menos un valiente): lo eliminan.
 * Uno contra uno es suicidio (eso ya lo resuelve la mordida del zombi).
 */
export function resolverCombates(world: World): void {
  for (const z of world.citizens) {
    if (z.salud !== 'zombi' || z.dentroDe >= 0) continue;
    let zombisCerca = 0;
    const luchadores: Citizen[] = [];
    for (const i of world.grid.queryCircle(z.x, z.z, COMBATE.radioPelea)) {
      const o = world.citizens[i];
      if (o === z) continue;
      if (o.salud === 'zombi') zombisCerca++;
      else if (o.salud !== 'eliminado' && o.dentroDe < 0) luchadores.push(o);
    }
    if (
      zombisCerca === 0 &&
      luchadores.length >= COMBATE.humanosParaGanar &&
      luchadores.some((h) => h.personality === 'valiente')
    ) {
      z.salud = 'eliminado';
      world.splats.push({ x: z.x, z: z.z, tono: world.rngCombate.next() });
      if (world.rngCombate.chance(COMBATE.probInfeccionAlGanar)) {
        infectar(world.rngCombate.pick(luchadores), world.rngCombate);
      }
    }
  }
}
```

**(b)** En `src/sim/world.ts`: importar `resolverCombates` y llamarlo justo después del bucle de ciudadanos (antes del decaimiento de ruidos):

```ts
    resolverCombates(this);
```

- [ ] **Step 4: Verificar que pasa** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/combate.ts src/sim/world.ts tests/combate.test.ts
git commit -m "feat: combate en grupo — tres humanos y un valiente vencen a un zombi aislado"
```

---

### Task 8: Refugio en edificios y brecha interior

**Files:**
- Create: `src/sim/refugio.ts`
- Modify: `src/sim/panico.ts` (los que huyen intentan refugiarse), `src/sim/infeccion.ts` (transformación dentro ⇒ brecha), `src/sim/world.ts` (incubación también corre dentro)
- Test: `tests/refugio.test.ts`

**Interfaces:**
- Produces: `intentarRefugio(c: Citizen, world: World): void`; `romperEdificio(world: World, idEdificio: number): void`.
- Reglas: solo edificios `jugable`, sin brecha, con cupo (`REFUGIO.capacidad`). Un ciudadano dentro no se mueve, no se dibuja, no está en la rejilla, pero su incubación sigue. Si se transforma dentro: brecha — todos salen en anillo a la acera (teletransporte ⇒ resetea prev), en pánico; el edificio queda inutilizado y suena una brecha (ruido doble).

- [ ] **Step 1: Test que falla — `tests/refugio.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { intentarRefugio, romperEdificio } from '../src/sim/refugio';
import { buildingAt } from '../src/sim/collision';

function juntoAJugable(w: World, c: World['citizens'][0]): number {
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  c.x = b.x - 1.5; // en la acera, pegado a la pared oeste
  c.z = b.z + 5;
  c.prevX = c.x;
  c.prevZ = c.z;
  return b.id;
}

describe('refugio', () => {
  it('un ciudadano en pánico junto a un edificio jugable entra', () => {
    const w = new World('refugio-1', 5);
    const c = w.citizens[0];
    const id = juntoAJugable(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(id);
    expect(w.ocupantes[id]).toBe(1);
  });

  it('no entra si hay brecha o no hay cupo', () => {
    const w = new World('refugio-2', 5);
    const c = w.citizens[0];
    const id = juntoAJugable(w, c);
    w.brecha[id] = true;
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(-1);
  });

  it('una transformación dentro revienta el edificio: todos salen en pánico a la acera', () => {
    const w = new World('refugio-3', 6);
    const id = juntoAJugable(w, w.citizens[0]);
    for (let i = 0; i < 5; i++) {
      w.citizens[i].dentroDe = id;
      w.ocupantes[id]++;
    }
    w.citizens[0].salud = 'zombi'; // el que se transformó
    romperEdificio(w, id);
    expect(w.brecha[id]).toBe(true);
    expect(w.ocupantes[id]).toBe(0);
    for (let i = 0; i < 5; i++) {
      const o = w.citizens[i];
      expect(o.dentroDe).toBe(-1);
      expect(buildingAt(w.city, o.x, o.z)).toBeNull(); // en la acera, no dentro
      if (o.salud !== 'zombi') expect(o.animo).toBe('panico');
      expect(o.prevX).toBe(o.x); // sin estela
    }
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1);
  });

  it('la incubación sigue corriendo dentro del edificio (bomba de tiempo)', () => {
    const w = new World('refugio-4', 3);
    const c = w.citizens[0];
    const id = juntoAJugable(w, c);
    c.salud = 'incubando';
    c.incubacionTicks = 3;
    c.dentroDe = id;
    w.ocupantes[id] = 1;
    for (let t = 0; t < 5; t++) w.tick();
    expect(c.salud).toBe('zombi');
    expect(w.brecha[id]).toBe(true);
    expect(c.dentroDe).toBe(-1);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.

- [ ] **Step 3: Implementar**

**(a)** Crear `src/sim/refugio.ts`:

```ts
import type { Citizen } from './types';
import type { World } from './world';
import { CITY, CITY_PERIOD, PANICO, REFUGIO } from './config';

/** Si hay un edificio jugable pegado (bloque propio o vecinos), entra a refugiarse. */
export function intentarRefugio(c: Citizen, world: World): void {
  const bx = Math.floor(c.x / CITY_PERIOD);
  const bz = Math.floor(c.z / CITY_PERIOD);
  const candidatos: ReadonlyArray<readonly [number, number]> = [
    [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
  ];
  for (const [ix, iz] of candidatos) {
    if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
    const b = world.city.buildings[ix * CITY.blocksY + iz];
    if (b.kind !== 'jugable' || world.brecha[b.id]) continue;
    if (world.ocupantes[b.id] >= REFUGIO.capacidad) continue;
    const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.width));
    const dz = Math.max(b.z - c.z, 0, c.z - (b.z + b.depth));
    if (Math.hypot(dx, dz) <= REFUGIO.radioEntrar) {
      c.dentroDe = b.id;
      world.ocupantes[b.id]++;
      c.prevX = c.x;
      c.prevZ = c.z;
      return;
    }
  }
}

/** Un infectado se transformó dentro: el refugio revienta desde dentro. */
export function romperEdificio(world: World, idEdificio: number): void {
  const b = world.city.buildings[idEdificio]; // id === índice por construcción
  world.brecha[idEdificio] = true;
  const dentro = world.citizens.filter((o) => o.dentroDe === idEdificio);
  const cx = b.x + b.width / 2;
  const cz = b.z + b.depth / 2;
  dentro.forEach((o, k) => {
    const ang = (k / Math.max(dentro.length, 1)) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    // proyectar al perímetro CUADRADO (+1 m): en las diagonales un anillo
    // circular caería dentro del propio edificio
    const esc = (b.width / 2 + 1) / Math.max(Math.abs(dx), Math.abs(dz));
    o.x = cx + dx * esc;
    o.z = cz + dz * esc;
    o.prevX = o.x; // teletransporte: sin estela
    o.prevZ = o.z;
    o.dentroDe = -1;
    if (o.salud !== 'zombi') {
      o.animo = 'panico';
      o.animoTicks = 0;
    }
  });
  world.ocupantes[idEdificio] = 0;
  world.ruidos.push({
    x: cx,
    z: cz,
    radio: PANICO.radioGrito * 2,
    ticks: PANICO.duracionGritoTicks * 2,
  });
  world.splats.push({ x: cx, z: cz, tono: world.rngInfeccion.next() });
}
```

**(b)** En `src/sim/infeccion.ts`: importar y llamar a la brecha al final de `actualizarIncubacion` (después del push del splat):

```ts
import { romperEdificio } from './refugio';
```

```ts
  if (c.dentroDe >= 0) romperEdificio(world, c.dentroDe);
```

**(c)** En `src/sim/panico.ts`: importar `intentarRefugio` y llamarlo al final de la rama de pánico (después del `moveWithSlide` de la huida):

```ts
import { intentarRefugio } from './refugio';
```

```ts
    intentarRefugio(c, world);
```

**(d)** En `src/sim/world.ts`, en el dispatch del tick, reemplazar la rama de `dentroDe` (los refugiados no se mueven pero incuban):

```ts
      if (c.dentroDe >= 0) {
        c.prevX = c.x;
        c.prevZ = c.z;
        actualizarIncubacion(c, this);
        continue;
      }
```

(Colocar esa rama justo después de la de `eliminado` y antes del resto.)

- [ ] **Step 4: Verificar que pasa** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/refugio.ts src/sim/infeccion.ts src/sim/panico.ts src/sim/world.ts tests/refugio.test.ts
git commit -m "feat: refugio en edificios jugables y brecha por transformacion interior"
```

---

### Task 9: Render del brote — colores, salpicaduras, anti-oclusión, HUD

**Files:**
- Create: `src/render/splatsView.ts`
- Modify: `src/render/citizensView.ts`, `src/render/cityView.ts` (a clase con anti-oclusión), `src/render/cameraRig.ts` (exponer foco), `src/ui/hud.ts`, `src/game/main.ts`
- Sin tests unitarios (render); verificación en navegador.

**Interfaces:**
- `CitizensView.update(citizens, alpha)` ahora: color por salud (sano `0x9fd8ff`, incubando `0xffc46b`, zombi `0x8bff5a`), y oculta (escala ~0) a `eliminado`/`dentroDe >= 0`.
- `SplatsView { constructor(scene); update(splats: readonly Splat[]): void }` — instanciado incremental, capacidad 3000, paleta viva `[0xff3ea5, 0x3bff9d, 0x3ec9ff, 0xffe93e, 0xa63eff, 0xff6b3e]`.
- `CityView { constructor(scene, city); updateOcclusion(camX, camZ, focoX, focoZ): void }` — aplana a 3 m los edificios (altura > 6) que cruzan el segmento cámara→foco.
- `CameraRig` expone `get focusPoint(): { x: number; z: number }`.
- HUD: `Vivos: V · Zombis: Z · Tiempo: M:SS · Semilla: S`, cacheando el string (no reescribir si no cambió).

- [ ] **Step 1: `src/render/splatsView.ts`**

```ts
import * as THREE from 'three';
import type { Splat } from '../sim/types';

const MAX = 3000;
const PALETA = [0xff3ea5, 0x3bff9d, 0x3ec9ff, 0xffe93e, 0xa63eff, 0xff6b3e];

/** Manchas de pintura en el suelo: la "sangre" del juego. */
export class SplatsView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private count = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CircleGeometry(0.7, 9);
    const mat = new THREE.MeshBasicMaterial({ depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(splats: readonly Splat[]): void {
    const limite = Math.min(splats.length, MAX);
    if (this.count >= limite) return;
    while (this.count < limite) {
      const s = splats[this.count];
      this.dummy.position.set(s.x, 0.02 + this.count * 0.0002, s.z);
      this.dummy.rotation.set(-Math.PI / 2, 0, s.tono * Math.PI * 2);
      this.dummy.scale.setScalar(1.2 + s.tono * 1.6);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(this.count, this.dummy.matrix);
      this.tmp.setHex(PALETA[Math.floor(s.tono * PALETA.length) % PALETA.length]);
      this.mesh.setColorAt(this.count, this.tmp);
      this.count++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
```

- [ ] **Step 2: Reemplazar `src/render/citizensView.ts`**

```ts
import * as THREE from 'three';
import type { Citizen, Salud } from '../sim/types';

const COLORES: Record<Salud, number> = {
  sano: 0x9fd8ff,
  incubando: 0xffc46b,
  zombi: 0x8bff5a,
  eliminado: 0x8bff5a,
};

export class CitizensView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private readonly saludCache: Array<Salud | null>;

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.CapsuleGeometry(0.3, 1.1, 3, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.saludCache = new Array<Salud | null>(count).fill(null);
    scene.add(this.mesh);
  }

  update(citizens: Citizen[], alpha: number): void {
    let colorSucio = false;
    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i];
      const oculto = c.salud === 'eliminado' || c.dentroDe >= 0;
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      this.dummy.position.set(x, 0.85, z);
      this.dummy.scale.setScalar(oculto ? 0.0001 : 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      if (this.saludCache[i] !== c.salud) {
        this.saludCache[i] = c.salud;
        this.tmp.setHex(COLORES[c.salud]);
        this.mesh.setColorAt(i, this.tmp);
        colorSucio = true;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorSucio && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
```

- [ ] **Step 3: Reemplazar `src/render/cityView.ts` (clase con anti-oclusión)**

```ts
import * as THREE from 'three';
import type { CityLayout, Building } from '../sim/cityGen';

/** ¿El segmento (x1,z1)→(x2,z2) cruza el rectángulo del edificio? (Liang-Barsky) */
function segmentoCruzaRect(x1: number, z1: number, x2: number, z2: number, b: Building): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - b.x, b.x + b.width - x1, z1 - b.z, b.z + b.depth - z1];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return false;
      continue;
    }
    const r = q[k] / p[k];
    if (p[k] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

export class CityView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly city: CityLayout;
  private readonly m = new THREE.Matrix4();
  private readonly aplanados = new Set<number>();

  constructor(scene: THREE.Scene, city: CityLayout) {
    this.city = city;

    const suelo = new THREE.Mesh(
      new THREE.PlaneGeometry(city.width, city.depth),
      new THREE.MeshLambertMaterial({ color: 0x2b2f36 })
    );
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.set(city.width / 2, 0, city.depth / 2);
    scene.add(suelo);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, city.buildings.length);
    const colorFondo = new THREE.Color(0x3a4150);
    const colorJugable = new THREE.Color(0x5a6b7d);
    city.buildings.forEach((b, i) => {
      this.setAltura(i, b.height);
      this.mesh.setColorAt(i, b.kind === 'jugable' ? colorJugable : colorFondo);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  private setAltura(i: number, h: number): void {
    const b = this.city.buildings[i];
    this.m.makeScale(b.width, h, b.depth);
    this.m.setPosition(b.x + b.width / 2, h / 2, b.z + b.depth / 2);
    this.mesh.setMatrixAt(i, this.m);
  }

  /** Aplana a 3 m los edificios altos que cruzan la línea cámara→foco. */
  updateOcclusion(camX: number, camZ: number, focoX: number, focoZ: number): void {
    let sucio = false;
    this.city.buildings.forEach((b, i) => {
      const debe = b.height > 6 && segmentoCruzaRect(camX, camZ, focoX, focoZ, b);
      const estaba = this.aplanados.has(i);
      if (debe === estaba) return;
      if (debe) this.aplanados.add(i);
      else this.aplanados.delete(i);
      this.setAltura(i, debe ? 3 : b.height);
      sucio = true;
    });
    if (sucio) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
```

- [ ] **Step 4: En `src/render/cameraRig.ts`, exponer el foco** (añadir dentro de la clase):

```ts
  get focusPoint(): { x: number; z: number } {
    return { x: this.focus.x, z: this.focus.z };
  }
```

- [ ] **Step 5: Reemplazar `src/ui/hud.ts`**

```ts
import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';

export class Hud {
  private readonly el = document.getElementById('hud') as HTMLDivElement;
  private readonly seed: string;
  private ultimo = '';

  constructor(seed: string) {
    this.seed = seed;
  }

  update(world: World): void {
    const segs = Math.floor(world.tickCount / TICK_RATE);
    const mm = Math.floor(segs / 60);
    const ss = (segs % 60).toString().padStart(2, '0');
    const { vivos, zombis } = world.stats;
    const texto = `Vivos: ${vivos} · Zombis: ${zombis} · Tiempo: ${mm}:${ss} · Semilla: ${this.seed}`;
    if (texto !== this.ultimo) {
      this.ultimo = texto;
      this.el.textContent = texto;
    }
  }
}
```

- [ ] **Step 6: Reemplazar `src/game/main.ts`**

```ts
import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { CityView } from '../render/cityView';
import { CitizensView } from '../render/citizensView';
import { SplatsView } from '../render/splatsView';
import { CameraRig } from '../render/cameraRig';
import { startLoop } from './loop';
import { Hud } from '../ui/hud';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const seed = new URLSearchParams(location.search).get('seed') ?? 'PANDEMIA';

const world = new World(seed);
const { renderer, scene } = createScene(canvas);
const cityView = new CityView(scene, world.city);
const citizensView = new CitizensView(scene, world.citizens.length);
const splatsView = new SplatsView(scene);
const rig = new CameraRig(canvas, { w: world.city.width, d: world.city.depth });
const hud = new Hud(seed);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startLoop(world, (alpha) => {
  rig.update();
  const foco = rig.focusPoint;
  cityView.updateOcclusion(rig.camera.position.x, rig.camera.position.z, foco.x, foco.z);
  citizensView.update(world.citizens, alpha);
  splatsView.update(world.splats);
  hud.update(world);
  renderer.render(scene, rig.camera);
});
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit` → limpio. `npm test` → todos verdes.
Run: `npm run dev` y verificar en navegador (con herramientas de preview si están disponibles):
- A los ~5 s empieza el brote; a los ~20 s hay zombis verdes persiguiendo gente, gritos en cadena, manchas de pintura de colores en el suelo.
- Un incubando se ve ámbar; al transformarse aparece la salpicadura.
- Acercar la cámara detrás de una torre alta: la torre se aplana a 3 m y se ve la calle (¡el arreglo que pidió el usuario!). Al mover la cámara, recupera su altura.
- HUD: "Vivos: N · Zombis: Z · …" con los números moviéndose.
- Consola sin errores. Detener el servidor al terminar.

- [ ] **Step 8: Commit**

```bash
git add src/render src/ui src/game/main.ts
git commit -m "feat: render del brote — estados por color, pintura, anti-oclusion de camara y HUD vivo"
```

---

### Task 10: Balance y verificación final del Plan 2

**Files:**
- Test: `tests/balance.test.ts`
- Modify (solo si el balance lo exige): constantes de `src/sim/config.ts`; `CLAUDE.md` (lecciones).

**Reglas de ajuste (ÚNICA tarea autorizada a tocar balance):** si el test de colapso falla, ajustar SOLO estos valores, en este orden de preferencia, re-ejecutando el test tras cada cambio y documentando los valores finales en el reporte: `ZOMBIS.velocidad` (±0.4), `ZOMBIS.radioVision` (±5), `PANICO.velocidadHuida` (±0.3), `PROB_PANICO_POR_GRITO` (×0.5 a ×2), `INFECCION.incubacionMin/MaxTicks` (±5 s), `REFUGIO.capacidad` (±20).

- [ ] **Step 1: Test que falla (o pasa a la primera) — `tests/balance.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { TICK_RATE } from '../src/sim/config';

describe('balance del brote (sin intervención del jugador)', () => {
  it(
    'la ciudad colapsa (<20% vivos) entre 1:30 y 8:00',
    () => {
      const w = new World('balance-1');
      const limite = 8 * 60 * TICK_RATE;
      let colapso = -1;
      for (let t = 0; t < limite; t++) {
        w.tick();
        if (w.stats.vivos <= w.citizens.length * 0.2) {
          colapso = t;
          break;
        }
      }
      expect(colapso).toBeGreaterThan(90 * TICK_RATE);
      expect(colapso).toBeLessThan(limite);
    },
    180_000
  );

  it(
    'con otra semilla también colapsa dentro de la ventana',
    () => {
      const w = new World('balance-2');
      const limite = 8 * 60 * TICK_RATE;
      let colapso = -1;
      for (let t = 0; t < limite; t++) {
        w.tick();
        if (w.stats.vivos <= w.citizens.length * 0.2) {
          colapso = t;
          break;
        }
      }
      expect(colapso).toBeGreaterThan(90 * TICK_RATE);
      expect(colapso).toBeLessThan(limite);
    },
    180_000
  );
});
```

- [ ] **Step 2: Correr y ajustar si hace falta**

Run: `npm test` (el balance puede tardar — hasta ~3 min por test). Si falla: aplicar las reglas de ajuste de arriba, re-correr, documentar. Si pasa a la primera: perfecto, no tocar nada.

- [ ] **Step 3: Verificación completa**

- `npm test` → TODO verde (suite completa, incluidos los 24 del Plan 1 adaptados).
- `npx tsc --noEmit` → limpio.
- PowerShell: `Select-String -Path src/sim/*.ts -Pattern "from 'three'|Math.random|Date.now|performance.now"` → vacío.
- Navegador: 2 minutos de brote con FPS estables y consola limpia; verificar con `?seed=alfa` recargado dos veces que el brote es idéntico (mismo paciente cero, mismas primeras transformaciones).

- [ ] **Step 4: Lecciones y commit final**

Añadir a `CLAUDE.md` («Lecciones aprendidas») 1–2 líneas reales de esta fase (p. ej., valores de balance que funcionaron y por qué). Luego:

```bash
git add -A
git commit -m "chore: el brote verificado y balanceado (Plan 2 completo)"
git push
```

Marcar todos los checkboxes de este documento y avisar que el Plan 2 está listo para la revisión final de rama.

---

### Task 10b (adenda): Asedio a los refugios — y balance definitivo

**Contexto:** la Task 10 quedó BLOCKED con datos: los refugios llenos sin infectado dentro son "puerto seguro" permanente y el colapso nunca baja del ~20% de vivos (mejor intento: 9:08). La causa es un recorte de este plan, no del diseño — el diseño aprobado (§3.3) dice que los zombis PRESIONAN los refugios. Esta adenda restaura esa mecánica en versión simple y repite el cierre de la Task 10.

**Files:**
- Create: `src/sim/asedio.ts`
- Modify: `src/sim/config.ts` (constante `ASEDIO`), `src/sim/world.ts` (campo `presion` + llamada), `tests/infeccion.test.ts` (usar constantes en vez de literales 10–20 s)
- Test: `tests/asedio.test.ts` (+ re-ejecutar `tests/balance.test.ts`, que ya existe sin commitear — consérvalo tal cual)

**Interfaces:**
- `config.ts` suma:

```ts
export const ASEDIO = {
  radio: 6, // m alrededor del edificio donde los zombis presionan
  presionPorZombi: 1, // presión por zombi por tick
  alivioPorTick: 2, // la presión decae sin zombis
  resistencia: 600, // presión para brecha (≈20 s con 1 zombi, ≈4 s con 5)
  ruidoCadaTicks: 90, // los refugiados hacen ruido periódico
  ruidoRadio: 10,
  ruidoTicks: 30,
} as const;
```

- `asedio.ts`: `resolverAsedios(world: World): void`.
- `world.ts`: `readonly presion: number[]` (inicializado a 0 por edificio, como `ocupantes`); llamada `resolverAsedios(this)` inmediatamente DESPUÉS de `resolverCombates(this)` y antes del decaimiento de ruidos.

- [ ] **Step 1: Test que falla — `tests/asedio.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { resolverAsedios } from '../src/sim/asedio';
import { ASEDIO } from '../src/sim/config';
import { buildingAt } from '../src/sim/collision';

/** Prepara un refugio ocupado con `nZombis` pegados a la pared. */
function sitiado(seed: string, nZombis: number): { w: World; id: number } {
  const w = new World(seed, nZombis + 3);
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  // 3 refugiados dentro
  for (let i = 0; i < 3; i++) {
    w.citizens[i].dentroDe = b.id;
  }
  w.ocupantes[b.id] = 3;
  // zombis pegados a la pared oeste
  for (let i = 3; i < 3 + nZombis; i++) {
    const z = w.citizens[i];
    z.salud = 'zombi';
    z.x = b.x - 1;
    z.z = b.z + 4 + i;
    z.prevX = z.x;
    z.prevZ = z.z;
  }
  w.grid.rebuild(w.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
  return { w, id: b.id };
}

describe('asedio a refugios', () => {
  it('cinco zombis pegados revientan un refugio ocupado', () => {
    const { w, id } = sitiado('asedio-1', 5);
    const ticksNecesarios = Math.ceil(ASEDIO.resistencia / (5 * ASEDIO.presionPorZombi));
    for (let t = 0; t < ticksNecesarios + 2; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(true);
    // los refugiados salieron a la acera, en pánico
    for (let i = 0; i < 3; i++) {
      expect(w.citizens[i].dentroDe).toBe(-1);
      expect(w.citizens[i].animo).toBe('panico');
      expect(buildingAt(w.city, w.citizens[i].x, w.citizens[i].z)).toBeNull();
    }
  });

  it('sin zombis, la presión decae y no hay brecha', () => {
    const { w, id } = sitiado('asedio-2', 0);
    for (let t = 0; t < 200; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(false);
    expect(w.presion[id]).toBe(0);
  });

  it('un edificio vacío no acumula presión ni hace ruido', () => {
    const { w, id } = sitiado('asedio-3', 4);
    // vaciar el refugio
    for (let i = 0; i < 3; i++) w.citizens[i].dentroDe = -1;
    w.ocupantes[id] = 0;
    for (let t = 0; t < 100; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(false);
    expect(w.presion[id]).toBe(0);
  });

  it('los refugios ocupados emiten ruido periódico (atrae zombis)', () => {
    const { w } = sitiado('asedio-4', 0);
    w.tickCount = ASEDIO.ruidoCadaTicks; // tick múltiplo exacto
    resolverAsedios(w);
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

**(a)** Añadir la constante `ASEDIO` a `src/sim/config.ts` (código de arriba, al final del archivo).

**(b)** Crear `src/sim/asedio.ts`:

```ts
import type { World } from './world';
import { ASEDIO } from './config';
import { romperEdificio } from './refugio';

/**
 * Los zombis presionan los refugios ocupados desde fuera (diseño §3.3):
 * la presión se acumula por zombi pegado y decae sin ellos. Al superar la
 * resistencia, el refugio revienta. Los refugiados además hacen ruido
 * periódico que atrae zombis errantes — no existe el búnker eterno.
 */
export function resolverAsedios(world: World): void {
  for (const b of world.city.buildings) {
    if (b.kind !== 'jugable' || world.brecha[b.id] || world.ocupantes[b.id] === 0) {
      world.presion[b.id] = 0;
      continue;
    }
    const cx = b.x + b.width / 2;
    const cz = b.z + b.depth / 2;
    if (world.tickCount % ASEDIO.ruidoCadaTicks === 0) {
      world.ruidos.push({ x: cx, z: cz, radio: ASEDIO.ruidoRadio, ticks: ASEDIO.ruidoTicks });
    }
    const alcance = b.width / 2 + ASEDIO.radio;
    let zombis = 0;
    for (const i of world.grid.queryCircle(cx, cz, alcance)) {
      if (world.citizens[i].salud === 'zombi') zombis++;
    }
    if (zombis > 0) {
      world.presion[b.id] += zombis * ASEDIO.presionPorZombi;
    } else {
      world.presion[b.id] = Math.max(0, world.presion[b.id] - ASEDIO.alivioPorTick);
    }
    if (world.presion[b.id] >= ASEDIO.resistencia) {
      romperEdificio(world, b.id);
    }
  }
}
```

**(c)** En `src/sim/world.ts`: importar `resolverAsedios`; añadir campo `readonly presion: number[];` junto a `ocupantes` e inicializarlo en el constructor con `this.presion = this.city.buildings.map(() => 0);`; y en `tick()` llamar `resolverAsedios(this);` en la línea siguiente a `resolverCombates(this);`.

**(d)** En `tests/infeccion.test.ts`: reemplazar los literales de incubación por las constantes (arregla el acoplamiento que detectó la Task 10). Cambiar las dos aserciones del segundo test a:

```ts
    expect(c.incubacionTicks).toBeGreaterThanOrEqual(INFECCION.incubacionMinTicks - 1);
    expect(c.incubacionTicks).toBeLessThanOrEqual(INFECCION.incubacionMaxTicks);
```

y el bucle de transformación a `for (let t = 0; t < INFECCION.incubacionMaxTicks + 5; t++) w.tick();`, importando `INFECCION` desde `../src/sim/config` (ajustar el import existente de `TICK_RATE`).

- [ ] **Step 4: Verificar unidad** — `npx vitest run tests/asedio.test.ts tests/infeccion.test.ts tests/determinism.test.ts` → PASS. Luego `npm test` sin los de balance debe seguir verde.

- [ ] **Step 5: Balance definitivo**

Correr `npx vitest run tests/balance.test.ts` con los valores por defecto (config revertido + ASEDIO nuevo). Si el colapso cae fuera de la ventana 1:30–8:00, ajustar con las mismas reglas de la Task 10 MÁS estas dos perillas nuevas (preferirlas primero): `ASEDIO.resistencia` (±300), `ASEDIO.radio` (±2). Documentar cada intento (valor → tick de colapso).

- [ ] **Step 6: Verificación final y cierre** (idéntica a la Task 10 original)

`npm test` completo verde; `npx tsc --noEmit`; grep de prohibiciones en `src/sim/*.ts`; navegador ~2 min (FPS estable, consola limpia, `?seed=alfa` reproducible — ahora se debería VER cómo los zombis rodean refugios y los revientan). Añadir a CLAUDE.md UNA lección condensada (2 líneas máx.) con la causa raíz del búnker eterno y los valores de balance finales. Commit `chore: asedio a refugios y brote balanceado (Plan 2 completo)` y `git push -u origin fase-2-contagio`. Marcar checkboxes.
