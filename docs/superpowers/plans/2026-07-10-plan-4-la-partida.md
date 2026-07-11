# PANDEMIA — Plan 4 de 4: La Partida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El prototipo jugable completo: 4 agentes controlables con habilidades y dilemas, posesión en tercera persona, reloj de 8:00, victoria/derrota con Índice de Ciudad, rival fantasma en vivo, pantalla de resultado con historias de ciudadanos, revancha, link de desafío viral, audio mínimo sintetizado y primera partida guiada.

**Architecture:** Los agentes SON ciudadanos (`esAgente: true`) — reutilizan rejilla, mordidas, colisión y render. El jugador NUNCA muta la sim directamente: toda acción entra por una **cola de órdenes** (`world.encolarOrden`) que se procesa al inicio del tick en orden FIFO — misma semilla + mismo log de órdenes = mismo estado (habilita replays y anti-trampas futuros). El estado de partida (reloj, fin, resultado) vive en `src/game/` — la sim no sabe qué es "perder". El rival fantasma es un segundo `World` con la misma semilla corriendo sin órdenes en el mismo bucle.

**Tech Stack:** El existente. Audio con WebAudio API sintetizado (cero assets). Sin backend.

**Diseño de referencia:** `docs/superpowers/specs/2026-07-05-pandemia-design.md` §2, §4, §5.
**Estado previo:** Planes 1–3 en master: simulación social completa, 100 tests, balance calibrado (≥60% @1:30, ≤55% @8:00, colapso <12:00).

## Global Constraints

- Todas las anteriores (TS strict; `src/sim/` sin `three`/`Math.random`/`Date.now`/`performance.now`/`Math.hypot|cos|sin|tan|atan2` — lo vigila `tests/portabilidad.test.ts`; streams de RNG por subsistema; no anidar `queryCircle`; teleports resetean prev; UI en español; commits español).
- **NUEVO — determinismo con órdenes:** las órdenes del jugador entran SOLO por `world.encolarOrden(...)` y se aplican al inicio del tick en orden de llegada. Test obligatorio: misma semilla + mismo guion de órdenes ⇒ mismo hash. Los tests gemelos SIN órdenes siguen intactos.
- **El gate de balance NO se toca** (mide la ciudad sin intervención; los agentes solo actúan por órdenes, así que no lo afectan — la Task 10 lo verifica).
- Los ciudadanos NUNCA se eliminan del array (`familiares`/`cabezaFamilia`/`id` son índices estáticos); los 4 agentes se AÑADEN al final del array.
- Ciudadanos con `dentroDe >= 0` viven en `dentroPorEdificio`; los de fuera en la rejilla. Los agentes poseídos NO entran a edificios en este plan (limitación documentada; Plan 5).
- Regla de mérito del diseño: **toda acción tiene pro y contra** (disparo = ruido; megáfono = manipulación; refuerzo = usos limitados; revivir = acercarse al peligro).

---

### Task 1: Agentes en la simulación — mortales, con órdenes y ventana de rescate

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/citizens.ts` (init campos), `src/sim/infeccion.ts` (mordida a agente ⇒ caído), `src/sim/world.ts` (spawn de agentes, cola de órdenes, dispatch, hash)
- Create: `src/sim/agentes.ts`
- Test: `tests/agentes.test.ts`

**Interfaces:**
- `types.ts`:

```ts
export type Salud = 'sano' | 'incubando' | 'zombi' | 'eliminado' | 'caido';
export type RolAgente = '' | 'policia' | 'paramedico' | 'megafono' | 'obrero';

/** Orden del jugador; entra SOLO por world.encolarOrden. */
export interface OrdenJugador {
  /** Índice del agente en world.citizens. */
  agente: number;
  tipo: 'mover' | 'habilidad' | 'control';
  x: number;
  z: number;
}
```

`Citizen` suma: `esAgente: boolean; rolAgente: RolAgente; ordenX: number; ordenZ: number; /* NaN = sin orden */ caidoTicks: number; cdHabilidad: number; diagnosticadoTicks: number; forzadoX: number; forzadoZ: number; forzadoTicks: number;` (spawn civil: false, '', NaN, NaN, 0, 0, 0, NaN, NaN, 0).

- `config.ts` suma:

```ts
// ——— Plan 4: la partida ———

export const AGENTES = {
  velocidad: 2.2, // m/s — más rápido que civil, más lento que zombi cazando
  radioAutodefensa: 6, // huyen de zombis sin orden activa
  ventanaCaidoTicks: 30 * 30, // 30 s para que el paramédico llegue
  llegadaOrden: 0.6, // m para considerar cumplida una orden de mover
} as const;

export const POLICIA = {
  alcance: 15, // m de disparo desde el agente
  cooldownTicks: 90, // 3 s entre disparos
  radioRuido: 25, // el disparo atrae a TODA la cuadra
} as const;

export const PARAMEDICO = {
  radioDiagnostico: 8,
  marcaTicks: 20 * 30, // los incubando marcados se ven 20 s
  alcanceRevivir: 2.5,
} as const;

export const MEGAFONO = {
  radio: 12, // civiles afectados alrededor DEL AGENTE
  duracionTicks: 10 * 30, // caminan 10 s hacia el punto ordenado
  factorPrisa: 1.3, // caminan a walkSpeed × esto
} as const;

export const OBRERO = {
  refuerzo: 600, // presión extra que aguanta la puerta reforzada
  usos: 3,
  alcancePuerta: 3, // m a la puerta para reforzar
} as const;
```

- `world.ts`:
  - Spawn: tras `spawnCitizens`, añadir 4 agentes al final del array con `crearAgente(rol, x, z, id)` — posiciones deterministas en los 4 cruces centrales: policia en `(corridorCenter(3), corridorCenter(4))`, paramedico en `(corridorCenter(3) + 2, corridorCenter(4))`, megafono en `(corridorCenter(3), corridorCenter(4) + 2)`, obrero en `(corridorCenter(3) + 2, corridorCenter(4) + 2)`. Campos de agente: `esAgente: true`, `rolAgente`, `personality: 'valiente'`, `familia: -1`, resto como civil sano. Getter `get agentes(): Citizen[]` (filtra `esAgente` — solo para conveniencia del game layer, la sim itera por índice).
  - `readonly rngAgentes: Rng` (`pandemia:<seed>:agentes` — reservado; las habilidades de este plan no consumen rng, pero el stream queda declarado).
  - `readonly refuerzoPuerta: number[]` (por edificio, init 0).
  - `private readonly colaOrdenes: OrdenJugador[] = [];` + `encolarOrden(o: OrdenJugador): void` (push) + al INICIO de `tick()` (antes del paciente cero): `for (const o of this.colaOrdenes) aplicarOrden(o, this); this.colaOrdenes.length = 0;`
  - Dispatch del bucle: la rama humana se vuelve `if (c.esAgente) updateAgente(c, this); else updateHumano(c, this);` (ambas seguidas de `actualizarIncubacion` como hoy — los agentes también incuban si su mordida no fue rescatada… ver abajo: los agentes NO incuban, caen).
  - `hashState`: el mapa SALUD suma `caido: 5`; mezclar también `Math.round((c.ordenX || 0) * 10)` NO — las posiciones capturan; mezclar `c.caidoTicks` sí (estado invisible en posición): `mix(c.caidoTicks);`
- `infeccion.ts`, `infectar`: primera línea nueva — `if (c.esAgente) { if (c.salud === 'sano') { c.salud = 'caido'; c.caidoTicks = AGENTES.ventanaCaidoTicks; } return; }` (un agente mordido cae; no incuba).
- `agentes.ts` (create):

```ts
import type { Citizen } from './types';
import type { OrdenJugador } from './types';
import type { World } from './world';
import { AGENTES, DT, MEGAFONO, OBRERO, PARAMEDICO, POLICIA, PANICO, CITY, CITY_PERIOD } from './config';
import { moveWithSlide } from './collision';

/** Aplica una orden encolada (inicio de tick, orden FIFO). */
export function aplicarOrden(o: OrdenJugador, world: World): void {
  const a = world.citizens[o.agente];
  if (!a || !a.esAgente || a.salud !== 'sano') return;
  if (o.tipo === 'mover' || o.tipo === 'control') {
    a.ordenX = o.x;
    a.ordenZ = o.z;
    return;
  }
  // habilidad
  if (a.cdHabilidad > 0) return;
  if (a.rolAgente === 'policia') dispararPolicia(a, o, world);
  else if (a.rolAgente === 'paramedico') actuarParamedico(a, world);
  else if (a.rolAgente === 'megafono') gritarMegafono(a, o, world);
  else if (a.rolAgente === 'obrero') reforzarObrero(a, world);
}

function dispararPolicia(a: Citizen, o: OrdenJugador, world: World): void {
  // el zombi activo más cercano al PUNTO apuntado, a alcance del AGENTE
  let objetivo: Citizen | null = null;
  let mejorD2 = Infinity;
  for (const i of world.grid.queryCircle(o.x, o.z, 6)) {
    const c = world.citizens[i];
    if (c.salud !== 'zombi') continue;
    const dAg = (c.x - a.x) ** 2 + (c.z - a.z) ** 2;
    if (dAg > POLICIA.alcance ** 2) continue;
    const d2 = (c.x - o.x) ** 2 + (c.z - o.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      objetivo = c;
    }
  }
  if (!objetivo) return;
  objetivo.salud = 'eliminado';
  world.splats.push({ x: objetivo.x, z: objetivo.z, tono: world.rngAgentes.next() });
  world.registrarPeligro(objetivo.x, objetivo.z);
  // el disparo se OYE en toda la cuadra: el dilema del policía
  world.ruidos.push({ x: a.x, z: a.z, radio: POLICIA.radioRuido, ticks: PANICO.duracionGritoTicks });
  world.hitos.push({ tick: world.tickCount, tipo: 'disparo', a: a.id, b: objetivo.id });
  a.cdHabilidad = POLICIA.cooldownTicks;
}

function actuarParamedico(a: Citizen, world: World): void {
  // 1) revivir caído adyacente (prioridad); 2) si no, diagnóstico en radio
  let caido: Citizen | null = null;
  let mejorD2 = PARAMEDICO.alcanceRevivir ** 2;
  for (const c of world.citizens) {
    if (c.salud !== 'caido') continue;
    const d2 = (c.x - a.x) ** 2 + (c.z - a.z) ** 2;
    if (d2 <= mejorD2) {
      mejorD2 = d2;
      caido = c;
    }
  }
  if (caido) {
    caido.salud = 'sano';
    caido.caidoTicks = 0;
    world.hitos.push({ tick: world.tickCount, tipo: 'rescate', a: a.id, b: caido.id });
  } else {
    for (const i of world.grid.queryCircle(a.x, a.z, PARAMEDICO.radioDiagnostico)) {
      const c = world.citizens[i];
      if (c.salud === 'incubando') c.diagnosticadoTicks = PARAMEDICO.marcaTicks;
    }
  }
  a.cdHabilidad = POLICIA.cooldownTicks; // mismo enfriamiento estándar
}

function gritarMegafono(a: Citizen, o: OrdenJugador, world: World): void {
  for (const i of world.grid.queryCircle(a.x, a.z, MEGAFONO.radio)) {
    const c = world.citizens[i];
    if (c.esAgente || c.salud === 'zombi' || c.salud === 'eliminado') continue;
    c.forzadoX = o.x;
    c.forzadoZ = o.z;
    c.forzadoTicks = MEGAFONO.duracionTicks;
  }
  world.ruidos.push({ x: a.x, z: a.z, radio: MEGAFONO.radio, ticks: PANICO.duracionGritoTicks });
  world.hitos.push({ tick: world.tickCount, tipo: 'megafono', a: a.id, b: -1 });
  a.cdHabilidad = POLICIA.cooldownTicks;
}

function reforzarObrero(a: Citizen, world: World): void {
  if (world.usosObrero <= 0) return;
  const bx = Math.floor(a.x / CITY_PERIOD);
  const bz = Math.floor(a.z / CITY_PERIOD);
  const candidatos: ReadonlyArray<readonly [number, number]> = [
    [bx, bz], [bx - 1, bz], [bx, bz - 1], [bx - 1, bz - 1],
  ];
  for (const [ix, iz] of candidatos) {
    if (ix < 0 || iz < 0 || ix >= CITY.blocksX || iz >= CITY.blocksY) continue;
    const b = world.city.buildings[ix * CITY.blocksY + iz];
    if (b.kind !== 'jugable' || world.brecha[b.id]) continue;
    const p = b.puerta!;
    const d2 = (p.x - a.x) ** 2 + (p.z - a.z) ** 2;
    if (d2 <= OBRERO.alcancePuerta ** 2) {
      world.refuerzoPuerta[b.id] += OBRERO.refuerzo;
      world.usosObrero--;
      world.hitos.push({ tick: world.tickCount, tipo: 'refuerzo', a: a.id, b: b.id });
      a.cdHabilidad = POLICIA.cooldownTicks;
      return;
    }
  }
}

/** IA del agente por tick: caído cuenta atrás; orden de mover; autodefensa; quieto. */
export function updateAgente(c: Citizen, world: World): void {
  c.prevX = c.x;
  c.prevZ = c.z;
  if (c.cdHabilidad > 0) c.cdHabilidad--;

  if (c.salud === 'caido') {
    c.caidoTicks--;
    if (c.caidoTicks <= 0) {
      c.salud = 'zombi';
      world.splats.push({ x: c.x, z: c.z, tono: world.rngAgentes.next() });
      world.registrarPeligro(c.x, c.z);
      world.hitos.push({ tick: world.tickCount, tipo: 'caida_agente', a: c.id, b: -1 });
    }
    return;
  }

  if (!Number.isNaN(c.ordenX)) {
    const dx = c.ordenX - c.x;
    const dz = c.ordenZ - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= AGENTES.llegadaOrden) {
      c.ordenX = NaN;
      c.ordenZ = NaN;
    } else {
      c.dirX = dx / d;
      c.dirZ = dz / d;
      moveWithSlide(world.city, c, c.x + c.dirX * AGENTES.velocidad * DT, c.z + c.dirZ * AGENTES.velocidad * DT);
      return;
    }
  }

  // autodefensa: sin orden, se aleja del zombi más cercano
  let zx = 0;
  let zz = 0;
  let visto = false;
  let mejorD2 = AGENTES.radioAutodefensa ** 2;
  for (const i of world.grid.queryCircle(c.x, c.z, AGENTES.radioAutodefensa)) {
    const o = world.citizens[i];
    if (o.salud !== 'zombi') continue;
    const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d2 < mejorD2) {
      mejorD2 = d2;
      zx = o.x;
      zz = o.z;
      visto = true;
    }
  }
  if (visto) {
    const dx = c.x - zx;
    const dz = c.z - zz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.001) {
      c.dirX = dx / d;
      c.dirZ = dz / d;
      moveWithSlide(world.city, c, c.x + c.dirX * AGENTES.velocidad * DT, c.z + c.dirZ * AGENTES.velocidad * DT);
    }
  }
}
```

- `world.ts` suma además: `usosObrero = OBRERO.usos;` (contador público) y `readonly hitos: Hito[] = [];` con:

```ts
/** Evento notable para historias/audio/HUD. El texto lo compone la UI. */
export interface Hito {
  tick: number;
  tipo: 'disparo' | 'rescate' | 'megafono' | 'refuerzo' | 'caida_agente' | 'brecha' | 'transformacion_cabeza';
  a: number; // índice del protagonista
  b: number; // índice/edificio secundario, -1 si no aplica
}
```

(`Hito` vive en `types.ts`; tope: si `hitos.length > 300`, no empujar más salvo tipos de agente.) Hooks: `asedio.ts` empuja `{tipo:'brecha', a:-1, b: b.id}` al romper; `actualizarIncubacion` empuja `{tipo:'transformacion_cabeza', a: c.id, b:-1}` si `c.familia >= 0 && c.cabezaFamilia === c.id`.

- **Megáfono sobre civiles** — en `panico.ts`, `updateHumano`, PRIMERA rama (antes de la percepción):

```ts
  if (c.forzadoTicks > 0) {
    c.forzadoTicks--;
    c.prevX = c.x;
    c.prevZ = c.z;
    const dx = c.forzadoX - c.x;
    const dz = c.forzadoZ - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1) {
      c.dirX = dx / d;
      c.dirZ = dz / d;
      moveWithSlide(world.city, c, c.x + c.dirX * CITIZENS.walkSpeed * MEGAFONO.factorPrisa * DT, c.z + c.dirZ * CITIZENS.walkSpeed * MEGAFONO.factorPrisa * DT);
    }
    return; // el megáfono manda: ni pánico ni familia esta ronda
  }
```

- **Asedio con refuerzo** — en `asedio.ts`, el umbral pasa a `ASEDIO.resistencia + world.refuerzoPuerta[b.id]`.

- [ ] **Step 1: Test que falla — `tests/agentes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { AGENTES, OBRERO, POLICIA } from '../src/sim/config';

describe('agentes', () => {
  it('nacen 4 agentes al final del array, sanos y sin familia', () => {
    const w = new World('agentes-1', 100);
    expect(w.citizens.length).toBe(104);
    const roles = w.citizens.slice(100).map((c) => c.rolAgente);
    expect(roles).toEqual(['policia', 'paramedico', 'megafono', 'obrero']);
    for (const a of w.citizens.slice(100)) {
      expect(a.esAgente).toBe(true);
      expect(a.salud).toBe('sano');
      expect(a.familia).toBe(-1);
    }
  });

  it('obedece órdenes de mover y llega', () => {
    const w = new World('agentes-2', 10);
    const a = w.agentes[0];
    const destinoX = a.x + 10;
    w.encolarOrden({ agente: a.id, tipo: 'mover', x: destinoX, z: a.z });
    for (let t = 0; t < 10 * 30; t++) w.tick();
    expect(Math.abs(a.x - destinoX)).toBeLessThan(1.5);
  });

  it('el policía elimina un zombi a distancia y el disparo mete ruido grande', () => {
    const w = new World('agentes-3', 10);
    const a = w.agentes[0];
    const z = w.citizens[0];
    z.salud = 'zombi';
    z.x = a.x + 8;
    z.z = a.z;
    z.prevX = z.x;
    z.prevZ = z.z;
    w.tick(); // reconstruir rejilla
    w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: z.x, z: z.z });
    w.tick();
    expect(z.salud).toBe('eliminado');
    expect(w.ruidos.some((r) => r.radio === POLICIA.radioRuido)).toBe(true);
    expect(a.cdHabilidad).toBeGreaterThan(0);
  });

  it('agente mordido cae y el paramédico lo revive a tiempo', () => {
    const w = new World('agentes-4', 10);
    const poli = w.agentes[0];
    const para = w.agentes[1];
    const z = w.citizens[0];
    z.salud = 'zombi';
    z.x = poli.x + 0.5;
    z.z = poli.z;
    z.prevX = z.x;
    z.prevZ = z.z;
    for (let t = 0; t < 5 * 30 && poli.salud === 'sano'; t++) w.tick();
    expect(poli.salud).toBe('caido');
    z.salud = 'eliminado'; // despejar
    para.x = poli.x + 1;
    para.z = poli.z;
    w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: poli.x, z: poli.z });
    w.tick();
    expect(poli.salud).toBe('sano');
  });

  it('agente caído sin rescate se transforma al agotar la ventana', () => {
    const w = new World('agentes-5', 5);
    const a = w.agentes[3];
    a.salud = 'caido';
    a.caidoTicks = 3;
    for (let t = 0; t < 5; t++) w.tick();
    expect(a.salud).toBe('zombi');
  });

  it('el obrero refuerza una puerta y gasta un uso', () => {
    const w = new World('agentes-6', 5);
    const a = w.agentes[3];
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    a.x = b.puerta!.x;
    a.z = b.puerta!.z;
    a.prevX = a.x;
    a.prevZ = a.z;
    w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: a.x, z: a.z });
    w.tick();
    expect(w.refuerzoPuerta[b.id]).toBe(OBRERO.refuerzo);
    expect(w.usosObrero).toBe(OBRERO.usos - 1);
  });

  it('el megáfono arrastra civiles al punto ordenado', () => {
    const w = new World('agentes-7', 30);
    const a = w.agentes[2];
    // colocar 5 civiles alrededor del agente
    for (let i = 0; i < 5; i++) {
      const c = w.citizens[i];
      c.x = a.x + (i % 2 === 0 ? 2 : -2);
      c.z = a.z + i * 0.5;
      c.prevX = c.x;
      c.prevZ = c.z;
    }
    w.tick();
    const destinoX = Math.min(a.x + 20, 260);
    w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: destinoX, z: a.z });
    w.tick();
    const forzados = w.citizens.slice(0, 5).filter((c) => c.forzadoTicks > 0).length;
    expect(forzados).toBeGreaterThanOrEqual(3);
    const antes = w.citizens[0].x;
    for (let t = 0; t < 60; t++) w.tick();
    expect(Math.abs(w.citizens[0].x - antes)).toBeGreaterThan(1);
  });

  it('DETERMINISMO CON ÓRDENES: misma semilla + mismo guion = mismo hash', () => {
    const guion = (w: World): void => {
      const a = w.agentes[0];
      if (w.tickCount === 30) w.encolarOrden({ agente: a.id, tipo: 'mover', x: a.x + 15, z: a.z });
      if (w.tickCount === 300) w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: a.x, z: a.z });
      if (w.tickCount === 600) w.encolarOrden({ agente: w.agentes[2].id, tipo: 'habilidad', x: 100, z: 100 });
    };
    const a = new World('guion-1', 200);
    const b = new World('guion-1', 200);
    for (let t = 0; t < 900; t++) {
      guion(a);
      guion(b);
      a.tick();
      b.tick();
    }
    expect(a.hashState()).toBe(b.hashState());
  });

  it('los mundos SIN órdenes no cambian por la existencia de agentes ociosos', () => {
    const a = new World('quieto-1', 200);
    const b = new World('quieto-1', 200);
    for (let t = 0; t < 900; t++) {
      a.tick();
      b.tick();
    }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.
- [ ] **Step 3: Implementar** todo lo descrito en Interfaces (types, config, agentes.ts, world, infeccion, panico, asedio, hitos). OJO compilación: al ampliar `Salud` con `'caido'`, el mapa `COLORES: Record<Salud, number>` de `src/render/citizensView.ts` exige la clave nueva — añadir `caido: 0xffffff` como placeholder (la Task 2 lo estiliza de verdad).
- [ ] **Step 4: Verificar** — `npm test` completo verde (los 100 previos + nuevos; NOTA: los tests previos crean mundos con N civiles y ahora habrá N+4 ciudadanos — cualquier test que asuma `citizens.length === N` o índices exactos cerca del final debe revisarse; ajustar SOLO setup, documentando, como en tareas anteriores). `npx tsc --noEmit` limpio. El gate de balance DEBE seguir verde sin recalibrar (agentes ociosos solo huyen; si lo mueve, investigar — probablemente autodefensa consumiendo... la autodefensa no consume rng, no debería).
- [ ] **Step 5: Commit** — `feat: agentes del jugador — ordenes deterministas, caida y rescate, habilidades con dilema`

---

### Task 2: Selección, órdenes y HUD de agentes (spec en prosa — precedente Task 8 del Plan 3)

**Files:**
- Create: `src/game/controles.ts`, `src/ui/panelAgentes.ts`
- Modify: `src/render/citizensView.ts` (distinguir agentes/estados), `src/game/main.ts`, `index.html` (contenedores/estilos del panel)
- Sin tests unitarios de UI; test de sim NO aplica. Verificación en navegador con checklist.

**Spec:**
- **Render de agentes** (`citizensView.ts`): los agentes se dibujan con color propio por rol (policia `0x4d9bff`, paramedico `0xff5d5d`, megafono `0xffd23e`, obrero `0xff9430`), ligeramente más altos (escala y 1.25). Estado `caido` = cápsula tumbada (escala y 0.35) parpadeando (visible/oculto cada 15 frames con un contador local del view — el parpadeo es render-only). Civiles `incubando` con `diagnosticadoTicks > 0` se tiñen magenta `0xff3ea5` (la marca del paramédico). El agente SELECCIONADO lleva un anillo en el suelo (Mesh torus plano y=0.05, movido cada frame; uno solo, se oculta sin selección).
- **Selección y órdenes** (`controles.ts`): exporta `class Controles { constructor(canvas, camera, world, callbacks); seleccionado: number | -1; modoHabilidad: boolean; update(): void }`. Raycast con `THREE.Raycaster` contra el plano del suelo (y=0) para obtener (x,z) del click. Click IZQUIERDO: si cae a ≤1.5 m de un agente vivo → seleccionarlo; si hay seleccionado y `modoHabilidad` → `world.encolarOrden({tipo:'habilidad', x, z})` y salir del modo; si hay seleccionado → orden de mover. Tecla `1-4` selecciona agente por índice; `Q` o botón activa `modoHabilidad` (cursor cambia — clase CSS en canvas); `Escape` deselecciona. El drag de cámara NO debe disparar órdenes: umbral — si el pointer se movió >6 px entre down y up, es drag, no click.
- **Panel** (`panelAgentes.ts`): barra inferior con 4 tarjetas (una por agente): nombre del rol en español, tecla, estado (●sano/●caído+segundos restantes/●perdido), botón de habilidad con nombre del dilema («Disparar (ruido)», «Diagnosticar/Revivir», «Megáfono (manipula)», «Reforzar puerta (x3)» con usos restantes) y barra de cooldown. Click en tarjeta = seleccionar; click en botón = modo habilidad. Todo en español. Estilos inline/clases en index.html, estética mínima consistente con el HUD actual (fondo `rgba(13,15,20,0.65)`, bordes redondeados).
- **main.ts**: instanciar Controles y PanelAgentes; el bucle llama `controles.update()` y `panel.update(world, seleccionado)`.

**Checklist de verificación (navegador):** seleccionar con click y con 1-4; anillo visible; mover con click al suelo; policía dispara a una horda (zombi revienta en pintura + se OYE... visualmente: ruido atrae zombis); paramédico marca incubandos de magenta; megáfono arrastra multitud al punto; obrero refuerza (usos bajan en el panel); agente mordido cae y parpadea con cuenta atrás; paramédico lo revive; consola limpia; drag de cámara no dispara órdenes.

- [ ] **Step 1: Implementar** per spec. **Step 2:** `npx tsc --noEmit` + `npm test` (sim intacta). **Step 3:** checklist en navegador (programático donde la pestaña oculta lo permita, como T6 del Plan 3; anotar lo pendiente de ojos humanos). **Step 4: Commit** — `feat: modo director — seleccion, ordenes y panel de agentes`

---

### Task 3: Posesión — bajar al suelo (spec en prosa)

**Files:**
- Create: `src/game/posesion.ts`
- Modify: `src/render/cameraRig.ts` (modo tercera persona), `src/game/controles.ts` (doble click activa), `src/game/main.ts`
- Test: solo `npm test` intacto + navegador.

**Spec:**
- Doble click sobre un agente vivo (o tecla `E` con seleccionado) → `posesion.activar(idAgente)`. En posesión: la cámara baja a tercera persona detrás del agente (offset ~6 m atrás, 3.5 m arriba, mirando adelante del agente; el yaw de la cámara SIGUE la dirección de movimiento del agente con suavizado exponencial render-only).
- WASD genera cada tick UNA orden `{tipo:'control', x: agente.x + dirCam*paso, z: ...}` — el movimiento directo TAMBIÉN pasa por la cola (determinismo/replay). `paso = AGENTES.velocidad * DT * 3` (objetivo ~3 ticks adelante, remuestreado cada tick — resultado: control directo fluido). Sin teclas → no se encola nada (el agente se detiene al llegar).
- Click en posesión = habilidad hacia el punto del suelo apuntado (mismo raycast). `Esc` → volver al modo director (cámara vuelve al rig normal apuntando al agente).
- Los agentes poseídos NO entran por puertas (limitación del plan; si el jugador empuja contra una pared, se desliza con `moveWithSlide` como siempre). Si el agente poseído CAE (mordido), la posesión termina sola con un flash rojo breve (overlay CSS 300 ms).
- El resto de agentes conserva sus órdenes previas mientras posees (ya es el comportamiento de la cola).

**Checklist:** entrar/salir de posesión; WASD fluido; disparar en posesión; caída expulsa de la posesión; cámara sin saltos raros; `npm test` intacto (la posesión es 100% game layer).

- [ ] **Step 1: Implementar.** **Step 2: Verificar** (tsc, suite, navegador). **Step 3: Commit** — `feat: posesion en tercera persona via cola de ordenes`

---

### Task 4: Reloj, fin de partida e Índice de Ciudad

**Files:**
- Create: `src/game/partida.ts`
- Modify: `src/sim/world.ts` (getter `indiceCiudad`), `src/ui/hud.ts` (reloj cuenta ATRÁS + índice), `src/game/main.ts`
- Test: `tests/indice.test.ts` (sim) + navegador.

**Interfaces (sim):** `world.ts` getter:

```ts
  /** Índice de Ciudad: % vivos (0-100) + 1 punto por refugio jugable sin brecha. */
  get indiceCiudad(): number {
    const total = this.citizens.length;
    const { vivos } = this.stats;
    let intactos = 0;
    for (const b of this.city.buildings) {
      if (b.kind === 'jugable' && !this.brecha[b.id]) intactos++;
    }
    return Math.round((vivos / total) * 100) + intactos;
  }
```

**Spec (game):** `partida.ts` exporta `class Partida { estado: 'jugando' | 'terminada'; readonly duracionTicks = 8 * 60 * 30; motivoFin: 'reloj' | 'colapso' | ''; update(world): void }` — termina cuando `world.tickCount >= duracionTicks` (reloj) o `world.stats.vivos < world.citizens.length * 0.1` (colapso). Al terminar, el bucle DEJA de tickear ambos mundos (el render sigue). HUD: reloj cuenta atrás `M:SS`, en rojo bajo 1:00; muestra `Índice: N`.

**Test `tests/indice.test.ts`:** índice inicial = 100 + nº de jugables; tras forzar una brecha baja 1; tras eliminar mitad de la población ronda 50 + intactos. (3 tests directos manipulando el mundo.)

- [ ] Steps TDD estándar + navegador (reloj visible, fin por reloj lleva a estado terminado). **Commit** — `feat: reloj de partida, indice de ciudad y fin por colapso o tiempo`

---

### Task 5: El rival fantasma y el marcador en vivo

**Files:**
- Create: `src/game/rival.ts`
- Modify: `src/game/main.ts`, `src/ui/hud.ts` (marcador rival + avisos)
- Test: `tests/rival.test.ts` (dos mundos misma semilla, uno con órdenes: curvas divergen; sin órdenes: idénticas) + navegador.

**Spec:** `rival.ts`: `class Rival { readonly world: World; readonly curva: number[]; constructor(seed); tick(): void; get vivosPct(): number }` — un `World` con la misma semilla, SIN órdenes, tickeado en el mismo stepper (un tick de rival por cada tick propio). `curva`: muestra `vivosPct` cada 150 ticks (5 s) — máx 145 muestras. La curva PROPIA se muestrea igual en `partida.ts`. HUD: esquina superior derecha `TÚ 84% · RIVAL 71%` con color según quién va arriba; aviso flotante 3 s cuando el rival sufre una brecha nueva (comparar `world.brecha` del rival entre muestras): «¡Al rival se le cayó un refugio!». Costo: el rival duplica el trabajo de sim (~2× tick) — verificar en navegador que se mantiene fluido; si no, tickear el rival en ráfagas de 2 cada 2 frames (documentar si hace falta).

- [ ] Steps TDD estándar + navegador. **Commit** — `feat: rival fantasma en vivo con marcador y avisos`

---

### Task 6: Pantalla de resultado con historias

**Files:**
- Create: `src/ui/resultado.ts`, `src/ui/historias.ts`
- Modify: `src/game/main.ts`, `index.html` (overlay)
- Test: `tests/historias.test.ts` (composición de textos desde hitos sintéticos) + navegador.

**Spec:**
- `historias.ts` (PURO, testeable): `componerHistorias(world: World, max = 4): string[]` — traduce `world.hitos` + estado final a líneas en español con NOMBRES reales, priorizando drama: brecha con más ocupantes («El refugio de la calle N cayó con 12 personas dentro»), `caida_agente` («El policía Marcos cayó… y nadie llegó a tiempo»), `rescate` («La paramédico Ana revivió a Marcos con la horda encima»), `transformacion_cabeza` con familiares vivos («María buscaba a su familia cuando dejó de ser María»), y si un protector terminó a <5 m de un familiar vivo: («Jorge nunca soltó a su hija»). Determinista: sin rng — ordena por dramatismo fijo (ocupantes desc, luego tick).
- `resultado.ts`: overlay a pantalla completa al terminar: `TÚ N · RIVAL M` grande, veredicto con los DESEMPATES del diseño §2 (ambos colapsan → cayó más tarde; empate de índice → más vivos; exacto → empate), curvas de ambos como polyline SVG inline (2 líneas, ejes mínimos), 3-4 historias, stats (vivos, zombis eliminados por tu policía = hitos disparo, rescates, refuerzos usados), botones: **REVANCHA (misma pandemia)** — recarga con `?seed=igual`, **OTRA PANDEMIA** — recarga sin seed, **COPIAR DESAFÍO** (Task 7). Español, estética del HUD.

- [ ] Steps TDD (historias) + navegador. **Commit** — `feat: pantalla de resultado con historias emergentes y revancha`

---

### Task 7: El link de desafío (el arma viral)

**Files:**
- Create: `src/game/desafio.ts`
- Modify: `src/game/main.ts`, `src/game/rival.ts` (modo curva estática), `src/ui/resultado.ts` (botón copiar + texto), `src/ui/hud.ts` (banner de reto)
- Test: `tests/desafio.test.ts` (codificar → decodificar = identidad; URLs inválidas → null) + navegador.

**Spec:** `desafio.ts` (PURO): `codificarDesafio(d: {seed: string; curva: number[]; indice: number; nombre?: string}): string` → JSON compacto → base64url (reemplazar `+/=`); `decodificarDesafio(s: string): Desafio | null` (try/catch, validar tipos y rangos). URL: `location.origin + location.pathname + '?reto=' + codigo`. Al cargar con `?reto=`: usar `seed` del reto, el rival NO simula — su "curva" es la del reto (interpolada a la muestra actual), banner superior: «RETO: supera el N% de <nombre>». En el resultado, comparar contra el índice del reto. Botón COPIAR DESAFÍO: `navigator.clipboard.writeText` con mensaje «Sobreviví M:SS con Índice N. Misma pandemia, supérame: <url>» + feedback «¡Copiado!». La curva propia va truncada/muestreada para que la URL quede <2000 chars (muestras cada 10 s, enteros 0-100).

- [ ] Steps TDD (codec) + navegador (flujo completo: jugar → copiar → abrir el link en otra pestaña → banner + rival estático). **Commit** — `feat: link de desafio asincrono — misma pandemia, superame`

---

### Task 8: Audio mínimo sintetizado (la deuda del ruido)

**Files:**
- Create: `src/ui/audio.ts`
- Modify: `src/game/main.ts`, `src/ui/hud.ts` (botón 🔊/🔇)
- Sin tests unitarios (WebAudio); navegador.

**Spec:** `audio.ts`: `class Audio { constructor(); habilitado: boolean; alternar(): void; update(world: World): void }` — WebAudio sintetizado, CERO assets: consume los DELTAS de `world.hitos` y `world.ruidos` desde el último frame (guarda índices consumidos). Sonidos (osciladores + envolventes cortas, volumen bajo): disparo (square 180→60 Hz, 80 ms), grito/pánico (saw 600→900 Hz, 120 ms, prob. de sonar 1/3 para no saturar — Math.random PERMITIDO aquí: es render/UI, no sim), brecha (ruido blanco filtrado grave, 400 ms), transformación (triangle 200→80 Hz), rescate (dos notas ascendentes), fin de partida (acorde mayor si ganas / menor si pierdes). AudioContext se crea en el primer gesto del usuario (requisito de los navegadores). Botón en HUD y tecla `M`. Respetar volumen maestro 0.15.

- [x] Implementar + checklist navegador (cada evento suena; toggle funciona; nada suena antes del primer click). **Commit** — `feat: audio minimo sintetizado — el ruido por fin se oye`

---

### Task 9: Primera partida guiada

**Files:**
- Create: `src/ui/tutorial.ts`
- Modify: `src/game/main.ts`
- Sin tests unitarios; navegador.

**Spec:** `tutorial.ts`: si `localStorage['pandemia-tutorial'] !== 'visto'`, mostrar tips de UNA línea (toast inferior centrado, 6 s o hasta que la condición siguiente se cumpla), disparados por estado real del mundo, en este orden: (1) al cargar: «Arrastra para mover la cámara · rueda para zoom»; (2) tick 150: «El paciente cero anda suelto. Encuéntralo antes de que estalle»; (3) primera transformación: «¡Empezó! Haz click en tu POLICÍA (tecla 1) y llévalo al brote»; (4) primer uso de habilidad propio: «Todo tiene un precio: el disparo atrae a la horda»; (5) primer pánico masivo (>30 en pánico): «El del MEGÁFONO (3) puede guiar multitudes… a donde tú quieras»; (6) tick 4800: «El OBRERO (4) refuerza puertas. El hospital de tu rival ya cayó, ¿el tuyo?». Al terminar la partida: `localStorage['pandemia-tutorial'] = 'visto'`. Sin pantallas de texto, sin pausas.

- [ ] Implementar + navegador (borrar la clave y verificar la secuencia). **Commit** — `feat: primera partida guiada con tips contextuales`

---

### Task 10: Verificación final del Plan 4

**Files:** solo verificación y cierre (fixes triviales si algo falla).

- [ ] **Suite completa** (`npm test`) TODO verde — incluidos determinismo gemelo, determinismo CON guion de órdenes, portabilidad y el gate de balance SIN recalibrar (los agentes ociosos no deben moverlo; si lo movió, investigar la fuga — probablemente algo consume rng o los agentes actúan sin órdenes — y corregir, NUNCA recalibrar en esta task).
- [ ] `npx tsc --noEmit`; grep de prohibiciones (la suite ya lo hace).
- [ ] **Partida completa en navegador** (programático + lo que la pestaña permita): jugar 8 minutos con órdenes reales, ganar o perder contra el fantasma, ver el resultado con historias, copiar el desafío, abrirlo, ver el banner. FPS estable con DOS mundos corriendo.
- [ ] Lecciones condensadas en CLAUDE.md (máx 2 líneas c/u; podar si pasa de ~10). Checkboxes del plan (Edit/sed de Git Bash). Commit `chore: la partida completa verificada (Plan 4 completo)` y push.
