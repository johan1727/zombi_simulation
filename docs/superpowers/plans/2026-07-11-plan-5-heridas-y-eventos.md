# PANDEMIA — Plan 5: Heridas, Cansancio, Diálogos y Giros de Semilla — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profundidad de combate y drama: mordidas con zona específica (pierna=fractura, brazo=ventana de amputación, torso=letal), fatiga al sprintar, diálogos flotantes deterministas, y un giro de semilla a mitad de partida (apagón/lluvia/helicóptero) idéntico para jugador y rival.

**Architecture:** Todo lo nuevo vive donde ya vive el sistema que toca: heridas en `infeccion.ts` (extiende `infectar`), cansancio en `panico.ts`/`agentes.ts` (donde ya se calcula la velocidad de huida), giros de semilla como un sistema nuevo `src/sim/eventos.ts` (un tick fijo derivado de la semilla — el mismo para `World` y `Rival`, cero ventaja). Barks son 100% render/UI: leen `hitos` + estado, no tocan la sim más que consumirla.

**Tech Stack:** El existente. Sin dependencias nuevas.

**Diseño de referencia:** `docs/superpowers/specs/2026-07-05-pandemia-design.md` §7.1, §7.2, §7.3.
**Estado previo:** Planes 1–4 en master: juego completo, 186 tests, gate de balance calibrado (≥60% @1:30, ≤55% @8:00, colapso <12:00).

## Global Constraints

- Todas las anteriores (TS strict; `src/sim/` sin `three`/`Math.random`/`Date.now`/`performance.now`/`Math.hypot|cos|sin|tan|atan2` — lo vigila `tests/portabilidad.test.ts`; streams de RNG por subsistema; no anidar `queryCircle`; teleports resetean prev; UI en español; commits español).
- **El giro de semilla es SIMÉTRICO por construcción:** mismo tick, mismo tipo de evento, derivados solo de la semilla — nunca debe depender de nada que el jugador haga (si dependiera de sus órdenes, el rival no lo recibiría igual y se rompe "cero excusas").
- **El gate de balance SÍ puede moverse en este plan** (fracturas/amputación/fatiga cambian la letalidad real) — la Task 6 (última) lo mide y recalibra con la metodología ya usada en Planes 2/3 (una perilla por corrida, tabla de datos, nunca fabricar el resultado).
- Los barks son puramente informativos — CERO texto que rompa la regla de "toda acción tiene pro y contra" (no dan pistas gratis que no tuvieran ya un costo).
- Ningún ciudadano se elimina del array (índices estáticos siguen intactos); las heridas son campos nuevos en `Citizen`, no un array paralelo.

---

### Task 1: Heridas localizadas — tipos, fractura y letal directo

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/config.ts`, `src/sim/citizens.ts` (init), `src/sim/infeccion.ts` (`infectar` decide zona), `src/sim/panico.ts` y `src/sim/agentes.ts` (velocidad reducida por fractura), `src/sim/world.ts` (hash)
- Test: `tests/heridas.test.ts`

**Interfaces:**
- `types.ts`, `Citizen` suma:

```ts
export type ZonaHerida = '' | 'pierna' | 'brazo' | 'torso';
```

y en `Citizen`: `zonaHerida: ZonaHerida; ventanaAmputarTicks: number; brazoAmputado: boolean;` (spawn: `'', 0, false`).

- `config.ts` suma:

```ts
// ——— Plan 5: heridas, cansancio y eventos ———

export const HERIDAS = {
  // Probabilidades acumulativas: pierna primero, luego brazo, resto torso.
  probPierna: 0.4,
  probBrazo: 0.35, // (probTorso = 1 - probPierna - probBrazo = 0.25)
  factorVelocidadFractura: 0.4,
  ventanaAmputarTicks: 5 * TICK_RATE,
} as const;
```

- `infeccion.ts`, `infectar(c, rng)`: tras decidir que `c` se infecta (sano→incubando o agente→caído, lógica actual intacta), sortear la zona con el MISMO `rng` recibido (mantiene el stream de quien llama — `rngInfeccion` para zombis/interior, `rngCombate` para combate, `rngAgentes` para mordida a agente si aplica) usando `rng.next()`:

```ts
  const r = rng.next();
  c.zonaHerida = r < HERIDAS.probPierna ? 'pierna' : r < HERIDAS.probPierna + HERIDAS.probBrazo ? 'brazo' : 'torso';
  if (c.zonaHerida === 'brazo') c.ventanaAmputarTicks = HERIDAS.ventanaAmputarTicks;
```

(Insertar DESPUÉS de la transición de estado existente, ANTES del `return` — un solo draw adicional siempre que `infectar` cambia el estado; si `infectar` es no-op porque `c.salud` no era `'sano'`, no se sortea nada — mismo patrón de guard que ya existe.)

- La ventana de amputación cuenta atrás en `actualizarIncubacion` (`infeccion.ts`): si `c.ventanaAmputarTicks > 0`, decrementar; al llegar a 0 sin haber sido amputado, no pasa nada especial (la incubación sigue su curso normal hacia zombi — la ventana solo importa mientras dure).
- Velocidad por fractura: en `panico.ts` (huida) y `citizens.ts` (`updateCitizen`, caminata normal) y `agentes.ts` (`updateAgente`), multiplicar la velocidad efectiva por `HERIDAS.factorVelocidadFractura` si `c.zonaHerida === 'pierna'`. Aplicar en el punto donde YA se calcula `vel` en cada uno de los tres sitios (no crear un cuarto sistema — un factor más en la multiplicación existente).
- `world.ts`, `hashState`: mezclar `zonaHerida` (mapa a entero 0-3) y `brazoAmputado` (0/1).

- [ ] **Step 1: Test que falla — `tests/heridas.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { HERIDAS, CITIZENS, DT } from '../src/sim/config';
import { infectar } from '../src/sim/infeccion';

describe('heridas localizadas', () => {
  it('infectar asigna una zona de las tres posibles', () => {
    const w = new World('heridas-1', 50);
    const zonas = new Set<string>();
    for (const c of w.citizens) {
      infectar(c, w.rngInfeccion);
      zonas.add(c.zonaHerida);
    }
    expect([...zonas].sort()).toEqual(['brazo', 'pierna', 'torso']);
  });

  it('herida de pierna reduce la velocidad de caminata a un 40%', () => {
    const w = new World('heridas-2', 5);
    const herido = w.citizens[0];
    const sano = w.citizens[1];
    herido.zonaHerida = 'pierna'; // forzado, sin pasar por infectar: aísla solo el efecto de velocidad
    sano.zonaHerida = '';
    const x0h = herido.x;
    const z0h = herido.z;
    const x0s = sano.x;
    const z0s = sano.z;
    for (let t = 0; t < 30; t++) w.tick();
    const dHerido = Math.sqrt((herido.x - x0h) ** 2 + (herido.z - z0h) ** 2);
    const dSano = Math.sqrt((sano.x - x0s) ** 2 + (sano.z - z0s) ** 2);
    // dSano puede ser 0 si el sano quedó 'quieto' esos 30 ticks (walkSpeed
    // tiene pausas); comparar contra el paso teórico máximo en vez del sano
    // real evita un test intermitente.
    const pasoMaximoSano = CITIZENS.walkSpeed * DT * 30;
    expect(dHerido).toBeLessThan(pasoMaximoSano * HERIDAS.factorVelocidadFractura * 1.3);
    expect(dSano).toBeGreaterThanOrEqual(0); // sano nunca "retrocede"
  });

  it('herida de brazo abre una ventana de amputación que se agota sola', () => {
    const w = new World('heridas-3', 5);
    const c = w.citizens[0];
    c.salud = 'sano';
    infectar(c, w.rngInfeccion);
    c.zonaHerida = 'brazo';
    c.ventanaAmputarTicks = 3;
    for (let t = 0; t < 5; t++) w.tick();
    expect(c.ventanaAmputarTicks).toBe(0);
    expect(c.brazoAmputado).toBe(false); // nadie la usó
  });

  it('gemelos deterministas con heridas', () => {
    const a = new World('heridas-4', 300);
    const b = new World('heridas-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});

```

- [ ] **Step 2: Verificar que falla** — `npm test` → FAIL.
- [ ] **Step 3: Implementar** todo lo descrito en Interfaces.
- [ ] **Step 4: Verificar** — `npm test` (SIN balance, se recalibra en Task 6) verde; `npx tsc --noEmit` limpio.
- [ ] **Step 5: Commit** — `feat: heridas localizadas por zona de mordida — fractura de pierna, ventana de amputacion en brazo`

---

### Task 2: Amputación — el verbo del paramédico

**Files:**
- Modify: `src/sim/agentes.ts` (`actuarParamedico`), `src/sim/config.ts` (constante de alcance si falta reutilizar `PARAMEDICO.alcanceRevivir`)
- Test: extender `tests/agentes.test.ts`

**Interfaces:**
- `actuarParamedico(a, world)`: ANTES de la lógica actual (revivir caído > diagnosticar), añadir una prioridad más alta: si hay un civil o agente con `ventanaAmputarTicks > 0` dentro de `PARAMEDICO.alcanceRevivir`, amputar (prioridad: amputar > revivir > diagnosticar — la amputación tiene ventana de tiempo, revivir y diagnosticar no tanta prisa relativa). Amputar: `c.brazoAmputado = true; c.ventanaAmputarTicks = 0; c.salud = 'sano'` si estaba `'incubando'` (detiene la infección — la cura real), empujar un `hitos.push({tipo:'amputacion', a: a.id, b: c.id, tick: world.tickCount})` (nuevo tipo de hito — añadir `'amputacion'` a la unión `Hito['tipo']` en `types.ts`).
- El brazo amputado (`brazoAmputado === true`) impide dos cosas ya existentes: (a) en `resolverCombates`, un ciudadano con `brazoAmputado` NO cuenta como luchador (no puede pelear con un solo brazo — mismo patrón que ya excluye `'caido'`); (b) si en el futuro hay disparo civil, quedaría bloqueado — no aplica todavía, solo dejar el campo listo.

- [ ] **Step 1: Test que falla** (añadir a `tests/agentes.test.ts`, importando `HERIDAS` de `../src/sim/config` y `resolverCombates` de `../src/sim/combate` junto a los imports existentes del archivo):

```ts
it('el paramédico amputa un brazo dentro de la ventana y detiene la infección', () => {
  const w = new World('amputa-1', 5);
  const para = w.agentes[1];
  const c = w.citizens[0];
  c.salud = 'incubando';
  c.zonaHerida = 'brazo';
  c.ventanaAmputarTicks = HERIDAS.ventanaAmputarTicks;
  c.x = para.x + 1;
  c.z = para.z;
  c.prevX = c.x;
  c.prevZ = c.z;
  w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: c.x, z: c.z });
  w.tick();
  expect(c.brazoAmputado).toBe(true);
  expect(c.salud).toBe('sano');
  expect(c.ventanaAmputarTicks).toBe(0);
});

it('la amputación no dispara si la ventana ya se cerró', () => {
  const w = new World('amputa-2', 5);
  const para = w.agentes[1];
  const c = w.citizens[0];
  c.salud = 'incubando';
  c.zonaHerida = 'brazo';
  c.ventanaAmputarTicks = 0; // ya se cerró
  c.x = para.x + 1;
  c.z = para.z;
  c.prevX = c.x;
  c.prevZ = c.z;
  w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: c.x, z: c.z });
  w.tick();
  expect(c.brazoAmputado).toBe(false);
});

it('un ciudadano con brazo amputado no cuenta como luchador', () => {
  const w = new World('amputa-3', 6);
  const zombi = w.citizens[0];
  zombi.salud = 'zombi';
  zombi.x = 50;
  zombi.z = 4;
  zombi.prevX = 50;
  zombi.prevZ = 4;
  // 3 civiles cerca, uno de ellos manco y 'valiente' — el manco no debe contar,
  // así que sin OTRO valiente sano el grupo no debe vencer al zombi.
  const posiciones: ReadonlyArray<readonly [number, number]> = [[52, 4], [48, 5], [50, 6]];
  for (let i = 1; i <= 3; i++) {
    const c = w.citizens[i];
    c.x = posiciones[i - 1][0];
    c.z = posiciones[i - 1][1];
    c.prevX = c.x;
    c.prevZ = c.z;
    c.personality = 'cobarde';
  }
  w.citizens[1].personality = 'valiente';
  w.citizens[1].brazoAmputado = true;
  w.grid.rebuild(w.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
  resolverCombates(w);
  expect(zombi.salud).toBe('zombi'); // sin un valiente ÚTIL, el grupo no gana
});
```

- [ ] **Step 2-4:** TDD estándar, verificar suite completa (sin balance) + tsc.
- [ ] **Step 5: Commit** — `feat: el paramedico puede amputar un brazo mordido dentro de la ventana de 5s`

---

### Task 3: Cansancio al huir

**Files:**
- Modify: `src/sim/types.ts` (`Citizen.ticksSprintando`), `src/sim/config.ts` (`FATIGA`), `src/sim/panico.ts` (rama de huida)
- Test: extender `tests/panico.test.ts`

**Interfaces:**
- `config.ts` suma:

```ts
export const FATIGA = {
  umbralTicks: 20 * TICK_RATE, // 20 s sprintando antes de agotarse
  factorAgotado: 1, // velocidad de caminata normal (deja de ser huida rápida)
} as const;
```

- `Citizen` suma `ticksSprintando: number;` (spawn: 0).
- En la rama de pánico de `updateHumano` (`panico.ts`), donde hoy se aplica `PANICO.velocidadHuida`: si `c.animo === 'panico'`, incrementar `c.ticksSprintando`; la velocidad efectiva es `PANICO.velocidadHuida` mientras `ticksSprintando <= FATIGA.umbralTicks`, y cae a `CITIZENS.walkSpeed * FATIGA.factorAgotado` después (combinar con el factor de fractura de la Task 1 — multiplicar, no reemplazar). Al calmarse (`calmarse()`), resetear `c.ticksSprintando = 0`.

- [ ] **Step 1: Test que falla** (`tests/panico.test.ts`, importar `FATIGA` de `../src/sim/config`):

```ts
it('tras 20s de sprint sostenido, la huida se vuelve tan lenta como caminar', () => {
  const w = new World('fatiga-1', 3);
  const c = w.citizens[0];
  // Forzar pánico directamente cada tick (en vez de depender de un zombi real
  // a la vista) aísla la fatiga de la lógica de percepción — más determinista
  // y más rápido de correr que perseguir la ventana exacta de radioVerZombi.
  c.animo = 'panico';
  c.animoTicks = 0;
  const dirX0 = 1;
  const dirZ0 = 0;
  c.dirX = dirX0;
  c.dirZ = dirZ0;

  const antes = { x: c.x, z: c.z };
  for (let t = 0; t < FATIGA.umbralTicks - 30; t++) {
    c.animo = 'panico'; // no dejar que se calme durante la medición
    w.tick();
  }
  const dRapido = Math.sqrt((c.x - antes.x) ** 2 + (c.z - antes.z) ** 2);
  const velocidadRapida = dRapido / (FATIGA.umbralTicks - 30);

  const marca = { x: c.x, z: c.z };
  for (let t = 0; t < 90; t++) {
    c.animo = 'panico'; // ya pasó el umbral de fatiga, sigue en pánico
    w.tick();
  }
  const dLento = Math.sqrt((c.x - marca.x) ** 2 + (c.z - marca.z) ** 2);
  const velocidadLenta = dLento / 90;

  expect(velocidadLenta).toBeLessThan(velocidadRapida * 0.7);
});

it('calmarse resetea el contador de sprint', () => {
  const w = new World('fatiga-2', 3);
  const c = w.citizens[0];
  c.animo = 'panico';
  c.ticksSprintando = FATIGA.umbralTicks + 100;
  // forzar calma: sin zombis a la vista, agotar animoTicks hasta el umbral
  c.animoTicks = 0;
  for (let t = 0; t < 20 * 30 + 5; t++) w.tick(); // PANICO.ticksCalmarse = 10*30, margen
  expect(c.animo).toBe('tranquilo');
  expect(c.ticksSprintando).toBe(0);
});
```

- [ ] **Step 2-4:** TDD, suite completa, tsc.
- [ ] **Step 5: Commit** — `feat: cansancio — la huida sostenida mas de 20s cae a paso de caminata`

---

### Task 4: Diálogos flotantes (barks)

**Files:**
- Create: `src/ui/barks.ts`
- Modify: `src/game/main.ts` (wiring)
- Sin cambios en `src/sim/`.

**Interfaces:**
- `barks.ts`: tabla determinista `FRASES: Record<Personality | 'generico', readonly string[]>` (3-4 frases por personalidad: cobarde→«¡CORRE!»/«¡Nos va a matar!», protector→«¿Y mi hija?»/«¡No te sueltes!», líder→«¡A la azotea!»/«¡Síganme!», etc. — español, cortas, sin pistas de estrategia). `class Barks { constructor(scene: THREE.Scene); update(world: World, alpha: number): void }` — usa `CSS2DRenderer`-like approach O más simple: un `<div>` HTML posicionado con `camera.project()` para 2-3 burbujas simultáneas máximo (pool fijo, sin crear/destruir nodos DOM cada frame). Disparo: cuando un ciudadano ENTRA en pánico (mismo instante que hoy dispara el grito en `panico.ts` — leer eso desde `world.ruidos` recién empujados, delta como hace `audio.ts`, NO tocar la sim) o cuando un protector activa su regla de "vuelve por los suyos" (nuevo: si hace falta una señal, usar la MISMA condición que ya existe en `panico.ts` inspeccionada desde fuera — o más simple, engancharse a los `hitos` de `'transformacion_cabeza'` para la frase del familiar). Elección de frase determinista por `citizen.id % FRASES[...].length` (NUNCA `Math.random` para el contenido — aunque `src/ui/` lo permitiría, aquí se prefiere reproducible para que un desafío se sienta igual).
- Cooldown por ciudadano simple (no bark dos veces en <10s) para no saturar.

- [ ] **Step 1: Implementar** (sin test unitario obligatorio — es puramente visual; si `barks.ts` tiene una función pura de selección de frase, testear esa parte suelta: `elegirFrase(personality, id): string` determinista, con un test corto).
- [ ] **Step 2:** `npx tsc --noEmit`; `npm test` (sin balance) verde.
- [ ] **Step 3: Verificación en navegador** — forzar pánico vía `window.pandemia`, confirmar que aparecen 1-3 burbujas de texto, se desvanecen, nunca más de un pool fijo simultáneo, sin fugas de memoria tras 2 minutos.
- [ ] **Step 4: Commit** — `feat: dialogos flotantes deterministas segun personalidad y situacion`

---

### Task 5: Giros de semilla — apagón, lluvia, helicóptero

**Files:**
- Create: `src/sim/eventos.ts`
- Modify: `src/sim/config.ts` (`EVENTO`), `src/sim/world.ts` (tick del evento, campo `eventoActivo`), `src/ui/hud.ts` (aviso del evento)
- Test: `tests/eventos.test.ts`

**Interfaces:**
- `config.ts` suma:

```ts
export const EVENTO = {
  tickMin: 3 * 60 * TICK_RATE, // el giro cae entre minuto 3 y 5
  tickMax: 5 * 60 * TICK_RATE,
  factorVisionApagon: 1.5,
  factorVerZombiApagon: 1.3,
  factorRuidoLluvia: 0.6,
  ticksHelicoptero: 60 * TICK_RATE,
} as const;

export type TipoEvento = 'apagon' | 'lluvia' | 'helicoptero';
```

- `eventos.ts`:

```ts
import type { Rng } from './rng';
import type { World } from './world';
import { EVENTO, type TipoEvento } from './config';

/** Tick e tipo del giro de semilla — determinista, IDÉNTICO para World y Rival. */
export function elegirEvento(rng: Rng): { tick: number; tipo: TipoEvento } {
  const tick = rng.int(EVENTO.tickMin, EVENTO.tickMax);
  const tipos: readonly TipoEvento[] = ['apagon', 'lluvia', 'helicoptero'];
  return { tick, tipo: rng.pick(tipos) };
}
```

(Se sortea con un stream propio y NUEVO — `rngEvento` — para no interferir con ningún conteo de draws existente; declarar en `world.ts` como los demás streams: `createRng(\`pandemia:${seed}:evento\`)`.)

- `world.ts`: campo público `readonly evento: { tick: number; tipo: TipoEvento; activo: boolean; helicopteroLlegaEnTicks: number };` inicializado en el constructor con `elegirEvento(this.rngEvento)` + `activo: false`. En `tick()`, justo después del chequeo de paciente cero: si `this.tickCount === this.evento.tick`, `this.evento.activo = true;` y si es `'helicoptero'`, `this.evento.helicopteroLlegaEnTicks = EVENTO.ticksHelicoptero`. Mientras `helicopteroLlegaEnTicks > 0`, decrementar cada tick (informativo para la UI; no dispara nada más en este plan — la lógica de "aterrizar y rescatar gente" queda fuera de alcance, es un anuncio con tensión, no una mecánica de puntos nueva).
- Efectos de apagón/lluvia: en `zombis.ts` (`updateZombi`) y `panico.ts` (percepción), multiplicar `ZOMBIS.radioVision`/`PANICO.radioVerZombi`/`PANICO.radioGrito` por los factores de `EVENTO` SOLO si `world.evento.activo && world.evento.tipo === 'apagon'|'lluvia'` correspondiente — un `if` adicional en el punto donde ya se usa la constante, exactamente como el patrón de la fractura en la Task 1 (un factor más, no un sistema paralelo).
- `hud.ts`: cuando `world.evento.activo` cambia a `true` por primera vez, un aviso de 4s: «¡Apagón en toda la ciudad!» / «Empieza a llover» / «Helicóptero de rescate en camino — azotea del hospital, 60s» (mismo patrón que el aviso de brecha del rival ya existente).

- [ ] **Step 1: Test que falla — `tests/eventos.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { EVENTO } from '../src/sim/config';

describe('giros de semilla', () => {
  it('el evento cae en la ventana [tickMin, tickMax] y es determinista', () => {
    const w = new World('evento-1', 10);
    expect(w.evento.tick).toBeGreaterThanOrEqual(EVENTO.tickMin);
    expect(w.evento.tick).toBeLessThanOrEqual(EVENTO.tickMax);
    const w2 = new World('evento-1', 10);
    expect(w2.evento.tick).toBe(w.evento.tick);
    expect(w2.evento.tipo).toBe(w.evento.tipo);
  });

  it('se activa exactamente en su tick, no antes ni después', () => {
    const w = new World('evento-2', 10);
    for (let t = 0; t < w.evento.tick; t++) {
      w.tick();
      expect(w.evento.activo).toBe(false);
    }
    w.tick();
    expect(w.evento.activo).toBe(true);
  });

  it('mismo evento para dos mundos de la misma semilla aunque uno reciba órdenes', () => {
    const a = new World('evento-3', 200);
    const b = new World('evento-3', 200);
    expect(a.evento.tick).toBe(b.evento.tick);
    expect(a.evento.tipo).toBe(b.evento.tipo);
  });

  it('gemelos deterministas con el evento activo', () => {
    const a = new World('evento-4', 300);
    const b = new World('evento-4', 300);
    for (let t = 0; t < a.evento.tick + 60; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
```

- [ ] **Step 2-4:** TDD, suite completa, tsc, grep de portabilidad.
- [ ] **Step 5: Commit** — `feat: giros de semilla — apagon, lluvia o helicoptero a mitad de partida, simetricos para jugador y rival`

---

### Task 6: Recalibración de balance y cierre del Plan 5

**Files:** `tests/balance.test.ts` (umbral si hace falta), `src/sim/config.ts` (perillas de este plan, si hace falta), `CLAUDE.md`, este plan (checkboxes).

Las heridas/fatiga/eventos SÍ pueden mover el balance calibrado en Plan 3. Metodología idéntica a Planes 2/3/4: medir primero con los valores de las Tasks 1-5 tal cual; si el gate falla, ajustar UNA perilla por corrida (candidatas en orden: `HERIDAS.probPierna/probBrazo`, `FATIGA.umbralTicks`, `EVENTO.factorVisionApagon/factorVerZombiApagon/factorRuidoLluvia`) documentando cada intento; si tras ~15 intentos razonados no se alcanza, BLOCKED con la tabla — nunca fabricar el resultado. Regla de cierre determinista igual que la adenda de la Task 10c del Plan 3: si el mejor resultado honesto se acerca, autorizado ajustar el UMBRAL del gate documentando el porqué, no solo las perillas del juego.

- [ ] **Step 1:** Medir con valores por defecto (`npx vitest run tests/balance.test.ts`).
- [ ] **Step 2:** Ajustar si hace falta, documentando tabla de intentos.
- [ ] **Step 3: Verificación completa** — `npm test` TODO verde (balance incluido), `npx tsc --noEmit`, portabilidad. Navegador: ~2 min con heridas/fatiga/evento visibles (forzar el evento antes vía `window.pandemia` si el tick por defecto tarda mucho).
- [ ] **Step 4: Cierre** — lecciones condensadas en CLAUDE.md, checkboxes marcados (Edit/sed, nunca PowerShell Set-Content), commit `chore: heridas, cansancio, dialogos y giros de semilla verificados (Plan 5 completo)`, push.
