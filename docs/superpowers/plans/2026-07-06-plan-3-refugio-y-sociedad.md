# PANDEMIA — Plan 3 de 4: Refugio y Sociedad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Interiores reales en los edificios jugables (paredes con puerta, escaleras, planta baja + piso 1 + azotea) con vista recortada estilo Project Zomboid; asedio físico a la puerta; y la sociedad viva: familias que se buscan, líderes que calman y guían, y memoria colectiva de zonas de muerte. Además: deuda de determinismo entre navegadores pagada (sin `Math.hypot/cos/sin` en la sim).

**Architecture:** Los ciudadanos con `dentroDe >= 0` dejan de estar congelados: tienen posición real dentro del footprint, `piso` (0, 1, 2=azotea) y se mueven con colisión de perímetro (salida solo por la puerta en planta baja). La percepción interior NO usa la rejilla exterior: itera la lista de ocupantes por edificio (≤40, fuerza bruta determinista). El asedio presiona la PUERTA; al romperse, los zombis entran y cazan piso por piso. El render construye geometría real solo para los ~19 jugables (los rascacielos de fondo siguen instanciados).

**Tech Stack:** El existente. Sin dependencias nuevas.

**Diseño de referencia:** `docs/superpowers/specs/2026-07-05-pandemia-design.md` §3.1 (personalidades, vínculos, memoria), §3.4 (interiores, escaleras, azoteas).
**Estado previo:** Planes 1 y 2 en master: brote completo, 59 tests, balance calibrado.

## Global Constraints

- Todas las de los Planes 1 y 2 siguen vigentes (TS strict; nada de `three`/`Math.random`/`Date.now`/`performance.now` en `src/sim/`; streams de RNG por subsistema; no anidar `queryCircle`; teleports resetean `prevX/prevZ`; commits en español).
- **NUEVO — determinismo portable:** en `src/sim/` quedan PROHIBIDOS también `Math.hypot`, `Math.cos`, `Math.sin`, `Math.tan`, `Math.atan2` (no están especificados bit a bit entre motores JS; romperían el duelo entre navegadores). Distancias con `Math.sqrt(dx*dx + dz*dz)`; direcciones aleatorias desde la tabla literal `DIRECCIONES`.
- La percepción interior itera `world.dentroPorEdificio[b.id]` en orden de índice — nunca `Set`/`Map`.
- `tests/determinism.test.ts` en verde tras CADA tarea. Los hashes cambian entre tareas (nuevos campos/draws); la igualdad de mundos gemelos es lo sagrado.
- El gate de balance queda `describe.skip` desde la Task 1 (las mecánicas nuevas lo mueven sí o sí) y se recalibra OBLIGATORIAMENTE en la Task 10 con la metodología de `docs/superpowers/reports/2026-07-06-balance-brote.md`.
- `ASEDIO.resistencia` es filo de navaja documentado: la Task 10 es la única autorizada a tocar balance.

---

### Task 1: Determinismo portable + acera en config + gate en pausa

**Files:**
- Modify: `src/sim/config.ts`, `src/sim/zombis.ts`, `src/sim/panico.ts`, `src/sim/refugio.ts`, `src/sim/cityGen.ts`, `src/sim/collision.ts`, `tests/balance.test.ts`, `CLAUDE.md`
- Test: `tests/portabilidad.test.ts`

**Interfaces:**
- `config.ts` suma: `MARGEN_ACERA = 2` y la tabla `DIRECCIONES` (16 vectores unitarios LITERALES — nunca calculados con cos/sin):

```ts
/** Acera dentro de la manzana (única fuente de verdad; cityGen y collision la importan). */
export const MARGEN_ACERA = 2;

/**
 * 16 direcciones unitarias precalculadas como LITERALES.
 * Math.cos/sin no son idénticos bit a bit entre motores JS; esta tabla sí.
 */
export const DIRECCIONES: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.9239, 0.3827], [0.7071, 0.7071], [0.3827, 0.9239],
  [0, 1], [-0.3827, 0.9239], [-0.7071, 0.7071], [-0.9239, 0.3827],
  [-1, 0], [-0.9239, -0.3827], [-0.7071, -0.7071], [-0.3827, -0.9239],
  [0, -1], [0.3827, -0.9239], [0.7071, -0.7071], [0.9239, -0.3827],
];
```

- [x] **Step 1: Test que falla — `tests/portabilidad.test.ts`** (hace ejecutable la prohibición)

```ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROHIBIDOS = [
  'Math.random', 'Date.now', 'performance.now',
  'Math.hypot', 'Math.cos', 'Math.sin', 'Math.tan', 'Math.atan2',
  "from 'three'",
];

describe('determinismo portable en src/sim', () => {
  const dir = join(__dirname, '..', 'src', 'sim');
  for (const archivo of readdirSync(dir)) {
    it(`${archivo} no usa APIs no portables`, () => {
      const codigo = readFileSync(join(dir, archivo), 'utf-8');
      for (const patron of PROHIBIDOS) {
        expect(codigo.includes(patron), `${archivo} contiene ${patron}`).toBe(false);
      }
    });
  }
});
```

- [x] **Step 2: Verificar que falla** — `npx vitest run tests/portabilidad.test.ts` → FAIL (zombis/panico/refugio usan hypot/cos/sin).

- [x] **Step 3: Implementar**

**(a)** Añadir `MARGEN_ACERA` y `DIRECCIONES` a `config.ts` (código de arriba).

**(b)** `src/sim/cityGen.ts`: importar `MARGEN_ACERA` desde config y usar `const margin = MARGEN_ACERA;` en `generateCity` (borrar el literal 2).

**(c)** `src/sim/collision.ts`: borrar `const MARGEN_ACERA = 2;` local e importarlo de `./config`.

**(d)** `src/sim/zombis.ts`: `const len = Math.hypot(dx, dz);` → `const len = Math.sqrt(dx * dx + dz * dz);` y la rama de errar:

```ts
    } else if (world.rngZombis.chance(ZOMBIS.probCambiarRumbo) || (c.dirX === 0 && c.dirZ === 0)) {
      const [dx0, dz0] = DIRECCIONES[world.rngZombis.int(0, DIRECCIONES.length - 1)];
      c.dirX = dx0;
      c.dirZ = dz0;
    }
```

(importar `DIRECCIONES` desde `./config`).

**(e)** `src/sim/panico.ts`: los dos `Math.hypot(dx, dz)` → `Math.sqrt(dx * dx + dz * dz)` (percepción y huida). El `Math.sqrt(mejorD2)` existente ya es portable.

**(f)** `src/sim/refugio.ts`: el `Math.hypot(dx, dz)` de `intentarRefugio` → `Math.sqrt(dx * dx + dz * dz)`; y en `romperEdificio` reemplazar el anillo `Math.cos(ang)/Math.sin(ang)` por la tabla:

```ts
  dentro.forEach((o, k) => {
    const [dx, dz] = DIRECCIONES[k % DIRECCIONES.length];
    const esc = (b.width / 2 + 1) / Math.max(Math.abs(dx), Math.abs(dz));
    o.x = cx + dx * esc;
    o.z = cz + dz * esc;
```

(el resto del cuerpo igual; borrar la variable `ang`).

**(g)** `tests/balance.test.ts`: cambiar `describe(` por `describe.skip(` con comentario encima: `// EN PAUSA durante el Plan 3: las mecánicas de interiores mueven el balance; la Task 10 lo recalibra (obligatorio antes del merge).`

**(h)** `CLAUDE.md`, sección Determinismo: añadir viñeta: `- PROHIBIDOS también en src/sim/: Math.hypot/cos/sin/tan/atan2 (no portables entre motores JS). Distancias con sqrt(dx*dx+dz*dz); direcciones desde la tabla DIRECCIONES de config. Lo vigila tests/portabilidad.test.ts.`

- [x] **Step 4: Verificar** — `npm test` → todo verde (el balance aparece como skipped); `npx tsc --noEmit` limpio.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: determinismo portable (tabla de direcciones, sqrt) y acera en config"
```

---

### Task 2: Interiores en la generación de ciudad — puerta y escalera

**Files:**
- Modify: `src/sim/config.ts`, `src/sim/cityGen.ts`
- Test: `tests/interiorGen.test.ts`

**Interfaces:**
- `config.ts` suma:

```ts
export const INTERIOR = {
  alturaPiso: 3, // m por piso (render y = piso * alturaPiso)
  azotea: 2, // índice del piso azotea (0 = planta baja, 1 = piso, 2 = azotea)
  escaleraLado: 5, // m del cuadro de escalera
  anchoPuerta: 3, // m del hueco de la puerta
  escaleraTicks: 45, // ticks para cambiar de piso (1.5 s)
} as const;
```

- `cityGen.ts`: `interface Building` suma campos opcionales (solo jugables los tienen):

```ts
  /** Solo jugables: hueco de entrada en el centro de una pared (lado 0=oeste, 1=norte, 2=este, 3=sur). */
  puerta?: { x: number; z: number; lado: 0 | 1 | 2 | 3 };
  /** Solo jugables: cuadro de escalera, SIEMPRE en la esquina sureste (nunca pisa la puerta: las puertas van al centro de pared). */
  escalera?: { x: number; z: number; width: number; depth: number };
```

En `generateCity`, tras crear cada edificio jugable (consume 1 draw extra de `rng` para el lado):

```ts
      if (kind === 'jugable') {
        const lado = rng.int(0, 3) as 0 | 1 | 2 | 3;
        const b = buildings[buildings.length - 1];
        const PUERTAS: ReadonlyArray<readonly [number, number]> = [
          [b.x, b.z + b.depth / 2], // oeste
          [b.x + b.width / 2, b.z], // norte
          [b.x + b.width, b.z + b.depth / 2], // este
          [b.x + b.width / 2, b.z + b.depth], // sur
        ];
        b.puerta = { x: PUERTAS[lado][0], z: PUERTAS[lado][1], lado };
        b.escalera = {
          x: b.x + b.width - INTERIOR.escaleraLado,
          z: b.z + b.depth - INTERIOR.escaleraLado,
          width: INTERIOR.escaleraLado,
          depth: INTERIOR.escaleraLado,
        };
      }
```

(Integrar limpio dentro del bucle existente: crear el objeto edificio primero en una variable, añadirle puerta/escalera si es jugable, y hacer un solo `buildings.push`.)

- [x] **Step 1: Test que falla — `tests/interiorGen.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/sim/rng';
import { generateCity } from '../src/sim/cityGen';
import { INTERIOR } from '../src/sim/config';

const city = generateCity(createRng('interior'));
const jugables = city.buildings.filter((b) => b.kind === 'jugable');
const fondos = city.buildings.filter((b) => b.kind === 'fondo');

describe('interiores en la generación', () => {
  it('todo jugable tiene puerta en el centro de una de sus paredes', () => {
    expect(jugables.length).toBeGreaterThan(0);
    for (const b of jugables) {
      const p = b.puerta!;
      expect(p).toBeDefined();
      const enParedX = p.x === b.x || p.x === b.x + b.width;
      const enParedZ = p.z === b.z || p.z === b.z + b.depth;
      expect(enParedX || enParedZ).toBe(true); // sobre el perímetro
      if (enParedX) expect(p.z).toBeCloseTo(b.z + b.depth / 2, 5);
      else expect(p.x).toBeCloseTo(b.x + b.width / 2, 5);
    }
  });

  it('la escalera está dentro del footprint y no toca la puerta', () => {
    for (const b of jugables) {
      const e = b.escalera!;
      expect(e.x).toBeGreaterThanOrEqual(b.x);
      expect(e.z).toBeGreaterThanOrEqual(b.z);
      expect(e.x + e.width).toBeLessThanOrEqual(b.x + b.width + 1e-9);
      expect(e.z + e.depth).toBeLessThanOrEqual(b.z + b.depth + 1e-9);
      const p = b.puerta!;
      const dentroEscalera =
        p.x >= e.x - INTERIOR.anchoPuerta / 2 && p.x <= e.x + e.width + INTERIOR.anchoPuerta / 2 &&
        p.z >= e.z - INTERIOR.anchoPuerta / 2 && p.z <= e.z + e.depth + INTERIOR.anchoPuerta / 2;
      expect(dentroEscalera).toBe(false);
    }
  });

  it('los de fondo no tienen interior', () => {
    for (const b of fondos) {
      expect(b.puerta).toBeUndefined();
      expect(b.escalera).toBeUndefined();
    }
  });

  it('sigue siendo determinista', () => {
    expect(generateCity(createRng('interior'))).toEqual(city);
  });
});
```

- [x] **Step 2: Verificar que falla** — FAIL (`puerta` undefined).
- [x] **Step 3: Implementar** (código de arriba en config + cityGen).
- [x] **Step 4: Verificar** — `npm test` verde (el hash de determinismo cambia de valor pero la igualdad gemela se mantiene); `npx tsc --noEmit` limpio.
- [x] **Step 5: Commit**

```bash
git add src/sim/config.ts src/sim/cityGen.ts tests/interiorGen.test.ts
git commit -m "feat: puertas y escaleras deterministas en los edificios jugables"
```

---

### Task 3: Vida interior — pisos, puerta, escaleras y refugio real

**Files:**
- Create: `src/sim/interior.ts`
- Modify: `src/sim/types.ts` (campos `piso`, `pisoObjetivo`, `escaleraTicks`), `src/sim/citizens.ts` (init en spawn), `src/sim/refugio.ts` (entrar POR la puerta; eliminar `romperEdificio`), `src/sim/infeccion.ts` (quitar la llamada a `romperEdificio`), `src/sim/world.ts` (`dentroPorEdificio`, dispatch interior, hash con piso, `ocupantes` recontado por tick)
- Test: `tests/interior.test.ts` (y REESCRIBIR `tests/refugio.test.ts`)

**Interfaces:**
- `types.ts`, `Citizen` suma: `piso: number; pisoObjetivo: number; escaleraTicks: number;` (spawn: 0, 0, 0).
- `interior.ts` exporta:
  - `enEscalera(b: Building, x: number, z: number): boolean`
  - `enPuerta(b: Building, x: number, z: number): boolean` (franja de ±`anchoPuerta/2` a lo largo de la pared y ±0.8 perpendicular)
  - `NORMAL_INTERIOR: ReadonlyArray<readonly [number, number]>` = `[[1,0],[0,1],[-1,0],[0,-1]]` (hacia dentro por lado)
  - `moverInterior(b: Building, c: Citizen, nx: number, nz: number): void` — clamp al footprint con margen 0.3; si `piso === 0` y el destino sale por el hueco de la puerta, SALE (`dentroDe = -1`)
  - `avanzarEscalera(c: Citizen): void` — si está en la escalera y `pisoObjetivo !== piso`, acumula `escaleraTicks`; al llegar a `INTERIOR.escaleraTicks` cambia un piso hacia el objetivo (sin moverse mientras)
  - `updateInterior(c: Citizen, world: World): void` — despacho interior (humano en esta task; la rama zombi queda con un cuerpo mínimo que se completa en la Task 4)
- `refugio.ts`: `intentarRefugio` reescrito — entra si está a ≤`radioEntrar` de la PUERTA (no del rectángulo), puerta sin brecha y con cupo; coloca al ciudadano 1.2 m hacia dentro de la puerta (`NORMAL_INTERIOR[lado]`), `piso = 0`, `pisoObjetivo = 1` (sube a esconderse), prev reset. `romperEdificio` SE ELIMINA (la brecha física llega en la Task 5).
- `world.ts`: `readonly dentroPorEdificio: number[][]` (un array por edificio, reconstruido cada tick en orden de índice); `ocupantes[b]` se recalcula cada tick (humanos vivos dentro); la rama `dentroDe >= 0` del tick pasa de congelar a `updateInterior(c, this)` + `actualizarIncubacion(c, this)`; `hashState` mezcla también `c.piso`.

**Comportamiento humano interior (esta task):**
- Entra en pánico (ya venía así): va a la escalera (dirección hacia el centro del rect), sube hasta `pisoObjetivo = 1`; sin amenazas visibles, `animoTicks` corre y al calmarse se queda "escondido" (deambula lento por su piso con `rngCiudadanos`, cambia de rumbo con `chance(0.01)` usando `DIRECCIONES`).
- La transformación dentro YA NO expulsa a nadie: el nuevo zombi queda dentro (la caza interior es la Task 4; mientras, su rama en `updateInterior` solo lo deja quieto).

- [x] **Step 1: Test que falla — `tests/interior.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { intentarRefugio } from '../src/sim/refugio';
import { enPuerta, moverInterior } from '../src/sim/interior';
import { INTERIOR } from '../src/sim/config';

function juntoAPuerta(w: World, c: World['citizens'][0]): number {
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  // 1.5 m FUERA de la puerta, sobre la acera
  const fuera: ReadonlyArray<readonly [number, number]> = [[-1.5, 0], [0, -1.5], [1.5, 0], [0, 1.5]];
  c.x = p.x + fuera[p.lado][0];
  c.z = p.z + fuera[p.lado][1];
  c.prevX = c.x;
  c.prevZ = c.z;
  return b.id;
}

describe('vida interior', () => {
  it('se entra por la puerta, no por las paredes', () => {
    const w = new World('puerta-1', 5);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(id);
    expect(c.piso).toBe(0);
    // otro ciudadano pegado a una pared SIN puerta no entra
    const b = w.city.buildings[id];
    const c2 = w.citizens[1];
    c2.x = b.x + b.width / 2;
    c2.z = b.puerta!.lado === 1 ? b.z + b.depth + 1 : b.z - 1; // pared opuesta a la puerta
    c2.animo = 'panico';
    intentarRefugio(c2, w);
    expect(c2.dentroDe).toBe(-1);
  });

  it('moverInterior no atraviesa paredes y sí sale por la puerta', () => {
    const w = new World('puerta-2', 3);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    const b = w.city.buildings[id];
    // intento de atravesar una pared lateral: queda clampado dentro
    moverInterior(b, c, b.x - 5, c.z);
    expect(c.dentroDe).toBe(id);
    expect(c.x).toBeGreaterThanOrEqual(b.x);
    // salida por la puerta: destino un paso más allá del hueco
    const p = b.puerta!;
    c.piso = 0;
    c.x = p.x;
    c.z = p.z; // parado en el hueco
    const fuera: ReadonlyArray<readonly [number, number]> = [[-0.5, 0], [0, -0.5], [0.5, 0], [0, 0.5]];
    moverInterior(b, c, p.x + fuera[p.lado][0], p.z + fuera[p.lado][1]);
    expect(c.dentroDe).toBe(-1);
  });

  it('sube por la escalera al piso 1 y el hash registra el piso', () => {
    const w = new World('puerta-3', 3);
    const c = w.citizens[0];
    juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.pisoObjetivo).toBe(1);
    for (let t = 0; t < 60 * 30; t++) w.tick();
    expect(c.piso).toBe(1);
  });

  it('enPuerta distingue hueco de pared', () => {
    const w = new World('puerta-4', 1);
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    const p = b.puerta!;
    expect(enPuerta(b, p.x, p.z)).toBe(true);
    // a más de anchoPuerta/2 del centro del hueco, sobre la misma pared: es pared
    const lejos = INTERIOR.anchoPuerta / 2 + 1;
    if (p.lado === 0 || p.lado === 2) expect(enPuerta(b, p.x, p.z + lejos)).toBe(false);
    else expect(enPuerta(b, p.x + lejos, p.z)).toBe(false);
  });

  it('dos mundos con interiores siguen siendo gemelos', () => {
    const a = new World('puerta-5', 300);
    const b = new World('puerta-5', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [x] **Step 2: Verificar que falla** — FAIL (interior.ts no existe).

- [x] **Step 3: Implementar `src/sim/interior.ts`**

```ts
import type { Building } from './cityGen';
import type { Citizen } from './types';
import type { World } from './world';
import { DIRECCIONES, DT, INTERIOR, PANICO } from './config';

/** Normal hacia dentro del edificio, por lado de la puerta. */
export const NORMAL_INTERIOR: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // puerta oeste → dentro es +x
  [0, 1], // norte → +z
  [-1, 0], // este → -x
  [0, -1], // sur → -z
];

export function enEscalera(b: Building, x: number, z: number): boolean {
  const e = b.escalera!;
  return x >= e.x && x < e.x + e.width && z >= e.z && z < e.z + e.depth;
}

export function enPuerta(b: Building, x: number, z: number): boolean {
  const p = b.puerta!;
  const medio = INTERIOR.anchoPuerta / 2;
  if (p.lado === 0 || p.lado === 2) {
    return Math.abs(z - p.z) <= medio && Math.abs(x - p.x) <= 0.8;
  }
  return Math.abs(x - p.x) <= medio && Math.abs(z - p.z) <= 0.8;
}

const MARGEN_PARED = 0.3;

/** Movimiento dentro del edificio: perímetro sólido salvo el hueco de la puerta (solo piso 0). */
export function moverInterior(b: Building, c: Citizen, nx: number, nz: number): void {
  const minX = b.x + MARGEN_PARED;
  const maxX = b.x + b.width - MARGEN_PARED;
  const minZ = b.z + MARGEN_PARED;
  const maxZ = b.z + b.depth - MARGEN_PARED;
  const saldria = nx < minX || nx > maxX || nz < minZ || nz > maxZ;
  if (saldria && c.piso === 0 && enPuerta(b, nx, nz)) {
    c.x = nx;
    c.z = nz;
    c.dentroDe = -1;
    c.pisoObjetivo = 0;
    return;
  }
  c.x = Math.min(Math.max(nx, minX), maxX);
  c.z = Math.min(Math.max(nz, minZ), maxZ);
}

/** En la escalera y con objetivo distinto: cambia de piso tras INTERIOR.escaleraTicks. */
export function avanzarEscalera(b: Building, c: Citizen): boolean {
  if (c.pisoObjetivo === c.piso || !enEscalera(b, c.x, c.z)) {
    c.escaleraTicks = 0;
    return false;
  }
  c.escaleraTicks++;
  if (c.escaleraTicks >= INTERIOR.escaleraTicks) {
    c.piso += c.pisoObjetivo > c.piso ? 1 : -1;
    c.escaleraTicks = 0;
  }
  return true; // subiendo: no se mueve
}

function haciaEscalera(b: Building, c: Citizen): void {
  const e = b.escalera!;
  const dx = e.x + e.width / 2 - c.x;
  const dz = e.z + e.depth / 2 - c.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0.001) {
    c.dirX = dx / len;
    c.dirZ = dz / len;
  }
}

export function updateInterior(c: Citizen, world: World): void {
  c.prevX = c.x;
  c.prevZ = c.z;
  const b = world.city.buildings[c.dentroDe];

  if (c.salud === 'zombi') {
    updateInteriorZombi(c, world, b);
    return;
  }

  if (avanzarEscalera(b, c)) return;

  if (c.animo === 'panico') {
    c.animoTicks++;
    if (c.animoTicks >= PANICO.ticksCalmarse) {
      c.animo = 'tranquilo';
    } else if (c.piso !== c.pisoObjetivo) {
      haciaEscalera(b, c);
      moverInterior(b, c, c.x + c.dirX * PANICO.velocidadHuida * DT, c.z + c.dirZ * PANICO.velocidadHuida * DT);
    }
    return;
  }

  // escondido: si aún quiere cambiar de piso, sigue hacia la escalera
  if (c.pisoObjetivo !== c.piso) {
    haciaEscalera(b, c);
    moverInterior(b, c, c.x + c.dirX * 0.9 * DT, c.z + c.dirZ * 0.9 * DT);
    return;
  }
  // escondido: deambula lento por su piso
  if (world.rngCiudadanos.chance(0.01)) {
    const [dx0, dz0] = DIRECCIONES[world.rngCiudadanos.int(0, DIRECCIONES.length - 1)];
    c.dirX = dx0;
    c.dirZ = dz0;
  }
  moverInterior(b, c, c.x + c.dirX * 0.5 * DT, c.z + c.dirZ * 0.5 * DT);
}

/** Task 3: el zombi interior aún no caza (lo hace la Task 4). */
function updateInteriorZombi(c: Citizen, world: World, b: Building): void {
  void world;
  void b;
}
```

**(b)** `types.ts`: añadir a `Citizen`: `piso: number; pisoObjetivo: number; escaleraTicks: number;` — y en `spawnCitizens` (citizens.ts) inicializarlos a 0.

**(c)** Reemplazar `src/sim/refugio.ts` completo:

```ts
import type { Citizen } from './types';
import type { World } from './world';
import { CITY, CITY_PERIOD, REFUGIO } from './config';
import { NORMAL_INTERIOR } from './interior';

/** Si hay una PUERTA jugable pegada (bloque propio o vecinos), entra a refugiarse. */
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
    const p = b.puerta!;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    if (Math.sqrt(dx * dx + dz * dz) <= REFUGIO.radioEntrar) {
      const [nx, nz] = NORMAL_INTERIOR[p.lado];
      c.dentroDe = b.id;
      c.piso = 0;
      c.pisoObjetivo = 1; // instinto: subir a esconderse
      c.escaleraTicks = 0;
      c.x = p.x + nx * 1.2;
      c.z = p.z + nz * 1.2;
      c.prevX = c.x;
      c.prevZ = c.z;
      world.ocupantes[b.id]++;
      return;
    }
  }
}
```

**(d)** `src/sim/infeccion.ts`: eliminar el import de `romperEdificio` y la línea `if (c.dentroDe >= 0) romperEdificio(world, c.dentroDe);` (el zombi recién transformado se queda dentro).

**(e)** `src/sim/world.ts`:
- Campo nuevo: `readonly dentroPorEdificio: number[][];` inicializado en el constructor: `this.dentroPorEdificio = this.city.buildings.map(() => []);`
- Al inicio de `tick()` (antes del rebuild de la rejilla):

```ts
    for (const lista of this.dentroPorEdificio) lista.length = 0;
    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      if (c.dentroDe >= 0 && c.salud !== 'eliminado') this.dentroPorEdificio[c.dentroDe].push(i);
    }
    for (let bId = 0; bId < this.ocupantes.length; bId++) {
      let humanos = 0;
      for (const i of this.dentroPorEdificio[bId]) {
        if (this.citizens[i].salud !== 'zombi') humanos++;
      }
      this.ocupantes[bId] = humanos;
    }
```

- La rama del dispatch: `if (c.dentroDe >= 0) { updateInterior(c, this); actualizarIncubacion(c, this); continue; }`
- `hashState`: añadir `mix(c.piso);` tras `mix(c.dentroDe + 1);`

**(f)** REESCRIBIR `tests/refugio.test.ts` (las semánticas de brecha/expulsión murieron):

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { intentarRefugio } from '../src/sim/refugio';

function juntoAPuerta(w: World, c: World['citizens'][0]): number {
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  const fuera: ReadonlyArray<readonly [number, number]> = [[-1.5, 0], [0, -1.5], [1.5, 0], [0, 1.5]];
  c.x = p.x + fuera[p.lado][0];
  c.z = p.z + fuera[p.lado][1];
  c.prevX = c.x;
  c.prevZ = c.z;
  return b.id;
}

describe('refugio por la puerta', () => {
  it('un ciudadano en pánico junto a la puerta entra y cuenta como ocupante', () => {
    const w = new World('refugio-1', 5);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(id);
    w.tick();
    expect(w.ocupantes[id]).toBe(1);
  });

  it('no entra si hay brecha', () => {
    const w = new World('refugio-2', 5);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    w.brecha[id] = true;
    c.animo = 'panico';
    intentarRefugio(c, w);
    expect(c.dentroDe).toBe(-1);
  });

  it('la incubación sigue dentro y el zombi se queda dentro (bomba de tiempo silenciosa)', () => {
    const w = new World('refugio-3', 4);
    const c = w.citizens[0];
    const id = juntoAPuerta(w, c);
    c.animo = 'panico';
    intentarRefugio(c, w);
    c.salud = 'incubando';
    c.incubacionTicks = 3;
    for (let t = 0; t < 6; t++) w.tick();
    expect(c.salud).toBe('zombi');
    expect(c.dentroDe).toBe(id); // ya no hay expulsión
    w.tick();
    expect(w.ocupantes[id]).toBe(0); // el zombi no cuenta como ocupante humano
  });
});
```

- [x] **Step 4: Verificar** — `npm test` verde (con `asedio.test.ts` posiblemente afectado: el asedio de la Task 5 de Plan 2 sigue llamando a `romperEdificio`… que ya no existe → ACTUALIZAR TAMBIÉN `src/sim/asedio.ts` MÍNIMAMENTE en esta task: sustituir `romperEdificio(world, b.id)` por `world.brecha[b.id] = true;` + el ruido/splat que ya hacía romperEdificio en la puerta — la física completa llega en la Task 5 — y ajustar `tests/asedio.test.ts` quitando las aserciones de expulsión: el test "cinco zombis..." pasa a esperar solo `brecha === true`). `npx tsc --noEmit` limpio.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: vida interior — pisos, puerta, escaleras y refugio fisico"
```

---

### Task 4: Caza interior — el terror piso por piso

**Files:**
- Modify: `src/sim/interior.ts` (rama zombi completa + pánico interior de humanos), `src/sim/config.ts` (constante)
- Test: `tests/cazaInterior.test.ts`

**Interfaces:**
- `config.ts` suma: `export const INTERIOR_VISION = 12; // m de vista dentro (sin paredes internas)`
- `interior.ts`: la rama humana suma percepción interior (zombi en MI edificio y MI piso a ≤`INTERIOR_VISION` → pánico); decisión de huida interior:
  - **piso 0 con puerta utilizable** (recuerda: el hueco siempre deja salir) → huir POR la puerta (dir hacia la puerta; `moverInterior` lo saca solo);
  - **si no** → `pisoObjetivo = min(piso + 1, INTERIOR.azotea)` y a la escalera;
  - **azotea con zombi** → huir del zombi dentro del rect (dir opuesta), sin salida — la última resistencia.
- `updateInteriorZombi` completo: presa = humano más cercano de MI edificio y MI piso (iterando `world.dentroPorEdificio[b.id]` en orden); la persigue a `ZOMBIS.velocidad * 0.8` (pasillos estrechos) con `moverInterior` y muerde igual que fuera (`infectar` + grito con `radioGrito / 2` — las paredes amortiguan). Sin presa en mi piso pero humanos en otro → a la escalera con `pisoObjetivo` hacia el piso MÁS CERCANO con humanos (empate: el de abajo). Edificio sin humanos → si `piso === 0`, salir por la puerta (dir a la puerta); si no, bajar.

- [x] **Step 1: Test que falla — `tests/cazaInterior.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

function encierra(seed: string): { w: World; zombi: World['citizens'][0]; presa: World['citizens'][0]; id: number } {
  const w = new World(seed, 2);
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const [zombi, presa] = w.citizens;
  const cx = b.x + b.width / 2;
  const cz = b.z + b.depth / 2;
  zombi.salud = 'zombi';
  zombi.dentroDe = b.id;
  zombi.piso = 0;
  zombi.x = cx - 5; zombi.z = cz; zombi.prevX = zombi.x; zombi.prevZ = zombi.z;
  presa.dentroDe = b.id;
  presa.piso = 0;
  presa.animo = 'tranquilo';
  presa.pisoObjetivo = 0;
  presa.x = cx + 5; presa.z = cz; presa.prevX = presa.x; presa.prevZ = presa.z;
  return { w, zombi, presa, id: b.id };
}

describe('caza interior', () => {
  it('el zombi caza dentro del edificio y la presa reacciona', () => {
    const { w, presa } = encierra('caza-int-1');
    for (let t = 0; t < 30 * 30; t++) w.tick();
    // la presa fue mordida, o escapó del edificio, o subió de piso — pero NO sigue tranquila en su sitio
    const sigueTranquilaAhi = presa.salud === 'sano' && presa.dentroDe >= 0 && presa.piso === 0 && presa.animo === 'tranquilo';
    expect(sigueTranquilaAhi).toBe(false);
  });

  it('un zombi sin presa en su piso va a la escalera y cambia de piso', () => {
    const { w, zombi, presa } = encierra('caza-int-2');
    presa.piso = 1; // la presa está arriba
    for (let t = 0; t < 60 * 30; t++) {
      w.tick();
      if (zombi.piso === 1) break;
    }
    expect(zombi.piso).toBe(1);
  });

  it('edificio vacío: el zombi de planta baja sale a la calle', () => {
    const { w, zombi, presa } = encierra('caza-int-3');
    presa.salud = 'eliminado'; // no queda nadie
    for (let t = 0; t < 60 * 30; t++) {
      w.tick();
      if (zombi.dentroDe < 0) break;
    }
    expect(zombi.dentroDe).toBe(-1);
  });

  it('gemelos deterministas con caza interior', () => {
    const a = new World('caza-int-4', 300);
    const b = new World('caza-int-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [x] **Step 2: Verificar que falla** — FAIL (el zombi interior hoy no hace nada).

- [x] **Step 3: Implementar** — reemplazar en `src/sim/interior.ts` la rama humana de percepción y `updateInteriorZombi`:

En `updateInterior`, justo después de obtener `b` y antes de la rama zombi/escalera, añadir percepción humana:

```ts
  if (c.salud !== 'zombi') {
    let amenaza: Citizen | null = null;
    let mejorD2 = INTERIOR_VISION * INTERIOR_VISION;
    for (const i of world.dentroPorEdificio[b.id]) {
      const o = world.citizens[i];
      if (o.salud !== 'zombi' || o.piso !== c.piso) continue;
      const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
      if (d2 < mejorD2) {
        mejorD2 = d2;
        amenaza = o;
      }
    }
    if (amenaza) {
      c.animo = 'panico';
      c.animoTicks = 0;
      if (c.piso === 0) {
        // huir por la puerta
        const p = b.puerta!;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
        c.pisoObjetivo = 0;
      } else if (c.piso < INTERIOR.azotea) {
        c.pisoObjetivo = c.piso + 1;
      } else {
        // azotea: huir del zombi dentro del rect — última resistencia
        const dx = c.x - amenaza.x;
        const dz = c.z - amenaza.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
        c.pisoObjetivo = c.piso;
      }
      moverInterior(b, c, c.x + c.dirX * PANICO.velocidadHuida * DT, c.z + c.dirZ * PANICO.velocidadHuida * DT);
      return;
    }
  }
```

(Colocado de modo que el flujo humano existente — escalera, pánico sin amenaza, escondido — quede DESPUÉS y solo corra cuando no hay amenaza a la vista. Importar `INTERIOR_VISION` y `ZOMBIS` de config.)

Y `updateInteriorZombi`:

```ts
function updateInteriorZombi(c: Citizen, world: World, b: Building): void {
  if (avanzarEscalera(b, c)) return;

  let presa: Citizen | null = null;
  let mejorD2 = Infinity;
  let pisoConHumanos = -1;
  let mejorDistPiso = Infinity;
  for (const i of world.dentroPorEdificio[b.id]) {
    const o = world.citizens[i];
    if (o.salud === 'zombi') continue;
    const distPiso = Math.abs(o.piso - c.piso);
    if (distPiso < mejorDistPiso) {
      mejorDistPiso = distPiso;
      pisoConHumanos = o.piso;
    }
    if (o.piso !== c.piso) continue;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      presa = o;
    }
  }

  if (presa) {
    const dx = presa.x - c.x;
    const dz = presa.z - c.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
    moverInterior(b, c, c.x + c.dirX * ZOMBIS.velocidad * 0.8 * DT, c.z + c.dirZ * ZOMBIS.velocidad * 0.8 * DT);
    if (c.cdMordida > 0) c.cdMordida--;
    if (mejorD2 <= INFECCION.radioMordida ** 2 && c.cdMordida === 0) {
      infectar(presa, world.rngInfeccion);
      presa.animo = 'panico';
      presa.animoTicks = 0;
      world.ruidos.push({ x: presa.x, z: presa.z, radio: PANICO.radioGrito / 2, ticks: PANICO.duracionGritoTicks });
      c.cdMordida = ZOMBIS.enfriamientoMordidaTicks;
    }
    return;
  }

  if (pisoConHumanos >= 0) {
    c.pisoObjetivo = pisoConHumanos;
    haciaEscalera(b, c);
  } else if (c.piso === 0) {
    // edificio sin humanos: salir a la calle
    const p = b.puerta!;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) { c.dirX = dx / len; c.dirZ = dz / len; }
  } else {
    c.pisoObjetivo = 0;
    haciaEscalera(b, c);
  }
  moverInterior(b, c, c.x + c.dirX * ZOMBIS.velocidad * 0.8 * DT, c.z + c.dirZ * ZOMBIS.velocidad * 0.8 * DT);
}
```

(Importar `infectar` de `./infeccion` — igual que zombis.ts, sin ciclo runtime problemático porque infeccion ya no importa refugio.)

- [x] **Step 4: Verificar** — `npm test` verde; tsc limpio.
- [x] **Step 5: Commit**

```bash
git add src/sim/interior.ts src/sim/config.ts tests/cazaInterior.test.ts
git commit -m "feat: caza interior piso por piso, huida por la puerta y ultima resistencia en azotea"
```

---

### Task 5: Asedio físico a la puerta — los zombis entran

**Files:**
- Modify: `src/sim/asedio.ts` (presión sobre la PUERTA), `src/sim/zombis.ts` (entrar por puertas rotas), `src/sim/config.ts` (`ASEDIO.radioPuerta`)
- Test: `tests/asedio.test.ts` (reescribir a la semántica física)

**Interfaces:**
- `config.ts`: dentro de `ASEDIO` añadir `radioPuerta: 4, // m alrededor de la puerta donde los zombis presionan` (conservar el resto tal cual — incluida la ADVERTENCIA de filo de navaja).
- `asedio.ts`: la presión se mide en un círculo alrededor de la PUERTA (no del centro); el ruido periódico de los refugiados también suena en la puerta; al superar `resistencia`: `brecha = true` (puerta rota) + ruido doble + splat en la puerta. **Nada de expulsiones**: ahora la brecha significa que los zombis PUEDEN ENTRAR.
- `zombis.ts` (exterior): tras el movimiento, si el zombi NO tiene presa a la vista, probar entrar: iterar los 4 bloques candidatos (mismo patrón que `intentarRefugio`); si hay jugable con `brecha`, con humanos dentro (`world.ocupantes[b.id] > 0`) y la puerta a ≤2 m → entra (`dentroDe = b.id`, `piso = 0`, posición 1.2 m hacia dentro con `NORMAL_INTERIOR`, prev reset).

- [x] **Step 1: Reescribir `tests/asedio.test.ts` (test que falla)**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { resolverAsedios } from '../src/sim/asedio';
import { ASEDIO } from '../src/sim/config';

function sitiado(seed: string, nZombis: number): { w: World; id: number } {
  const w = new World(seed, nZombis + 3);
  const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
  const p = b.puerta!;
  for (let i = 0; i < 3; i++) {
    w.citizens[i].dentroDe = b.id;
    w.citizens[i].piso = 1;
  }
  for (let i = 3; i < 3 + nZombis; i++) {
    const z = w.citizens[i];
    z.salud = 'zombi';
    z.x = p.x + (i - 3) * 0.4 - 0.8;
    z.z = p.z + (p.lado === 1 ? -1.5 : p.lado === 3 ? 1.5 : 0);
    if (p.lado === 0) z.x = p.x - 1.5;
    if (p.lado === 2) z.x = p.x + 1.5;
    z.prevX = z.x;
    z.prevZ = z.z;
  }
  w.tick(); // reconstruye dentroPorEdificio/ocupantes/grid
  return { w, id: b.id };
}

describe('asedio físico a la puerta', () => {
  it('cinco zombis en la puerta la rompen', () => {
    const { w, id } = sitiado('asedio-1', 5);
    const ticks = Math.ceil(ASEDIO.resistencia / 5) + 2;
    for (let t = 0; t < ticks; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(true);
  });

  it('sin zombis la presión decae', () => {
    const { w, id } = sitiado('asedio-2', 0);
    for (let t = 0; t < 200; t++) resolverAsedios(w);
    expect(w.brecha[id]).toBe(false);
    expect(w.presion[id]).toBe(0);
  });

  it('con la puerta rota, los zombis de fuera acaban entrando a cazar', () => {
    const { w, id } = sitiado('asedio-3', 5);
    w.brecha[id] = true;
    let entro = false;
    for (let t = 0; t < 20 * 30; t++) {
      w.tick();
      if (w.citizens.some((c) => c.salud === 'zombi' && c.dentroDe === id)) {
        entro = true;
        break;
      }
    }
    expect(entro).toBe(true);
  });

  it('el drama completo: brecha → entran → los de arriba caen', () => {
    const { w, id } = sitiado('asedio-4', 6);
    for (let t = 0; t < 120 * 30; t++) {
      w.tick();
      if (w.ocupantes[id] === 0) break;
    }
    // en dos minutos el refugio sitiado por 6 zombis no sobrevive intacto
    const vivosDentroSanos = w.citizens.filter(
      (c) => c.dentroDe === id && c.salud === 'sano'
    ).length;
    expect(vivosDentroSanos).toBeLessThan(3);
  });
});
```

- [x] **Step 2: Verificar que falla** — FAIL (presión aún en el centro; zombis no entran).

- [x] **Step 3: Implementar**

**(a)** Reemplazar `src/sim/asedio.ts` completo:

```ts
import type { World } from './world';
import { ASEDIO, PANICO } from './config';

/**
 * Los zombis presionan la PUERTA de los refugios ocupados (diseño §3.3).
 * Al romperse (brecha), los zombis pueden entrar — la caza sigue dentro.
 */
export function resolverAsedios(world: World): void {
  for (const b of world.city.buildings) {
    if (b.kind !== 'jugable' || world.brecha[b.id] || world.ocupantes[b.id] === 0) {
      world.presion[b.id] = 0;
      continue;
    }
    const p = b.puerta!;
    if (world.tickCount % ASEDIO.ruidoCadaTicks === 0) {
      world.ruidos.push({ x: p.x, z: p.z, radio: ASEDIO.ruidoRadio, ticks: ASEDIO.ruidoTicks });
    }
    let zombis = 0;
    for (const i of world.grid.queryCircle(p.x, p.z, ASEDIO.radioPuerta)) {
      if (world.citizens[i].salud === 'zombi') zombis++;
    }
    if (zombis > 0) {
      world.presion[b.id] += zombis * ASEDIO.presionPorZombi;
    } else {
      world.presion[b.id] = Math.max(0, world.presion[b.id] - ASEDIO.alivioPorTick);
    }
    if (world.presion[b.id] >= ASEDIO.resistencia) {
      world.brecha[b.id] = true;
      world.ruidos.push({ x: p.x, z: p.z, radio: PANICO.radioGrito * 2, ticks: PANICO.duracionGritoTicks * 2 });
      world.splats.push({ x: p.x, z: p.z, tono: world.rngInfeccion.next() });
    }
  }
}
```

**(b)** `src/sim/zombis.ts`: al FINAL de `updateZombi` (después de la mordida), añadir:

```ts
  // puerta rota cerca y sin presa a la vista: entrar a cazar
  if (!objetivo) {
    const bx = Math.floor(c.x / CITY_PERIOD);
    const bz = Math.floor(c.z / CITY_PERIOD);
    const candidatos: ReadonlyArray<readonly [number, number]> = [
      [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
    ];
    for (const [ix, iz] of candidatos) {
      if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
      const b = world.city.buildings[ix * CITY.blocksY + iz];
      if (b.kind !== 'jugable' || !world.brecha[b.id] || world.ocupantes[b.id] === 0) continue;
      const p = b.puerta!;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (Math.sqrt(dx * dx + dz * dz) <= 2) {
        const [nx, nz] = NORMAL_INTERIOR[p.lado];
        c.dentroDe = b.id;
        c.piso = 0;
        c.pisoObjetivo = 0;
        c.x = p.x + nx * 1.2;
        c.z = p.z + nz * 1.2;
        c.prevX = c.x;
        c.prevZ = c.z;
        return;
      }
    }
  }
```

(Imports nuevos en zombis.ts: `CITY`, `CITY_PERIOD` de config y `NORMAL_INTERIOR` de `./interior`.)

- [x] **Step 4: Verificar** — `npm test` verde; tsc limpio; grep de portabilidad verde.
- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: asedio fisico a la puerta — al romperse, los zombis entran"
```

---

### Task 6: Render de interiores — la vista recortada

**Files:**
- Create: `src/render/jugablesView.ts`
- Modify: `src/render/cityView.ts` (solo fondos instanciados), `src/render/citizensView.ts` (altura por piso), `src/game/main.ts`
- Sin tests unitarios (render); verificación en navegador.

**Interfaces:**
- `JugablesView { constructor(scene, city); update(world: World, focoX: number, focoZ: number): void }` — construye geometría real por edificio jugable: losa del piso 1, techo (= suelo de azotea), 4 paredes por nivel (la de la puerta partida en dos con el hueco), marcador de escalera. **Vista recortada:** el edificio cuyo footprint (+3 m) contiene el foco de cámara oculta su techo y sus paredes oeste (−x) y norte (−z) — las que dan a la cámara con el yaw fijo de 45°. El techo NO se oculta si hay gente en la azotea (están parados sobre él).
- `CityView`: el InstancedMesh y `updateOcclusion` pasan a operar SOLO sobre edificios `fondo` (los jugables ya no son cajas).
- `CitizensView.update`: `y = 0.85 + c.piso * INTERIOR.alturaPiso`; los de dentro SÍ se dibujan (el techo/paredes los ocultan naturalmente por profundidad); solo `eliminado` se esconde.

- [x] **Step 1: Implementar `src/render/jugablesView.ts`**

```ts
import * as THREE from 'three';
import type { Building, CityLayout } from '../sim/cityGen';
import type { World } from '../sim/world';
import { INTERIOR } from '../sim/config';

const GROSOR = 0.3;
const COLOR_PARED = 0x5a6b7d;
const COLOR_LOSA = 0x49566b;
const COLOR_TECHO = 0x424e5f;
const COLOR_ESCALERA = 0x8091a5;

interface Piezas {
  techo: THREE.Mesh;
  ocultables: THREE.Mesh[];
}

export class JugablesView {
  private readonly piezas: Array<Piezas | null>;
  private readonly jugables: Building[];
  private readonly enAzotea: boolean[];

  constructor(scene: THREE.Scene, city: CityLayout) {
    this.piezas = city.buildings.map(() => null);
    this.jugables = city.buildings.filter((b) => b.kind === 'jugable');
    this.enAzotea = city.buildings.map(() => false);
    for (const b of this.jugables) scene.add(this.construir(b));
  }

  private construir(b: Building): THREE.Group {
    const g = new THREE.Group();
    const h = INTERIOR.alturaPiso;
    const matPared = new THREE.MeshLambertMaterial({ color: COLOR_PARED });
    const ocultables: THREE.Mesh[] = [];

    const losa = new THREE.Mesh(
      new THREE.BoxGeometry(b.width, 0.2, b.depth),
      new THREE.MeshLambertMaterial({ color: COLOR_LOSA })
    );
    losa.position.set(b.x + b.width / 2, h, b.z + b.depth / 2);
    g.add(losa);

    const techo = new THREE.Mesh(
      new THREE.BoxGeometry(b.width, 0.25, b.depth),
      new THREE.MeshLambertMaterial({ color: COLOR_TECHO })
    );
    techo.position.set(b.x + b.width / 2, h * 2, b.z + b.depth / 2);
    g.add(techo);

    for (let nivel = 0; nivel < 2; nivel++) {
      const y = nivel * h + h / 2;
      for (let lado = 0; lado < 4; lado++) {
        const conPuerta = nivel === 0 && b.puerta!.lado === lado;
        for (const [mx, mz, mw, md] of this.murosDeLado(b, lado, conPuerta)) {
          if (mw <= 0.01 || md <= 0.01) continue;
          const muro = new THREE.Mesh(new THREE.BoxGeometry(mw, h, md), matPared);
          muro.position.set(mx, y, mz);
          g.add(muro);
          if (lado === 0 || lado === 1) ocultables.push(muro); // caras a la cámara (yaw fijo 45°)
        }
      }
    }

    const e = b.escalera!;
    const esc = new THREE.Mesh(
      new THREE.BoxGeometry(e.width - 1, 1.2, e.depth - 1),
      new THREE.MeshLambertMaterial({ color: COLOR_ESCALERA })
    );
    esc.position.set(e.x + e.width / 2, 0.6, e.z + e.depth / 2);
    g.add(esc);

    this.piezas[b.id] = { techo, ocultables };
    return g;
  }

  /** Segmentos de muro [centroX, centroZ, anchoX, anchoZ] de un lado, con o sin hueco de puerta. */
  private murosDeLado(b: Building, lado: number, conPuerta: boolean): Array<[number, number, number, number]> {
    const p = b.puerta!;
    const medio = INTERIOR.anchoPuerta / 2;
    if (lado === 0 || lado === 2) {
      const x = lado === 0 ? b.x : b.x + b.width;
      if (!conPuerta) return [[x, b.z + b.depth / 2, GROSOR, b.depth]];
      const l1 = p.z - medio - b.z;
      const l2 = b.z + b.depth - (p.z + medio);
      return [
        [x, b.z + l1 / 2, GROSOR, l1],
        [x, p.z + medio + l2 / 2, GROSOR, l2],
      ];
    }
    const z = lado === 1 ? b.z : b.z + b.depth;
    if (!conPuerta) return [[b.x + b.width / 2, z, b.width, GROSOR]];
    const l1 = p.x - medio - b.x;
    const l2 = b.x + b.width - (p.x + medio);
    return [
      [b.x + l1 / 2, z, l1, GROSOR],
      [p.x + medio + l2 / 2, z, l2, GROSOR],
    ];
  }

  update(world: World, focoX: number, focoZ: number): void {
    this.enAzotea.fill(false);
    for (const c of world.citizens) {
      if (c.dentroDe >= 0 && c.piso === INTERIOR.azotea && c.salud !== 'eliminado') {
        this.enAzotea[c.dentroDe] = true;
      }
    }
    for (const b of this.jugables) {
      const activo =
        focoX >= b.x - 3 && focoX <= b.x + b.width + 3 &&
        focoZ >= b.z - 3 && focoZ <= b.z + b.depth + 3;
      const piezas = this.piezas[b.id]!;
      piezas.techo.visible = !activo || this.enAzotea[b.id];
      for (const m of piezas.ocultables) m.visible = !activo;
    }
  }
}
```

- [x] **Step 2: `src/render/cityView.ts`** — cambiar el constructor y `updateOcclusion` para operar solo sobre `fondo`: guardar `private readonly fondos: Building[]` (filtrado del city), crear el `InstancedMesh` con `fondos.length`, indexar matrices/colores/aplanado por posición en `fondos` (ya no por `buildings`). El color jugable y su rama desaparecen de esta clase.

- [x] **Step 3: `src/render/citizensView.ts`** — en `update`: `const oculto = c.salud === 'eliminado';` (los de dentro ya no se esconden) y la posición: `this.dummy.position.set(x, 0.85 + c.piso * INTERIOR.alturaPiso, z);` (importar `INTERIOR` de `../sim/config`).

- [x] **Step 4: `src/game/main.ts`** — crear `const jugablesView = new JugablesView(scene, world.city);` tras `cityView`, y en el bucle de render, después de `updateOcclusion`: `jugablesView.update(world, foco.x, foco.z);`

- [x] **Step 5: Verificar en navegador** — `npx tsc --noEmit` limpio; `npm test` verde; `npm run dev`:
- Los jugables se ven como edificios de 2 pisos con techo y hueco de puerta visible.
- Acercar el foco a un jugable con gente dentro: techo y paredes oeste/norte desaparecen y se ve el interior con personas en planta baja y piso 1 (a distinta altura).
- Si hay gente en la azotea, el techo se queda (están parados encima).
- Un asedio completo visible: zombis apiñados en la puerta → splat → entran → la gente sube → drama en la azotea.
- Consola limpia. Detener el servidor.

- [x] **Step 6: Commit**

```bash
git add src/render src/game/main.ts
git commit -m "feat: interiores visibles con vista recortada estilo Project Zomboid"
```

---

### Task 7: Familias — no me voy sin los míos

**Files:**
- Modify: `src/sim/types.ts` (`familia`, `cabezaFamilia`, `familiares`), `src/sim/citizens.ts` (spawn en grupos), `src/sim/panico.ts` (seguir a la familia; protector que vuelve)
- Test: `tests/familias.test.ts`

**Interfaces:**
- `Citizen` suma: `familia: number;` (−1 = sin familia), `cabezaFamilia: number;` (id menor de la familia; él mismo si va solo), `familiares: number[];` (ids de los demás miembros; estático).
- Spawn por grupos: tamaños 1 (45%), 2 (25%), 3 (20%), 4 (10%) vía `rng.next()`; el grupo comparte APELLIDO; los seguidores nacen pegados a la cabeza (misma calle, +1.5 m por miembro sobre el eje de marcha, misma dirección). Dos pasadas finales (bucles por índice, sin Map) llenan `familiares`.
- Comportamiento:
  - **Tranquilo, seguidor** (`cabezaFamilia !== c.id`): si la cabeza está viva, fuera y a >3 m → paso directo hacia ella con `moveWithSlide` a `walkSpeed` (la familia camina en grupito); si no, camina normal.
  - **Pánico, protector**: si tiene un familiar vivo fuera a entre 4 y 30 m y ningún zombi a <6 m → la dirección de huida se REEMPLAZA por "hacia el familiar" (el padre que vuelve). El resto de personalidades huye normal.

- [x] **Step 1: Test que falla — `tests/familias.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

describe('familias', () => {
  it('los grupos comparten apellido y tienen 2–4 miembros', () => {
    const w = new World('familia-1', 400);
    const familias = new globalThis.Map<number, string[]>();
    for (const c of w.citizens) {
      if (c.familia < 0) continue;
      const lista = familias.get(c.familia) ?? [];
      lista.push(c.name.split(' ')[1]);
      familias.set(c.familia, lista);
    }
    expect(familias.size).toBeGreaterThan(10);
    for (const apellidos of familias.values()) {
      expect(apellidos.length).toBeGreaterThanOrEqual(2);
      expect(apellidos.length).toBeLessThanOrEqual(4);
      expect(new globalThis.Set(apellidos).size).toBe(1);
    }
  });

  it('las familias caminan juntas (cohesión emergente)', () => {
    const w = new World('familia-2', 400);
    for (let t = 0; t < 30 * 30; t++) w.tick();
    let distancias = 0;
    let pares = 0;
    for (const c of w.citizens) {
      if (c.cabezaFamilia === c.id || c.dentroDe >= 0) continue;
      const cabeza = w.citizens[c.cabezaFamilia];
      if (cabeza.dentroDe >= 0 || cabeza.salud === 'eliminado') continue;
      distancias += Math.sqrt((c.x - cabeza.x) ** 2 + (c.z - cabeza.z) ** 2);
      pares++;
    }
    expect(pares).toBeGreaterThan(0);
    expect(distancias / pares).toBeLessThan(8); // pegados a su cabeza de familia
  });

  it('el protector en pánico vuelve por su familiar lejano', () => {
    const w = new World('familia-3', 400);
    const protector = w.citizens.find((c) => c.personality === 'protector' && c.familia >= 0)!;
    expect(protector).toBeDefined();
    const familiar = w.citizens[protector.familiares[0]];
    // separarlos y ponerle pánico sin zombis cerca
    familiar.x = Math.min(protector.x + 15, 270);
    familiar.z = protector.z;
    familiar.prevX = familiar.x;
    familiar.prevZ = familiar.z;
    protector.animo = 'panico';
    protector.animoTicks = 0;
    const d0 = Math.sqrt((protector.x - familiar.x) ** 2 + (protector.z - familiar.z) ** 2);
    w.tick();
    const d1 = Math.sqrt((protector.x - familiar.x) ** 2 + (protector.z - familiar.z) ** 2);
    expect(d1).toBeLessThan(d0); // se acerca, no huye
  });

  it('gemelos deterministas con familias', () => {
    const a = new World('familia-4', 300);
    const b = new World('familia-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [x] **Step 2: Verificar que falla** — FAIL (`familia` no existe).

- [x] **Step 3: Implementar**

**(a)** `types.ts`: añadir a `Citizen`: `familia: number; cabezaFamilia: number; familiares: number[];`

**(b)** `citizens.ts` — reescribir el cuerpo de `spawnCitizens` (la lógica de calles/corredores se conserva; cambia el nombre y se añade el agrupamiento):

```ts
export function spawnCitizens(rng: Rng, count: number): Citizen[] {
  const citizens: Citizen[] = [];
  let grupoRestante = 0;
  let apellidoGrupo = '';
  let familiaId = -1;
  let siguienteFamilia = 0;
  let cabezaActual = -1;

  for (let i = 0; i < count; i++) {
    if (grupoRestante === 0) {
      const r = rng.next();
      grupoRestante = r < 0.45 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : 4;
      apellidoGrupo = rng.pick(APELLIDOS);
      familiaId = grupoRestante > 1 ? siguienteFamilia++ : -1;
      cabezaActual = i;
    }

    let x: number;
    let z: number;
    let dirX = 0;
    let dirZ = 0;
    let laneOffset: number;

    if (i === cabezaActual) {
      // la cabeza elige calle como siempre
      const vertical = rng.chance(0.5);
      laneOffset = (rng.next() - 0.5) * (CITY.streetWidth - LANE_MARGIN * 2);
      if (vertical) {
        const k = rng.int(0, CITY.blocksX);
        x = corridorCenter(k) + laneOffset;
        z = 1 + rng.next() * (CITY_DEPTH - 2);
        dirZ = rng.chance(0.5) ? 1 : -1;
      } else {
        const k = rng.int(0, CITY.blocksY);
        z = corridorCenter(k) + laneOffset;
        x = 1 + rng.next() * (CITY_WIDTH - 2);
        dirX = rng.chance(0.5) ? 1 : -1;
      }
    } else {
      // los familiares nacen pegados a la cabeza, sobre su misma calle
      const cabeza = citizens[cabezaActual];
      const paso = (i - cabezaActual) * 1.5;
      laneOffset = cabeza.laneOffset;
      x = Math.min(Math.max(cabeza.x + cabeza.dirX * paso, 1), CITY_WIDTH - 1);
      z = Math.min(Math.max(cabeza.z + cabeza.dirZ * paso, 1), CITY_DEPTH - 1);
      dirX = cabeza.dirX;
      dirZ = cabeza.dirZ;
    }

    citizens.push({
      id: i,
      name: `${rng.pick(NOMBRES)} ${apellidoGrupo}`,
      personality: pickPersonality(rng),
      x, z, prevX: x, prevZ: z,
      dirX, dirZ, laneOffset,
      state: 'caminando',
      idleTicks: 0,
      lastCrossing: -1,
      salud: 'sano',
      incubacionTicks: 0,
      animo: 'tranquilo',
      animoTicks: 0,
      dentroDe: -1,
      cdMordida: 0,
      piso: 0,
      pisoObjetivo: 0,
      escaleraTicks: 0,
      familia: familiaId,
      cabezaFamilia: cabezaActual,
      familiares: [],
    });
    grupoRestante--;
  }

  // llenar familiares (dos bucles por índice; nada de Map)
  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    if (c.familia < 0) continue;
    for (let j = 0; j < citizens.length; j++) {
      if (j !== i && citizens[j].familia === c.familia) c.familiares.push(j);
    }
  }
  return citizens;
}
```

**(c)** `panico.ts`, en `updateHumano`:
- Rama TRANQUILA (antes del `updateCitizen`): cohesión del seguidor:

```ts
    if (c.familia >= 0 && c.cabezaFamilia !== c.id) {
      const cabeza = world.citizens[c.cabezaFamilia];
      if (cabeza.salud !== 'eliminado' && cabeza.dentroDe < 0) {
        const dxf = cabeza.x - c.x;
        const dzf = cabeza.z - c.z;
        const df = Math.sqrt(dxf * dxf + dzf * dzf);
        if (df > 3) {
          c.prevX = c.x;
          c.prevZ = c.z;
          c.dirX = dxf / df;
          c.dirZ = dzf / df;
          moveWithSlide(world.city, c, c.x + c.dirX * CITIZENS.walkSpeed * DT, c.z + c.dirZ * CITIZENS.walkSpeed * DT);
          return;
        }
      }
    }
```

(importar `CITIZENS` de config).
- Rama PÁNICO, tras calcular la dirección de huida y ANTES del `moveWithSlide`:

```ts
    if (c.personality === 'protector' && c.familia >= 0 && (n === 0 || mejorD2 > 36)) {
      let f: Citizen | null = null;
      let mdf = Infinity;
      for (const j of c.familiares) {
        const o = world.citizens[j];
        if (o.salud === 'eliminado' || o.salud === 'zombi' || o.dentroDe >= 0) continue;
        const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
        if (d2 < mdf) { mdf = d2; f = o; }
      }
      if (f && mdf > 16 && mdf < 900) {
        const dxf = f.x - c.x;
        const dzf = f.z - c.z;
        const df = Math.sqrt(dxf * dxf + dzf * dzf);
        c.dirX = dxf / df;
        c.dirZ = dzf / df; // vuelve por los suyos
      }
    }
```

- [x] **Step 4: Verificar** — `npm test` verde; tsc limpio.
- [x] **Step 5: Commit**

```bash
git add src/sim tests/familias.test.ts
git commit -m "feat: familias que nacen, caminan y se buscan juntas; el protector vuelve por los suyos"
```

---

### Task 8: El líder — calma y organiza

**Files:**
- Modify: `src/sim/panico.ts`, `src/sim/config.ts`
- Test: `tests/lider.test.ts`

**Interfaces:**
- `config.ts` suma: `export const LIDER = { radio: 8, factorCalma: 0.5, divisorCalmarse: 4, panicosParaGuiar: 2, alcanceGuia: 50 } as const;`
- En `updateHumano`, el bucle de vecinos existente además detecta: `liderCerca` (vecino `lider`, tranquilo, no zombi, a ≤`LIDER.radio`) y `panicosCerca` (humanos en pánico a ≤`LIDER.radio`). Efectos:
  - Contagio de pánico por grito: probabilidad × `factorCalma` si `liderCerca`.
  - Calmarse: umbral efectivo `ticksCalmarse / divisorCalmarse` si `liderCerca`.
  - **Pánico sin zombis a la vista y líder cerca:** la dirección de huida pasa a ser "hacia el líder" (lo siguen).
  - **El líder guía:** si es `lider`, tranquilo, fuera, con `panicosCerca >= panicosParaGuiar`: busca la puerta utilizable más cercana (jugable, sin brecha, con cupo, a ≤`alcanceGuia`); avanza hacia ella con `moveWithSlide` a `walkSpeed` e intenta `intentarRefugio` (el líder entra aunque esté tranquilo — es el único con permiso); si no hay puerta, sigue normal.

- [x] **Step 1: Test que falla — `tests/lider.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { PANICO } from '../src/sim/config';

function escena(seed: string, conLider: boolean): { w: World; asustado: World['citizens'][0] } {
  const w = new World(seed, 3);
  const [asustado, lider, otro] = w.citizens;
  asustado.x = 50; asustado.z = 4; asustado.prevX = 50; asustado.prevZ = 4;
  asustado.animo = 'panico';
  asustado.animoTicks = 0;
  asustado.personality = 'cobarde';
  lider.x = 53; lider.z = 4; lider.prevX = 53; lider.prevZ = 4;
  lider.personality = conLider ? 'lider' : 'cobarde';
  otro.x = 200; otro.z = 200; otro.prevX = 200; otro.prevZ = 200;
  return { w, asustado };
}

describe('líder', () => {
  it('con un líder cerca, el pánico se pasa antes', () => {
    const sin = escena('lider-1', false);
    const con = escena('lider-1', true);
    let ticksSin = -1;
    let ticksCon = -1;
    for (let t = 0; t < PANICO.ticksCalmarse + 60; t++) {
      sin.w.tick();
      con.w.tick();
      if (ticksSin < 0 && sin.asustado.animo === 'tranquilo') ticksSin = t;
      if (ticksCon < 0 && con.asustado.animo === 'tranquilo') ticksCon = t;
    }
    expect(ticksCon).toBeGreaterThanOrEqual(0);
    expect(ticksSin < 0 || ticksCon < ticksSin).toBe(true);
  });

  it('los asustados sin zombis a la vista siguen al líder', () => {
    const { w, asustado } = escena('lider-2', true);
    const lider = w.citizens[1];
    const d0 = Math.abs(asustado.x - lider.x);
    w.tick();
    const d1 = Math.sqrt((asustado.x - lider.x) ** 2 + (asustado.z - lider.z) ** 2);
    expect(d1).toBeLessThanOrEqual(d0 + 0.01); // no se aleja del líder
  });

  it('gemelos deterministas con líderes', () => {
    const a = new World('lider-3', 300);
    const b = new World('lider-3', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [x] **Step 2: Verificar que falla.**
- [x] **Step 3: Implementar** en `panico.ts`: extender el bucle de vecinos (donde ya filtra zombis, añadir rama `else` que detecte líder y pánicos con salud/dentro válidos); aplicar el factor a la probabilidad de contagio (`PROB_PANICO_POR_GRITO[c.personality] * (liderCerca ? LIDER.factorCalma : 1)`); el umbral efectivo de calma (`const umbralCalma = liderCerca ? PANICO.ticksCalmarse / LIDER.divisorCalmarse : PANICO.ticksCalmarse;`); en pánico con `n === 0` y `liderCerca`, fijar dir hacia el líder detectado (guardar su referencia en el bucle); y el bloque de guía del líder al inicio de la rama tranquila (antes de la cohesión familiar) con búsqueda lineal de puertas sobre `world.city.buildings` (orden de índice, determinista). Importar `LIDER` e `intentarRefugio`.
- [x] **Step 4: Verificar** — `npm test` verde; tsc limpio.
- [x] **Step 5: Commit**

```bash
git add src/sim tests/lider.test.ts
git commit -m "feat: el lider calma el panico cercano y guia a la gente al refugio"
```

---

### Task 9: Memoria colectiva — la ciudad aprende dónde se muere

**Files:**
- Modify: `src/sim/config.ts` (`PELIGRO`), `src/sim/world.ts` (`peligro[]`, `registrarPeligro`, `peligroEn`, decaimiento), `src/sim/citizens.ts` (giro en cruces evita el peligro), `src/sim/infeccion.ts` + `src/sim/combate.ts` + `src/sim/asedio.ts` (registran muertes/brechas)
- Test: `tests/memoria.test.ts`

**Interfaces:**
- `config.ts`: `export const PELIGRO = { celda: 16, porMuerte: 30, maximo: 250, decaimientoCadaTicks: 300 } as const;`
- `world.ts`: `readonly peligro: number[]` (rejilla gruesa `ceil(W/celda) × ceil(D/celda)`); `registrarPeligro(x: number, z: number): void` (suma `porMuerte`, tope `maximo`); `peligroEn(x: number, z: number): number` (0 fuera del mapa); en `tick()`, cada `decaimientoCadaTicks` ticks: `v = Math.floor((v * 9) / 10)` para cada celda (entero, portable). Campo `private readonly peligroFn = (x: number, z: number): number => this.peligroEn(x, z);` que se pasa a `updateCitizen`.
- Los tres registradores llaman `world.registrarPeligro(x, z)` justo donde ya empujan su splat (transformación, combate, brecha).
- `citizens.ts`: `updateCitizen(c, rng, factorVelocidad = 1, peligroEn?: (x: number, z: number) => number)` — en la decisión de cruce, ANTES del giro aleatorio: si `peligroEn` existe, evalúa el peligro una manzana adelante para [seguir, girar-A, girar-B]; si alguna alternativa es al menos 20 puntos más segura que seguir, gira hacia la más segura (sin consumir el draw del sentido aleatorio); si no, la lógica original intacta (mismos draws). El draw de `chance(CRUCE_GIRO)` se consume SIEMPRE como hasta ahora (estabilidad de conteo).

- [x] **Step 1: Test que falla — `tests/memoria.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { PELIGRO } from '../src/sim/config';

describe('memoria colectiva de peligro', () => {
  it('registra, acumula con tope y decae', () => {
    const w = new World('memoria-1', 1);
    w.registrarPeligro(50, 50);
    expect(w.peligroEn(50, 50)).toBe(PELIGRO.porMuerte);
    for (let k = 0; k < 20; k++) w.registrarPeligro(50, 50);
    expect(w.peligroEn(50, 50)).toBe(PELIGRO.maximo);
    for (let t = 0; t < PELIGRO.decaimientoCadaTicks + 2; t++) w.tick();
    expect(w.peligroEn(50, 50)).toBeLessThan(PELIGRO.maximo);
  });

  it('las transformaciones dejan huella de peligro', () => {
    const w = new World('memoria-2', 300);
    for (let t = 0; t < 40 * 30; t++) w.tick();
    const algunPeligro = w.peligro.some((v) => v > 0);
    expect(algunPeligro).toBe(true);
  });

  it('en el cruce, el caminante evita la manzana marcada', () => {
    const w = new World('memoria-3', 1);
    const c = w.citizens[0];
    // caminante vertical acercándose a un cruce, con peligro máximo al frente
    c.x = 4; c.z = 40; c.prevX = 4; c.prevZ = 40;
    c.dirX = 0; c.dirZ = 1;
    c.laneOffset = 0;
    c.lastCrossing = -1;
    c.state = 'caminando';
    for (let k = 0; k < 10; k++) w.registrarPeligro(4, 40 + 44);
    let giro = false;
    for (let t = 0; t < 10 * 30; t++) {
      w.tick();
      if (c.dirZ === 0) { giro = true; break; }
    }
    expect(giro).toBe(true); // en algún cruce dejó de ir al frente
  });

  it('gemelos deterministas con memoria', () => {
    const a = new World('memoria-4', 300);
    const b = new World('memoria-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [x] **Step 2: Verificar que falla.**

- [x] **Step 3: Implementar**

**(a)** `world.ts`:

```ts
  readonly peligro: number[];
  private readonly peligroCols = Math.ceil(CITY_WIDTH / PELIGRO.celda);
  private readonly peligroFn = (x: number, z: number): number => this.peligroEn(x, z);
```

(inicializar `this.peligro = new Array(this.peligroCols * Math.ceil(CITY_DEPTH / PELIGRO.celda)).fill(0);` — importar `CITY_WIDTH`, `CITY_DEPTH`, `PELIGRO`).

```ts
  registrarPeligro(x: number, z: number): void {
    const cx = Math.min(this.peligroCols - 1, Math.max(0, Math.floor(x / PELIGRO.celda)));
    const cz = Math.max(0, Math.floor(z / PELIGRO.celda));
    const idx = cz * this.peligroCols + cx;
    if (idx < this.peligro.length) {
      this.peligro[idx] = Math.min(PELIGRO.maximo, this.peligro[idx] + PELIGRO.porMuerte);
    }
  }

  peligroEn(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= CITY_WIDTH || z >= CITY_DEPTH) return PELIGRO.maximo;
    const cx = Math.floor(x / PELIGRO.celda);
    const cz = Math.floor(z / PELIGRO.celda);
    return this.peligro[cz * this.peligroCols + cx] ?? 0;
  }
```

En `tick()`, junto al decaimiento de ruidos: `if (this.tickCount % PELIGRO.decaimientoCadaTicks === 0 && this.tickCount > 0) { for (let k = 0; k < this.peligro.length; k++) this.peligro[k] = Math.floor((this.peligro[k] * 9) / 10); }` — y pasar `this.peligroFn` como 4º argumento en las DOS llamadas a `updateCitizen` (la del dispatch va dentro de `updateHumano`: cambiar su llamada interna para recibirlo — más simple: `updateHumano` llama `updateCitizen(c, world.rngCiudadanos, factor, world.peligroFn)`; hacer `peligroFn` público `readonly`).

**(b)** Registradores: en `actualizarIncubacion` (tras el splat): `world.registrarPeligro(c.x, c.z);` — en `resolverCombates` (tras su splat): `world.registrarPeligro(z.x, z.z);` — en `resolverAsedios` (tras el splat de brecha): `world.registrarPeligro(p.x, p.z);`

**(c)** `citizens.ts` — firma nueva y decisión de cruce:

```ts
export function updateCitizen(
  c: Citizen,
  rng: Rng,
  factorVelocidad = 1,
  peligroEn?: (x: number, z: number) => number
): void {
```

y el bloque del cruce:

```ts
    if (c.lastCrossing !== idCruce) {
      c.lastCrossing = idCruce;
      const quiereGirar = rng.chance(CRUCE_GIRO);
      let giroForzado = 0; // 0 = no; ±1 = sentido forzado por peligro
      if (peligroEn) {
        const pFrente = peligroEn(c.x + c.dirX * CITY_PERIOD, c.z + c.dirZ * CITY_PERIOD);
        // las dos perpendiculares al eje de marcha
        const pA = c.dirZ !== 0 ? peligroEn(c.x - CITY_PERIOD, c.z) : peligroEn(c.x, c.z - CITY_PERIOD);
        const pB = c.dirZ !== 0 ? peligroEn(c.x + CITY_PERIOD, c.z) : peligroEn(c.x, c.z + CITY_PERIOD);
        if (Math.min(pA, pB) + 20 < pFrente) giroForzado = pA <= pB ? -1 : 1;
      }
      if (giroForzado !== 0 || quiereGirar) {
        if (c.dirZ !== 0) {
          c.z = corridorCenter(kz) + c.laneOffset;
          c.dirZ = 0;
          c.dirX = giroForzado !== 0 ? giroForzado : rng.chance(0.5) ? 1 : -1;
        } else {
          c.x = corridorCenter(kx) + c.laneOffset;
          c.dirX = 0;
          c.dirZ = giroForzado !== 0 ? giroForzado : rng.chance(0.5) ? 1 : -1;
        }
      }
    }
```

(El draw de `chance(CRUCE_GIRO)` se consume siempre, como antes; el del sentido solo cuando el giro es aleatorio — conteo dependiente de estado, determinista.)

- [x] **Step 4: Verificar** — `npm test` verde; tsc limpio; portabilidad verde.
- [x] **Step 5: Commit**

```bash
git add src/sim tests/memoria.test.ts
git commit -m "feat: memoria colectiva de zonas de muerte — las multitudes aprenden a evitarlas"
```

---

### Task 10: Recalibración del balance y cierre del Plan 3

**Files:**
- Modify: `tests/balance.test.ts` (quitar el `.skip`), `src/sim/config.ts` (solo si el ajuste lo exige), `CLAUDE.md` (lecciones), este plan (checkboxes)

Interiores + asedio físico + familias + líder + memoria mueven el balance con seguridad. Esta tarea lo recalibra con la metodología documentada en `docs/superpowers/reports/2026-07-06-balance-brote.md`.

- [x] **Step 1:** Quitar `describe.skip` → `describe` en `tests/balance.test.ts` (las tres condiciones y umbrales NO se tocan: ≥60% a 1:30, ≤47% a 8:00, colapso <15:00).
- [x] **Step 2:** `npx vitest run tests/balance.test.ts` con la config actual. Si pasa: no tocar nada. Si falla: ajustar UN valor a la vez, documentando (valor → vivos@90 / vivos@480 / colapso), con estas perillas: `ASEDIO.resistencia` (50–600, recordar el filo de navaja), `ASEDIO.radioPuerta` (3–6), `ZOMBIS.velocidad` (3.0–3.8), `ZOMBIS.radioVision` (15–25), `PANICO.velocidadHuida` (2.5–3.1), `INTERIOR_VISION` (8–16), `REFUGIO.capacidad` (20–60), `LIDER.factorCalma` (0.3–0.8). Si tras ~15 intentos razonados no se alcanza: BLOCKED con la tabla (el orquestador decide) — nunca fabricar el resultado.
- [x] **Step 3: Verificación completa** — `npm test` TODO verde (incluido balance); `npx tsc --noEmit`; `tests/portabilidad.test.ts` verde (es parte de la suite); navegador ~2 min: brote completo visible, cutaway funcionando, asedio a puertas visible, FPS estable, consola limpia, `?seed=alfa` reproducible entre recargas.
- [x] **Step 4: Cierre** — Lección(es) condensada(s) en CLAUDE.md (máx. 2 líneas c/u; si la lista pasa de ~10, fusionar las viejas). Marcar TODOS los checkboxes de este plan (usar Edit o `sed` de Git Bash — PowerShell `Set-Content` corrompe UTF-8). Commit `chore: refugio y sociedad verificados (Plan 3 completo)` y `git push -u origin fase-3-refugio-sociedad`. Avisar que el Plan 3 está listo para la revisión final de rama.

---

### Task 10b (adenda): El virus pelea de vuelta — palancas de mecánica autorizadas

**Contexto:** la Task 10 quedó BLOCKED con datos (reporte `docs/superpowers/reports/2026-07-09-recalibracion-plan3-task10.md`): las 8 perillas de comportamiento no bajan vivos@8:00 de ~70% porque las mecánicas de refugio del Plan 3 hacen su trabajo — la ciudad se salva sola. Decisión de diseño del orquestador: la letalidad estructural del virus es ahora palanca legítima. Hipótesis principal (probar PRIMERO): la incubación corta (5–15 s, herencia del balance del Plan 2 SIN interiores) hace que los infectados se transformen ANTES de llegar a los refugios, dejándolos limpios; una incubación más larga mete bombas de tiempo dentro (el mordido que se esconde con los demás — Guerra Mundial Z puro).

**Palancas nuevas autorizadas (en este orden de preferencia, UNA por intento):**

1. `INFECCION.incubacionMinTicks` / `incubacionMaxTicks` — rango total 5–30 s (probar primero 10–20 s, luego 15–25 s, luego 15–30 s).
2. `INFECCION.radioMordida` (1.0–1.6).
3. `ZOMBIS.enfriamientoMordidaTicks` (6–18).
4. `ASEDIO.presionPorZombi` (1–3).

Las 8 perillas de la Task 10 siguen disponibles. Tras documentar los intentos de una palanca, se permiten hasta 5 intentos de COMBINACIÓN razonada (máx. ~20 corridas nuevas en total, documentadas igual: valor → vivos@90 / vivos@480 / colapso por semilla).

**Regla de cierre determinista (para no volver a BLOCKED):**

- Si ambas semillas cumplen el gate actual (≤47% @ 8:00): cerrar con esos valores.
- Si el MEJOR resultado honesto deja ambas semillas con vivos@480 ≤ 55% Y colapso total < 12:00 en ambas: AUTORIZADO ajustar el gate a esos umbrales (condición 2 → 0.55; condición 3 → `12 * 60 * TICK_RATE`), actualizar la línea de testing del spec §6 igual que hizo el Plan 2, y cerrar documentando el porqué (la sociedad del Plan 3 salva gente POR DISEÑO; el jugador sigue teniendo que superar a una ciudad que pierde la mayoría… un poco más tarde).
- Si ni eso se alcanza: BLOCKED con la tabla (última palabra del orquestador).

**Al cerrar:** todo lo de la Task 10 original (borrar `tests/medicion.tmp.test.ts`, housekeeping de `ASEDIO.radio` muerto y comentario de `peligroEn`, lecciones condensadas en CLAUDE.md, checkboxes, commit `chore: refugio y sociedad verificados (Plan 3 completo)`, push). Commitear también el reporte de recalibración BLOCKED (ya está en docs/) y añadirle una sección final con el desenlace.
