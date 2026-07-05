# PANDEMIA — Plan 1 de 3: Fundación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ciudad 3D tipo Nueva York en el navegador con ~800 ciudadanos deambulando de forma determinista, cámara estilo Project Zomboid con zoom, y el test de determinismo (misma semilla = mismo estado) pasando.

**Architecture:** Simulación determinista a 30 ticks/seg en `src/sim/` (cero Three.js, cero `Math.random`), render Three.js en `src/render/` que solo lee el estado de la sim, pegamento en `src/game/`. Los ciudadanos caminan por corredores de calle en cuadrícula (giran en cruces con el RNG inyectado) — sin pathfinding en este plan.

**Tech Stack:** TypeScript (strict) + Vite + Three.js + Vitest. Sin backend.

**Diseño de referencia:** `docs/superpowers/specs/2026-07-05-pandemia-design.md`

## Global Constraints

- TypeScript `strict: true`; módulos ES.
- PROHIBIDO importar `three` en `src/sim/` (verificar con grep antes de cada commit de sim).
- PROHIBIDO en `src/sim/`: `Math.random`, `Date.now`, `performance.now`. Toda aleatoriedad viene del `Rng` inyectado.
- Simulación a paso fijo: `TICK_RATE = 30` ticks/seg, `DT = 1/30`. El render interpola; nunca muta la sim.
- Toda la UI visible en español.
- Commits pequeños y frecuentes, mensajes en español con prefijo `feat:`/`test:`/`chore:`.
- Comandos npm multiplataforma (el entorno es Windows/PowerShell; no usar sintaxis bash como `&&` en scripts de package.json más allá de lo estándar).
- Node 18+.

---

### Task 1: Andamiaje del proyecto + CLAUDE.md

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `CLAUDE.md`, `src/game/main.ts` (placeholder), `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nada (proyecto vacío; ya existe `docs/` y git inicializado).
- Produces: proyecto npm que compila (`npx tsc --noEmit`), prueba (`npm test`) y arranca (`npm run dev`).

- [ ] **Step 1: Crear `.gitignore`**

```gitignore
node_modules/
dist/
*.local
```

- [ ] **Step 2: Crear `package.json`**

```json
{
  "name": "pandemia",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "three": "^0.170.0"
  },
  "devDependencies": {
    "@types/three": "^0.170.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"],
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Crear `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Crear `index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PANDEMIA</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #0d0f14; }
      #app { position: fixed; inset: 0; }
      #hud {
        position: fixed; top: 12px; left: 12px; z-index: 10;
        color: #eaf2ff; font-family: system-ui, sans-serif; font-size: 14px;
        background: rgba(13, 15, 20, 0.65); padding: 8px 12px; border-radius: 8px;
        user-select: none; pointer-events: none;
      }
    </style>
  </head>
  <body>
    <canvas id="app"></canvas>
    <div id="hud">Cargando…</div>
    <script type="module" src="/src/game/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Crear `src/game/main.ts` (placeholder, se reemplaza en Task 6)**

```ts
console.log('PANDEMIA — andamiaje listo');
```

- [ ] **Step 7: Crear `CLAUDE.md`**

```markdown
# PANDEMIA — Reglas del proyecto

Juego 3D de navegador: simulación competitiva de pandemia zombi en una ciudad
tipo Nueva York. Dos jugadores, misma semilla, gana quien mantenga más viva su
ciudad. Diseño completo: `docs/superpowers/specs/2026-07-05-pandemia-design.md`.

## Arquitectura (regla nº 1: sim y render separados)

- `src/sim/` — simulación determinista. PROHIBIDO importar `three` aquí.
- `src/render/` — Three.js; solo LEE el estado de la sim, nunca lo modifica.
- `src/game/` — pegamento: bucle principal, órdenes del jugador.
- `src/ui/` — HUD y menús (siempre en español).
- `src/net/` — (Fase 2) matchmaking y marcador en vivo.

## Determinismo (sagrado)

- En `src/sim/` está PROHIBIDO: `Math.random`, `Date.now`, `performance.now`.
  Toda aleatoriedad viene del `Rng` inyectado (`src/sim/rng.ts`).
- La sim corre a 30 ticks/seg fijos (`DT`); el render interpola con alpha.
- No iterar `Set`/`Map` en la sim cuando el orden afecte el resultado.
- `tests/determinism.test.ts` es el test más importante del proyecto:
  si falla, no se hace commit.

## Flujo de trabajo

- Tests con Vitest: `npm test`. TDD para todo código de `src/sim/`.
- Verificar antes de cada commit: `npm test` y `npx tsc --noEmit`.
- Commits pequeños, mensajes en español (`feat:`, `test:`, `chore:`).
- Planes de implementación: `docs/superpowers/plans/`.
```

- [ ] **Step 8: Crear `tests/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

describe('humo', () => {
  it('vitest funciona', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Instalar dependencias**

Run: `npm install`
Expected: termina sin errores; se crea `node_modules/` y `package-lock.json`.

- [ ] **Step 10: Verificar test y compilación**

Run: `npm test`
Expected: `1 passed` (smoke.test.ts).

Run: `npx tsc --noEmit`
Expected: sin salida (0 errores).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: andamiaje Vite+TS+Three+Vitest y CLAUDE.md"
```

---

### Task 2: RNG determinista

**Files:**
- Create: `src/sim/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Rng = { next(): number; int(min: number, max: number): number; pick<T>(arr: readonly T[]): T; chance(p: number): boolean }`
  - `createRng(seed: number | string): Rng` — mulberry32 sembrado.
  - `hashSeed(text: string): number` — FNV-1a 32 bits, sin signo.

- [ ] **Step 1: Escribir el test que falla — `tests/rng.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '../src/sim/rng';

describe('rng determinista', () => {
  it('misma semilla produce la misma secuencia', () => {
    const a = createRng('alfa');
    const b = createRng('alfa');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('semillas distintas divergen', () => {
    const a = createRng('alfa');
    const b = createRng('beta');
    let iguales = 0;
    for (let i = 0; i < 100; i++) if (a.next() === b.next()) iguales++;
    expect(iguales).toBeLessThan(5);
  });

  it('next() siempre está en [0, 1)', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int respeta los límites, ambos inclusive', () => {
    const rng = createRng('rango');
    const vistos = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      vistos.add(v);
    }
    expect(vistos.size).toBe(4);
  });

  it('hashSeed es estable y distingue mayúsculas', () => {
    expect(hashSeed('PANDEMIA')).toBe(hashSeed('PANDEMIA'));
    expect(hashSeed('PANDEMIA')).not.toBe(hashSeed('pandemia'));
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/sim/rng'` (o similar).

- [ ] **Step 3: Implementar `src/sim/rng.ts`**

```ts
export type Rng = {
  /** Número en [0, 1). */
  next(): number;
  /** Entero en [min, max], ambos inclusive. */
  int(min: number, max: number): number;
  /** Elemento al azar del arreglo. */
  pick<T>(arr: readonly T[]): T;
  /** true con probabilidad p. */
  chance(p: number): boolean;
};

/** FNV-1a de 32 bits, sin signo. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG mulberry32: rápido, determinista, suficiente para gameplay. */
export function createRng(seed: number | string): Rng {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test`
Expected: PASS — todos los tests de `rng.test.ts` y el de humo.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts tests/rng.test.ts
git commit -m "feat: RNG determinista mulberry32 con semilla de texto"
```

---

### Task 3: Configuración y generación de la ciudad

**Files:**
- Create: `src/sim/config.ts`, `src/sim/cityGen.ts`
- Test: `tests/cityGen.test.ts`

**Interfaces:**
- Consumes: `Rng` de Task 2.
- Produces:
  - `config.ts`: `TICK_RATE = 30`, `DT = 1/30`, `CITY = { blocksX: 6, blocksY: 8, blockSize: 36, streetWidth: 8 }`, `CITIZENS = { count: 800, walkSpeed: 1.4, idleMin: 2, idleMax: 8 }`, `CITY_PERIOD`, `CITY_WIDTH`, `CITY_DEPTH`.
  - `cityGen.ts`: `type BuildingKind = 'fondo' | 'jugable'`; `interface Building { id: number; kind: BuildingKind; x: number; z: number; width: number; depth: number; height: number }`; `interface CityLayout { width: number; depth: number; buildings: Building[] }`; `generateCity(rng: Rng): CityLayout`; `isStreet(x: number, z: number): boolean`; `corridorCenter(k: number): number`; `corridorIndexAt(v: number): number`.

La ciudad es una cuadrícula Manhattan: calles de 8 m entre manzanas de 36 m. Coordenadas de suelo: `x` (ancho) y `z` (profundidad); `y` es altura solo en el render.

- [ ] **Step 1: Escribir el test que falla — `tests/cityGen.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { generateCity, isStreet } from '../src/sim/cityGen';
import { CITY, CITY_WIDTH } from '../src/sim/config';

describe('generación de ciudad', () => {
  it('misma semilla produce exactamente la misma ciudad', () => {
    const a = generateCity(createRng('nyc'));
    const b = generateCity(createRng('nyc'));
    expect(a).toEqual(b);
  });

  it('hay un edificio por manzana', () => {
    const city = generateCity(createRng('nyc'));
    expect(city.buildings.length).toBe(CITY.blocksX * CITY.blocksY);
  });

  it('hay edificios jugables y de fondo', () => {
    const city = generateCity(createRng('nyc'));
    const jugables = city.buildings.filter((b) => b.kind === 'jugable').length;
    expect(jugables).toBeGreaterThan(0);
    expect(jugables).toBeLessThan(city.buildings.length);
  });

  it('los edificios jugables son bajos y los de fondo altos', () => {
    const city = generateCity(createRng('nyc'));
    for (const b of city.buildings) {
      if (b.kind === 'jugable') expect(b.height).toBeLessThanOrEqual(12);
      else expect(b.height).toBeGreaterThanOrEqual(30);
    }
  });

  it('ningún edificio pisa una calle', () => {
    const city = generateCity(createRng('nyc'));
    for (const b of city.buildings) {
      expect(isStreet(b.x, b.z)).toBe(false);
      expect(isStreet(b.x + b.width - 0.01, b.z + b.depth - 0.01)).toBe(false);
    }
  });

  it('isStreet reconoce bandas de calle y límites del mapa', () => {
    expect(isStreet(CITY.streetWidth / 2, CITY.streetWidth / 2)).toBe(true);
    expect(isStreet(CITY.streetWidth + 1, CITY.streetWidth + 1)).toBe(false);
    expect(isStreet(-1, 5)).toBe(false);
    expect(isStreet(CITY_WIDTH + 1, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — no existen `config.ts` ni `cityGen.ts`.

- [ ] **Step 3: Implementar `src/sim/config.ts`**

```ts
/** Ticks de simulación por segundo. La sim SIEMPRE avanza a este paso fijo. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const CITY = {
  blocksX: 6,
  blocksY: 8,
  blockSize: 36, // metros por manzana
  streetWidth: 8, // metros de calle
} as const;

/** Periodo de la retícula: manzana + calle. */
export const CITY_PERIOD = CITY.blockSize + CITY.streetWidth;
/** El mapa termina en calle por ambos lados. */
export const CITY_WIDTH = CITY.blocksX * CITY_PERIOD + CITY.streetWidth;
export const CITY_DEPTH = CITY.blocksY * CITY_PERIOD + CITY.streetWidth;

export const CITIZENS = {
  count: 800,
  walkSpeed: 1.4, // m/s
  idleMin: 2, // segundos quieto (mínimo)
  idleMax: 8, // segundos quieto (máximo)
} as const;
```

- [ ] **Step 4: Implementar `src/sim/cityGen.ts`**

```ts
import type { Rng } from './rng';
import { CITY, CITY_PERIOD, CITY_WIDTH, CITY_DEPTH } from './config';

export type BuildingKind = 'fondo' | 'jugable';

export interface Building {
  id: number;
  kind: BuildingKind;
  /** Esquina de menor x,z. */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export interface CityLayout {
  width: number;
  depth: number;
  buildings: Building[];
}

/** true si (x,z) cae dentro de una banda de calle (y dentro del mapa). */
export function isStreet(x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= CITY_WIDTH || z >= CITY_DEPTH) return false;
  const fx = x % CITY_PERIOD;
  const fz = z % CITY_PERIOD;
  return fx < CITY.streetWidth || fz < CITY.streetWidth;
}

/** Centro de la calle k (k = 0..blocksX para verticales, 0..blocksY para horizontales). */
export function corridorCenter(k: number): number {
  return k * CITY_PERIOD + CITY.streetWidth / 2;
}

/** Índice de la calle que contiene la coordenada v, o -1 si v está en una manzana. */
export function corridorIndexAt(v: number): number {
  const k = Math.floor(v / CITY_PERIOD);
  return v - k * CITY_PERIOD < CITY.streetWidth ? k : -1;
}

export function generateCity(rng: Rng): CityLayout {
  const buildings: Building[] = [];
  const margin = 2; // acera dentro de la manzana
  let id = 0;
  for (let bx = 0; bx < CITY.blocksX; bx++) {
    for (let bz = 0; bz < CITY.blocksY; bz++) {
      const x0 = CITY.streetWidth + bx * CITY_PERIOD;
      const z0 = CITY.streetWidth + bz * CITY_PERIOD;
      const kind: BuildingKind = rng.chance(0.4) ? 'jugable' : 'fondo';
      const height = kind === 'jugable' ? rng.int(8, 12) : rng.int(30, 120);
      buildings.push({
        id: id++,
        kind,
        x: x0 + margin,
        z: z0 + margin,
        width: CITY.blockSize - margin * 2,
        depth: CITY.blockSize - margin * 2,
        height,
      });
    }
  }
  return { width: CITY_WIDTH, depth: CITY_DEPTH, buildings };
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test`
Expected: PASS — todos los tests.

- [ ] **Step 6: Commit**

```bash
git add src/sim/config.ts src/sim/cityGen.ts tests/cityGen.test.ts
git commit -m "feat: retícula Manhattan con edificios de fondo y jugables"
```

---

### Task 4: Ciudadanos — tipos, nombres, personalidades y spawn

**Files:**
- Create: `src/sim/types.ts`, `src/sim/citizens.ts`
- Test: `tests/citizens.test.ts`

**Interfaces:**
- Consumes: `Rng` (Task 2); `corridorCenter`, `isStreet` y constantes de `config.ts` (Task 3).
- Produces:
  - `types.ts`: `type Personality = 'lider' | 'cobarde' | 'valiente' | 'protector' | 'egoista' | 'imprudente'`; `type CitizenState = 'quieto' | 'caminando'`; `interface Citizen { id: number; name: string; personality: Personality; x: number; z: number; prevX: number; prevZ: number; dirX: number; dirZ: number; laneOffset: number; state: CitizenState; idleTicks: number; lastCrossing: number }`.
  - `citizens.ts`: `spawnCitizens(rng: Rng, count: number): Citizen[]`; `pickPersonality(rng: Rng): Personality`. (En Task 5 este archivo suma `updateCitizen`.)

Los ciudadanos caminan por corredores: si van en vertical, su `x` queda fijo en `corridorCenter(k) + laneOffset`; si van en horizontal, su `z` queda fijo igual. `laneOffset` los reparte por el ancho de la calle para que no caminen en fila india.

- [ ] **Step 1: Escribir el test que falla — `tests/citizens.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { pickPersonality, spawnCitizens } from '../src/sim/citizens';
import { isStreet } from '../src/sim/cityGen';

describe('ciudadanos', () => {
  it('nacen sobre las calles, nunca dentro de manzanas', () => {
    const cs = spawnCitizens(createRng('spawn'), 500);
    for (const c of cs) expect(isStreet(c.x, c.z)).toBe(true);
  });

  it('tienen nombre completo y variedad de personalidades', () => {
    const cs = spawnCitizens(createRng('spawn'), 200);
    for (const c of cs) expect(c.name).toMatch(/^\S+ \S+$/);
    const tipos = new Set(cs.map((c) => c.personality));
    expect(tipos.size).toBeGreaterThanOrEqual(4);
  });

  it('caminan sobre un solo eje a la vez', () => {
    const cs = spawnCitizens(createRng('spawn'), 200);
    for (const c of cs) {
      expect(Math.abs(c.dirX) + Math.abs(c.dirZ)).toBe(1);
    }
  });

  it('pickPersonality es determinista', () => {
    const a = createRng('p');
    const b = createRng('p');
    for (let i = 0; i < 200; i++) {
      expect(pickPersonality(a)).toBe(pickPersonality(b));
    }
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — no existe `src/sim/citizens.ts`.

- [ ] **Step 3: Implementar `src/sim/types.ts`**

```ts
export type Personality =
  | 'lider'
  | 'cobarde'
  | 'valiente'
  | 'protector'
  | 'egoista'
  | 'imprudente';

export type CitizenState = 'quieto' | 'caminando';

export interface Citizen {
  id: number;
  name: string;
  personality: Personality;
  x: number;
  z: number;
  /** Posición del tick anterior; el render interpola entre prev y actual. */
  prevX: number;
  prevZ: number;
  /** Eje de marcha: exactamente uno de dirX/dirZ es ±1, el otro 0. */
  dirX: number;
  dirZ: number;
  /** Desvío perpendicular dentro del ancho de la calle. */
  laneOffset: number;
  state: CitizenState;
  /** Ticks restantes en estado 'quieto'. */
  idleTicks: number;
  /** id del último cruce donde ya decidió girar o seguir. */
  lastCrossing: number;
}
```

- [ ] **Step 4: Implementar `src/sim/citizens.ts`**

```ts
import type { Rng } from './rng';
import type { Citizen, Personality } from './types';
import { corridorCenter } from './cityGen';
import { CITY, CITY_WIDTH, CITY_DEPTH } from './config';

const NOMBRES = [
  'María', 'José', 'Carmen', 'Luis', 'Ana', 'Miguel', 'Sofía', 'Carlos',
  'Elena', 'Diego', 'Lucía', 'Marcos', 'Valeria', 'Andrés', 'Paula', 'Jorge',
  'Rosa', 'Iván', 'Clara', 'Óscar', 'Nadia', 'Pedro', 'Irene', 'Tomás',
  'Alma', 'Bruno', 'Celia', 'Hugo', 'Noa', 'Raúl',
] as const;

const APELLIDOS = [
  'García', 'Smith', 'Rodríguez', 'Johnson', 'Lee', 'Martínez', 'Brown',
  'Nguyen', 'López', 'Cohen', 'Rivera', 'Kim', 'Torres', 'Murphy', 'Díaz',
  'Rossi', 'Chen', 'Álvarez', 'Novak', 'Silva',
] as const;

/** Pesos según el diseño (sección 3.1). */
const PERSONALIDADES: ReadonlyArray<readonly [Personality, number]> = [
  ['lider', 8],
  ['valiente', 12],
  ['protector', 20],
  ['egoista', 18],
  ['imprudente', 20],
  ['cobarde', 22],
];

export function pickPersonality(rng: Rng): Personality {
  const total = PERSONALIDADES.reduce((s, [, w]) => s + w, 0);
  let resto = rng.next() * total;
  for (const [p, w] of PERSONALIDADES) {
    resto -= w;
    if (resto < 0) return p;
  }
  return 'cobarde';
}

/** Margen para no caminar pegado al borde de la calle. */
const LANE_MARGIN = 1.2;

export function spawnCitizens(rng: Rng, count: number): Citizen[] {
  const citizens: Citizen[] = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng.chance(0.5);
    const laneOffset = (rng.next() - 0.5) * (CITY.streetWidth - LANE_MARGIN * 2);
    let x: number;
    let z: number;
    let dirX = 0;
    let dirZ = 0;
    if (vertical) {
      const k = rng.int(0, CITY.blocksX); // calles verticales: 0..blocksX
      x = corridorCenter(k) + laneOffset;
      z = 1 + rng.next() * (CITY_DEPTH - 2);
      dirZ = rng.chance(0.5) ? 1 : -1;
    } else {
      const k = rng.int(0, CITY.blocksY); // calles horizontales: 0..blocksY
      z = corridorCenter(k) + laneOffset;
      x = 1 + rng.next() * (CITY_WIDTH - 2);
      dirX = rng.chance(0.5) ? 1 : -1;
    }
    citizens.push({
      id: i,
      name: `${rng.pick(NOMBRES)} ${rng.pick(APELLIDOS)}`,
      personality: pickPersonality(rng),
      x,
      z,
      prevX: x,
      prevZ: z,
      dirX,
      dirZ,
      laneOffset,
      state: 'caminando',
      idleTicks: 0,
      lastCrossing: -1,
    });
  }
  return citizens;
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test`
Expected: PASS. Nota: el test de spawn sobre calles pasa porque un caminante vertical siempre tiene `x` dentro de la banda de una calle vertical (cualquier `z` vale), y viceversa.

- [ ] **Step 6: Commit**

```bash
git add src/sim/types.ts src/sim/citizens.ts tests/citizens.test.ts
git commit -m "feat: ciudadanos con nombre, personalidad y spawn en calles"
```

---

### Task 5: Movimiento por calles, World y el test de determinismo

**Files:**
- Modify: `src/sim/citizens.ts` (agregar `updateCitizen` al final del archivo)
- Create: `src/sim/world.ts`
- Test: `tests/determinism.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `citizens.ts` suma: `updateCitizen(c: Citizen, rng: Rng): void`.
  - `world.ts`: `class World { constructor(seed: string, citizenCount?: number); readonly seed: string; readonly city: CityLayout; readonly citizens: Citizen[]; tickCount: number; tick(): void; hashState(): number }`.

Comportamiento: cada tick el ciudadano avanza sobre su eje; al entrar a un cruce (bandas vertical y horizontal a la vez) decide una sola vez si gira (45%); en los bordes del mapa rebota. A veces se detiene unos segundos (mirar vitrinas).

- [ ] **Step 1: Escribir el test que falla — `tests/determinism.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { isStreet } from '../src/sim/cityGen';

// EL test más importante del proyecto (ver CLAUDE.md).
describe('determinismo del mundo', () => {
  it('misma semilla → estado idéntico tras 30 segundos simulados', () => {
    const a = new World('duelo-1', 300);
    const b = new World('duelo-1', 300);
    for (let t = 0; t < 900; t++) {
      a.tick();
      b.tick();
    }
    expect(a.tickCount).toBe(900);
    expect(a.hashState()).toBe(b.hashState());
  });

  it('semillas distintas → estados distintos', () => {
    const a = new World('duelo-1', 300);
    const b = new World('duelo-2', 300);
    for (let t = 0; t < 900; t++) {
      a.tick();
      b.tick();
    }
    expect(a.hashState()).not.toBe(b.hashState());
  });

  it('los ciudadanos siguen sobre las calles tras 30 segundos caminando', () => {
    const w = new World('caminata', 300);
    for (let t = 0; t < 900; t++) w.tick();
    for (const c of w.citizens) expect(isStreet(c.x, c.z)).toBe(true);
  });

  it('los ciudadanos se mueven de verdad (no están congelados)', () => {
    const w = new World('caminata', 300);
    const inicioX = w.citizens.map((c) => c.x);
    for (let t = 0; t < 300; t++) w.tick();
    const movidos = w.citizens.filter((c, i) => Math.abs(c.x - inicioX[i]) > 0.01);
    expect(movidos.length).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — no existe `src/sim/world.ts`.

- [ ] **Step 3: Agregar `updateCitizen` al final de `src/sim/citizens.ts`**

```ts
/** Probabilidad de girar al entrar a un cruce. */
const CRUCE_GIRO = 0.45;
/** Probabilidad por tick de pararse a mirar (≈2.4%/seg). */
const PAUSA_POR_TICK = 0.0008;

export function updateCitizen(c: Citizen, rng: Rng): void {
  c.prevX = c.x;
  c.prevZ = c.z;

  if (c.state === 'quieto') {
    c.idleTicks--;
    if (c.idleTicks <= 0) c.state = 'caminando';
    return;
  }

  if (rng.chance(PAUSA_POR_TICK)) {
    c.state = 'quieto';
    c.idleTicks = rng.int(CITIZENS.idleMin * TICK_RATE, CITIZENS.idleMax * TICK_RATE);
    return;
  }

  const paso = CITIZENS.walkSpeed * DT;
  c.x += c.dirX * paso;
  c.z += c.dirZ * paso;

  // Rebote en los límites del mapa.
  if (c.x < 1) { c.x = 1; c.dirX = 1; c.lastCrossing = -1; }
  if (c.x > CITY_WIDTH - 1) { c.x = CITY_WIDTH - 1; c.dirX = -1; c.lastCrossing = -1; }
  if (c.z < 1) { c.z = 1; c.dirZ = 1; c.lastCrossing = -1; }
  if (c.z > CITY_DEPTH - 1) { c.z = CITY_DEPTH - 1; c.dirZ = -1; c.lastCrossing = -1; }

  // Decisión única por cruce.
  const kx = corridorIndexAt(c.x);
  const kz = corridorIndexAt(c.z);
  if (kx >= 0 && kz >= 0) {
    const idCruce = kx * 1000 + kz;
    if (c.lastCrossing !== idCruce) {
      c.lastCrossing = idCruce;
      if (rng.chance(CRUCE_GIRO)) {
        if (c.dirZ !== 0) {
          // Iba en vertical → gira a horizontal por este cruce.
          c.z = corridorCenter(kz) + c.laneOffset;
          c.dirZ = 0;
          c.dirX = rng.chance(0.5) ? 1 : -1;
        } else {
          // Iba en horizontal → gira a vertical.
          c.x = corridorCenter(kx) + c.laneOffset;
          c.dirX = 0;
          c.dirZ = rng.chance(0.5) ? 1 : -1;
        }
      }
    }
  }
}
```

Y actualizar los imports al inicio de `src/sim/citizens.ts` para que queden así:

```ts
import type { Rng } from './rng';
import type { Citizen, Personality } from './types';
import { corridorCenter, corridorIndexAt } from './cityGen';
import { CITY, CITY_WIDTH, CITY_DEPTH, CITIZENS, DT, TICK_RATE } from './config';
```

- [ ] **Step 4: Implementar `src/sim/world.ts`**

```ts
import { createRng, type Rng } from './rng';
import { generateCity, type CityLayout } from './cityGen';
import { spawnCitizens, updateCitizen } from './citizens';
import type { Citizen } from './types';
import { CITIZENS } from './config';

export class World {
  readonly seed: string;
  readonly city: CityLayout;
  readonly citizens: Citizen[];
  tickCount = 0;

  private readonly rng: Rng;

  constructor(seed: string, citizenCount: number = CITIZENS.count) {
    this.seed = seed;
    this.rng = createRng(`pandemia:${seed}`);
    this.city = generateCity(this.rng);
    this.citizens = spawnCitizens(this.rng, citizenCount);
  }

  tick(): void {
    for (const c of this.citizens) updateCitizen(c, this.rng);
    this.tickCount++;
  }

  /** Huella FNV del estado, para los tests de determinismo. */
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
    mix(this.tickCount);
    for (const c of this.citizens) {
      mix(Math.round(c.x * 100));
      mix(Math.round(c.z * 100));
      mix(c.state === 'caminando' ? 1 : 2);
    }
    return h >>> 0;
  }
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test`
Expected: PASS — los 4 tests de determinismo y todos los anteriores.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Verificar la prohibición de aleatoriedad no inyectada**

Run (PowerShell): `Select-String -Path src/sim/*.ts -Pattern "Math.random|Date.now|performance.now"`
Expected: sin resultados.

- [ ] **Step 7: Commit**

```bash
git add src/sim/citizens.ts src/sim/world.ts tests/determinism.test.ts
git commit -m "feat: mundo determinista con ciudadanos que caminan por las calles"
```

---

### Task 6: Escena Three.js y ciudad visible (cámara provisional)

**Files:**
- Create: `src/render/scene.ts`, `src/render/cityView.ts`
- Modify: `src/game/main.ts` (reemplazar el placeholder por completo)

**Interfaces:**
- Consumes: `World` (Task 5), `CityLayout`/`Building` (Task 3).
- Produces:
  - `scene.ts`: `createScene(canvas: HTMLCanvasElement): { renderer: THREE.WebGLRenderer; scene: THREE.Scene }`.
  - `cityView.ts`: `buildCityView(scene: THREE.Scene, city: CityLayout): void`.
- Sin tests unitarios (es render); la verificación es visual en el navegador.

- [ ] **Step 1: Implementar `src/render/scene.ts`**

```ts
import * as THREE from 'three';

export interface SceneParts {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

export function createScene(canvas: HTMLCanvasElement): SceneParts {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f14);
  scene.fog = new THREE.Fog(0x0d0f14, 250, 600);

  const ambiente = new THREE.HemisphereLight(0xbfd4ff, 0x2a2d33, 0.9);
  scene.add(ambiente);
  const sol = new THREE.DirectionalLight(0xfff2d9, 1.1);
  sol.position.set(120, 180, 80);
  scene.add(sol);

  return { renderer, scene };
}
```

- [ ] **Step 2: Implementar `src/render/cityView.ts`**

```ts
import * as THREE from 'three';
import type { CityLayout } from '../sim/cityGen';

export function buildCityView(scene: THREE.Scene, city: CityLayout): void {
  // Suelo: las calles son el plano base.
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(city.width, city.depth),
    new THREE.MeshLambertMaterial({ color: 0x2b2f36 })
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.set(city.width / 2, 0, city.depth / 2);
  scene.add(suelo);

  // Edificios instanciados: una sola llamada de dibujo para todos.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, city.buildings.length);
  const m = new THREE.Matrix4();
  const colorFondo = new THREE.Color(0x3a4150);
  const colorJugable = new THREE.Color(0x5a6b7d);
  city.buildings.forEach((b, i) => {
    m.makeScale(b.width, b.height, b.depth);
    m.setPosition(b.x + b.width / 2, b.height / 2, b.z + b.depth / 2);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, b.kind === 'jugable' ? colorJugable : colorFondo);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}
```

- [ ] **Step 3: Reemplazar `src/game/main.ts` (cámara fija provisional)**

```ts
import * as THREE from 'three';
import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { buildCityView } from '../render/cityView';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const seed = new URLSearchParams(location.search).get('seed') ?? 'PANDEMIA';

const world = new World(seed);
const { renderer, scene } = createScene(canvas);
buildCityView(scene, world.city);

// Cámara provisional (Task 8 la reemplaza por CameraRig).
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1500
);
camera.position.set(world.city.width / 2 - 60, 70, world.city.depth / 2 + 60);
camera.lookAt(world.city.width / 2, 0, world.city.depth / 2);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

- [ ] **Step 4: Verificar compilación y en navegador**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run dev` y abrir la URL que imprime (por defecto `http://localhost:5173`).
Expected: se ve la retícula de Manhattan — suelo gris oscuro, torres altas gris-azul (fondo) y edificios bajos más claros (jugables), con niebla al fondo. Sin errores en la consola del navegador.

- [ ] **Step 5: Commit**

```bash
git add src/render/scene.ts src/render/cityView.ts src/game/main.ts
git commit -m "feat: escena Three.js con la ciudad visible"
```

---

### Task 7: Bucle de paso fijo y ciudadanos animados + HUD

**Files:**
- Create: `src/game/loop.ts`, `src/render/citizensView.ts`, `src/ui/hud.ts`
- Modify: `src/game/main.ts`
- Test: `tests/loop.test.ts`

**Interfaces:**
- Consumes: `World`, `DT`, `TICK_RATE`, `Citizen`.
- Produces:
  - `loop.ts`: `createStepper(tick: () => void): (elapsedSeconds: number) => number` — acumula tiempo, ejecuta N ticks y devuelve alpha (fracción de tick pendiente, para interpolar). Además `startLoop(world: World, render: (alpha: number) => void): void` que usa `requestAnimationFrame` y el stepper.
  - `citizensView.ts`: `class CitizensView { constructor(scene: THREE.Scene, count: number); update(citizens: Citizen[], alpha: number): void }`.
  - `hud.ts`: `class Hud { constructor(seed: string); update(world: World): void }`.

- [ ] **Step 1: Escribir el test que falla — `tests/loop.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createStepper } from '../src/game/loop';
import { DT } from '../src/sim/config';

describe('bucle de paso fijo', () => {
  it('ejecuta un tick por cada DT acumulado', () => {
    let ticks = 0;
    const step = createStepper(() => ticks++);
    step(DT * 3);
    expect(ticks).toBe(3);
  });

  it('acumula fracciones entre llamadas', () => {
    let ticks = 0;
    const step = createStepper(() => ticks++);
    step(DT * 0.6);
    expect(ticks).toBe(0);
    step(DT * 0.6);
    expect(ticks).toBe(1);
  });

  it('devuelve alpha en [0, 1)', () => {
    const step = createStepper(() => undefined);
    const alpha = step(DT * 1.5);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('limita el tiempo por llamada (pestaña en segundo plano)', () => {
    let ticks = 0;
    const step = createStepper(() => ticks++);
    step(60); // un minuto congelado no debe disparar 1800 ticks
    expect(ticks).toBeLessThanOrEqual(Math.ceil(0.25 / DT));
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — no existe `src/game/loop.ts`.

- [ ] **Step 3: Implementar `src/game/loop.ts`**

```ts
import { DT } from '../sim/config';
import type { World } from '../sim/world';

/** Máximo de tiempo real procesado por llamada (evita la espiral de la muerte). */
const MAX_ELAPSED = 0.25;

export function createStepper(tick: () => void): (elapsedSeconds: number) => number {
  let acc = 0;
  return (elapsedSeconds: number): number => {
    acc += Math.min(elapsedSeconds, MAX_ELAPSED);
    while (acc >= DT) {
      tick();
      acc -= DT;
    }
    return acc / DT;
  };
}

export function startLoop(world: World, render: (alpha: number) => void): void {
  const step = createStepper(() => world.tick());
  let last = performance.now();
  const frame = (now: number): void => {
    const alpha = step((now - last) / 1000);
    last = now;
    render(alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Implementar `src/render/citizensView.ts`**

```ts
import * as THREE from 'three';
import type { Citizen } from '../sim/types';

export class CitizensView {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.CapsuleGeometry(0.3, 1.1, 3, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    // Variación sutil y determinista de color por índice.
    const base = new THREE.Color(0x9fd8ff);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = ((i * 2654435761) >>> 0) / 4294967296;
      tmp.copy(base).offsetHSL((t - 0.5) * 0.08, 0, (t - 0.5) * 0.15);
      this.mesh.setColorAt(i, tmp);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  update(citizens: Citizen[], alpha: number): void {
    for (let i = 0; i < citizens.length; i++) {
      const c = citizens[i];
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      this.dummy.position.set(x, 0.85, z);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
```

- [ ] **Step 6: Implementar `src/ui/hud.ts`**

```ts
import type { World } from '../sim/world';
import { TICK_RATE } from '../sim/config';

export class Hud {
  private readonly el = document.getElementById('hud') as HTMLDivElement;
  private readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
  }

  update(world: World): void {
    const segs = Math.floor(world.tickCount / TICK_RATE);
    const mm = Math.floor(segs / 60);
    const ss = (segs % 60).toString().padStart(2, '0');
    this.el.textContent =
      `Población: ${world.citizens.length} · Tiempo: ${mm}:${ss} · Semilla: ${this.seed}`;
  }
}
```

- [ ] **Step 7: Actualizar `src/game/main.ts` (reemplazar completo)**

```ts
import * as THREE from 'three';
import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { buildCityView } from '../render/cityView';
import { CitizensView } from '../render/citizensView';
import { startLoop } from './loop';
import { Hud } from '../ui/hud';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const seed = new URLSearchParams(location.search).get('seed') ?? 'PANDEMIA';

const world = new World(seed);
const { renderer, scene } = createScene(canvas);
buildCityView(scene, world.city);
const citizensView = new CitizensView(scene, world.citizens.length);
const hud = new Hud(seed);

// Cámara provisional (Task 8 la reemplaza por CameraRig).
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1500
);
camera.position.set(world.city.width / 2 - 60, 70, world.city.depth / 2 + 60);
camera.lookAt(world.city.width / 2, 0, world.city.depth / 2);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

startLoop(world, (alpha) => {
  citizensView.update(world.citizens, alpha);
  hud.update(world);
  renderer.render(scene, camera);
});
```

- [ ] **Step 8: Verificar en navegador**

Run: `npx tsc --noEmit` — sin errores.
Run: `npm run dev` y abrir la URL.
Expected: 800 cápsulas celestes caminando por las calles con movimiento fluido, girando en los cruces, algunas detenidas. El HUD muestra "Población: 800 · Tiempo: 0:NN · Semilla: PANDEMIA" y el tiempo avanza. Abrir con `?seed=otra` genera otra distribución. Sin errores en consola; el movimiento no debe verse a saltos (la interpolación con alpha funciona).

- [ ] **Step 9: Commit**

```bash
git add src/game/loop.ts src/render/citizensView.ts src/ui/hud.ts src/game/main.ts tests/loop.test.ts
git commit -m "feat: bucle de paso fijo, ciudadanos animados e interpolados, HUD"
```

---

### Task 8: Cámara estilo Project Zomboid (zoom, arrastre, bordes)

**Files:**
- Create: `src/render/cameraRig.ts`
- Modify: `src/game/main.ts` (quitar la cámara provisional)

**Interfaces:**
- Consumes: dimensiones de la ciudad (`world.city.width/depth`).
- Produces: `class CameraRig { constructor(canvas: HTMLCanvasElement, bounds: { w: number; d: number }); readonly camera: THREE.PerspectiveCamera; update(): void }`.

Cámara con inclinación fija (52°) y yaw diagonal fijo (45°) — la vista íntima de Project Zomboid. Zoom con rueda (16–130 m), paneo arrastrando con el puntero y por bordes de pantalla.

- [ ] **Step 1: Implementar `src/render/cameraRig.ts`**

```ts
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
```

- [ ] **Step 2: Actualizar `src/game/main.ts` (reemplazar completo)**

```ts
import { World } from '../sim/world';
import { createScene } from '../render/scene';
import { buildCityView } from '../render/cityView';
import { CitizensView } from '../render/citizensView';
import { CameraRig } from '../render/cameraRig';
import { startLoop } from './loop';
import { Hud } from '../ui/hud';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const seed = new URLSearchParams(location.search).get('seed') ?? 'PANDEMIA';

const world = new World(seed);
const { renderer, scene } = createScene(canvas);
buildCityView(scene, world.city);
const citizensView = new CitizensView(scene, world.citizens.length);
const rig = new CameraRig(canvas, { w: world.city.width, d: world.city.depth });
const hud = new Hud(seed);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startLoop(world, (alpha) => {
  citizensView.update(world.citizens, alpha);
  rig.update();
  hud.update(world);
  renderer.render(scene, rig.camera);
});
```

- [ ] **Step 3: Verificar en navegador**

Run: `npx tsc --noEmit` — sin errores.
Run: `npm run dev` y abrir la URL. Comprobar:
- La vista inicial es cercana e inclinada (se ven personas del tamaño de hormigas grandes, no un mapa satelital).
- Rueda del ratón: acerca hasta ver una cápsula de cerca; aleja hasta ver el distrito. Nunca atraviesa el suelo ni se va al infinito.
- Arrastrar con el puntero mueve el mapa en la dirección natural (el suelo "sigue" al puntero). Si se siente invertido, revisar los signos pasados a `panScreen` en `pointermove` — la convención correcta es: puntero a la derecha ⇒ `rightAmt` negativo.
- Llevar el puntero a un borde de la ventana desplaza la vista hacia ese lado.
- El foco no puede salirse de la ciudad (clamp).

- [ ] **Step 4: Commit**

```bash
git add src/render/cameraRig.ts src/game/main.ts
git commit -m "feat: cámara estilo Project Zomboid con zoom, arrastre y bordes"
```

---

### Task 9: Verificación final del plan

**Files:**
- Modify: ninguno (solo verificación); si algo falla, corregir y commitear el arreglo.

**Interfaces:**
- Consumes: todo el plan.
- Produces: fundación verificada, lista para el Plan 2 (El brote).

- [ ] **Step 1: Suite completa y compilación**

Run: `npm test`
Expected: PASS — smoke, rng, cityGen, citizens, determinism y loop (6 archivos, todos verdes).

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 2: Verificar las prohibiciones de arquitectura**

Run (PowerShell): `Select-String -Path src/sim/*.ts -Pattern "from 'three'|Math.random|Date.now|performance.now"`
Expected: sin resultados. Si aparece algo, es una violación de CLAUDE.md: corregir antes de seguir.

- [ ] **Step 3: Verificación de rendimiento en navegador**

Run: `npm run dev`, abrir la URL y dejar correr 2 minutos.
Expected: movimiento fluido sostenido (~60 fps en una máquina normal; sin caída progresiva), memoria estable (sin crecimiento continuo en la pestaña Rendimiento/Memoria de las DevTools), consola sin errores ni warnings de Three.js.

- [ ] **Step 4: Verificación de semillas**

Abrir `http://localhost:5173/?seed=alfa` dos veces (recargar): la disposición inicial de ciudadanos y edificios debe ser idéntica entre recargas. Abrir `?seed=beta`: debe ser distinta.

- [ ] **Step 5: Commit final (si hubo arreglos) y marcar el plan**

```bash
git add -A
git commit -m "chore: fundación del prototipo verificada (Plan 1 completo)"
```

Marcar todos los checkboxes de este documento y avisar que el Plan 1 está listo para que se escriba el Plan 2 (El brote).
