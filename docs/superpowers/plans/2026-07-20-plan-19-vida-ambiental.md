# PANDEMIA — Plan 19: Vida ambiental (autos obstáculo/alarma, ciudadanos dentro de casas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. A DIFERENCIA de los Planes 12-18 (render/UI puro), este plan SÍ toca `src/sim/` en las tres tasks — TDD obligatorio, y `npm test` COMPLETO (con `tests/balance.test.ts`, `tests/determinism.test.ts`, `tests/portabilidad.test.ts`) antes de cada commit, no solo el subconjunto rápido. Cambiar colisión/spawn puede desplazar el balance del brote — si el gate se mueve, seguir el protocolo ya establecido (Planes 3/5): recalibrar con transparencia, no perseguir el número viejo.

## Meta

Dos piezas del diseño original nunca implementadas ("Vida ambiental",
feedback 2026-07-09): autos estacionados que hoy son 100% decorativos
(sin colisión, sin alarma), y todos los ciudadanos arrancando en la
calle (ninguno empieza dentro de su casa).

**Hallazgo clave (investigación de código real):** las posiciones de
autos (`posicionesAutos(city)`, `src/render/carsView.ts`) son
DETERMINISTAS (mismo algoritmo que "elegirModelo" — sin RNG, derivadas
del índice de cuadra) pero viven SOLO en el render, reconstruyendo `bx`/
`bz` reproduciendo el bucle de generación de ciudad. Para que la sim
pueda tratarlos como obstáculo real, sus posiciones deben vivir en
`CityLayout` (`src/sim/cityGen.ts`), calculadas UNA vez ahí, y
`carsView.ts` pasa a solo LEERLAS (mismo patrón sim/render que todo lo
demás del proyecto). `moveWithSlide(city, c, nx, nz)` ya recibe el
`CityLayout` completo — agregarle un chequeo de autos NO requiere
cambiar su firma, solo qué mira adentro.

## Task 1: Mover posiciones de autos a `CityLayout`, colisión real

**Files:**
- Modify: `src/sim/cityGen.ts` (nuevo campo `autos` en `CityLayout`, cálculo determinista)
- Modify: `src/sim/collision.ts` (`moveWithSlide` también esquiva autos)
- Modify: `src/render/carsView.ts` (lee `city.autos` en vez de recalcular)
- Test: `tests/cityGen.test.ts` (o el que ya cubra generación de ciudad), `tests/collision.test.ts` (crear si no existe)

**Interfaces:**

`cityGen.ts` — mover `AutoColocado`/`posicionesAutos`/`autosPorCuadra`/
`elegirAuto` (hoy en `carsView.ts`) a este archivo (son puramente
deterministas, cero dependencia de `three` — ya cumplen la regla de
`src/sim/`), y calcular `autos` una vez al generar la ciudad:
```ts
export interface CityLayout {
  // ...campos existentes...
  readonly autos: ReadonlyArray<{ x: number; z: number }>; // sin `nombre` aquí — eso es puramente visual, se re-deriva en carsView.ts por índice si hace falta
}
```
`carsView.ts` pasa a leer `city.autos` directamente (sin recalcular
`bx`/`bz` ni reproducir el bucle) — `nombre`/`elegirAuto` siguen siendo
solo de render (el color/modelo del auto no le importa a la sim).

`collision.ts` — nuevo radio de colisión por auto (config, junto a
`CITY`):
```ts
export const RADIO_AUTO = 2; // m

function autoObstaculoEn(city: CityLayout, x: number, z: number): boolean {
  for (const auto of city.autos) {
    const dx = x - auto.x;
    const dz = z - auto.z;
    if (dx * dx + dz * dz < RADIO_AUTO * RADIO_AUTO) return true;
  }
  return false;
}

export function moveWithSlide(city: CityLayout, c: { x: number; z: number }, nx: number, nz: number): void {
  const bloqueado = (x: number, z: number): boolean => !!buildingAt(city, x, z) || autoObstaculoEn(city, x, z);
  if (!bloqueado(nx, nz)) {
    c.x = nx;
    c.z = nz;
  } else if (!bloqueado(nx, c.z)) {
    c.x = nx;
  } else if (!bloqueado(c.x, nz)) {
    c.z = nz;
  }
  c.x = Math.min(Math.max(c.x, 1), CITY_WIDTH - 1);
  c.z = Math.min(Math.max(c.z, 1), CITY_DEPTH - 1);
}
```
(Distancias con `dx*dx+dz*dz`, nunca `Math.hypot` — regla de
`tests/portabilidad.test.ts`. El recorrido lineal sobre `city.autos`
por cada llamada a `moveWithSlide` es aceptable dado el número chico de
autos por cuadra [1-2] — si el perfilado en Task 3/cierre muestra costo
real, considerar indexar por cuadra, no antes.)

- [ ] **Step 1: Test que falla** — un ciudadano/zombi no puede atravesar
  la posición de un auto conocido (`moveWithSlide` hacia el centro de un
  auto no lo mueve ahí); un auto no bloquea completamente una calle (debe
  quedar espacio para pasar al lado, dado `OFFSET_BORDE`/el ancho de
  calle real — verificar con los valores reales de `CITY.streetWidth`).
- [ ] **Step 2-3:** TDD estándar; `npm test` COMPLETO (con balance y
  determinism) y `npx tsc --noEmit` en verde. Si `tests/balance.test.ts`
  se mueve, documentar el análisis (¿autos bloqueando calles cambia
  rutas de huida/zombis de forma medible?) antes de recalibrar o de
  concluir que es ruido — mismo protocolo del Plan 5.
- [ ] **Step 4: Commit** — `feat: autos estacionados como obstaculo real de colision (Plan 19)`

---

## Task 2: Autos con alarma (ruido que atrae zombis)

**Files:**
- Modify: `src/sim/world.ts` (o un nuevo `src/sim/autos.ts` si el
  implementador prefiere no sobrecargar `world.ts` — decidir según estilo)
- Test: extender el mismo archivo de tests de Task 1 o uno nuevo

**Interfaces:** Cuando un ZOMBI (atraído por movimiento/ruido, ya
persigue humanos) pasa MUY cerca de un auto (dentro de, digamos,
`RADIO_AUTO + 1`), hay una probabilidad chica por tick de activar su
alarma — ruido fuerte que atrae a MÁS zombis (mismo mecanismo que
`world.ruidos.push(...)`, ya usado por disparos/gritos):

```ts
// config.ts
export const AUTOS = {
  radioActivacion: RADIO_AUTO + 1,
  probabilidadPorTick: 0.005, // ~1 vez cada 6-7s de exposición continua a 30 tps
  radioRuido: 25, // más que un grito normal — es una alarma de auto
  duracionTicks: 90, // 3s de sonido
  enfriamientoTicks: 900, // 30s: la MISMA alarma no vuelve a saltar de inmediato
} as const;
```
Necesita un stream de RNG PROPIO (regla del proyecto — nunca compartir
el stream de quien llama, ver la lección de Plan 5 sobre
`sortearZonaHerida`): `rngAutos` nuevo en `World`, mismo patrón que
`rngEvento`/`rngHeridas`. Y un cooldown POR AUTO (array paralelo a
`city.autos`, `enfriamientoAuto: number[]` en `World`, decrementado cada
tick) para que la misma alarma no salte en bucle.

Dispatch: revisar en `zombis.ts` (donde ya se calcula movimiento/caza de
zombis) si el zombi quedó cerca de algún auto con `enfriamientoAuto[i]
<= 0`; si `rngAutos.chance(AUTOS.probabilidadPorTick)`, dispara
`world.ruidos.push({x: auto.x, z: auto.z, radio: AUTOS.radioRuido, ticks:
AUTOS.duracionTicks})` y fija `enfriamientoAuto[i] = AUTOS.enfriamientoTicks`.

- [ ] **Step 1: Test que falla** — un zombi que pasa cerca de un auto,
  corrido muchos ticks con una semilla fija, dispara la alarma al menos
  una vez (probabilístico — correr suficientes ticks para que sea
  determinísticamente esperable, mismo patrón que otros tests
  probabilísticos del proyecto); el cooldown evita una segunda alarma
  del MISMO auto dentro de `enfriamientoTicks`.
- [ ] **Step 2-3:** TDD estándar; `npm test` COMPLETO y `npx tsc --noEmit`
  en verde. Verificar `tests/determinism.test.ts` explícitamente (nuevo
  stream de RNG es el punto más común de romper determinismo si se
  comparte por error).
- [ ] **Step 4: Commit** — `feat: autos con alarma que atrae zombis (Plan 19)`

---

## Task 3: Ciudadanos que empiezan dentro de sus casas

**Files:**
- Modify: `src/sim/citizens.ts` (spawn inicial)
- Modify: `src/sim/world.ts` (si `ocupantes` se inicializa en el constructor, recalcular contando `dentroDe` tras el spawn — revisar el orden real de construcción)
- Test: `tests/citizens.test.ts` (o el que cubra spawn)

**Interfaces:** Una FRACCIÓN configurable de ciudadanos (por FAMILIA
completa, no individuos sueltos — mantiene el espíritu de "vínculos
familiares" del diseño) arranca con `dentroDe = <id de un edificio
jugable cercano>`, `piso = 0`, en vez de en la calle:

```ts
// config.ts
export const CITIZENS_INDOOR = {
  fraccionFamiliasEnCasa: 0.15, // 15% de las familias empiezan adentro
} as const;
```

En la función de spawn (`citizens.ts`), al decidir la posición de la
CABEZA de familia (antes del bloque ya existente que posiciona a los
demás miembros "pegados" a ella): con `rng.chance(CITIZENS_INDOOR.fraccionFamiliasEnCasa)`
(MISMA `rng` ya recibida por la función — es parte de la misma familia
de decisiones de inicialización, no hace falta un stream nuevo), elegir
un edificio jugable cercano a su posición de calle ya calculada (mismo
patrón de "candidatos por bloque" que `refugio.ts` usa para buscar
puertas — reusar esa lógica de búsqueda si es fácil exportarla, o
replicarla si acoplarla complica más de lo que ahorra) y colocar a TODA
la familia con `dentroDe` de ese edificio, `piso: 0`, posición interior
válida (dentro de los márgenes del edificio, ver `moverInterior` para
los límites reales), en vez de en la calle.

`world.ocupantes[b.id]` debe reflejar estos ocupantes iniciales desde el
tick 0 — revisar dónde se inicializa hoy (probablemente un array de
ceros del tamaño de `city.buildings.length` en el constructor de
`World`) y, tras construir `citizens`, contar cuántos tienen `dentroDe
=== b.id` para cada edificio y sumarlo, en vez de asumir que arranca en
0 para todos.

- [ ] **Step 1: Test que falla** — con una semilla fija, al menos una
  familia arranca con `dentroDe >= 0` (y TODOS sus miembros comparten el
  mismo edificio); `world.ocupantes` en el tick 0 refleja correctamente
  esos ocupantes iniciales (no se pierden ni se duplican al entrar/salir
  después); un ciudadano que arranca adentro se comporta EXACTAMENTE
  igual que uno que entró por la puerta más tarde (reusa
  `updateInterior` sin caso especial — confirmarlo, no debería hacer
  falta ningún cambio en `interior.ts`).
- [ ] **Step 2-3:** TDD estándar; `npm test` COMPLETO (con balance —
  ciudadanos ya refugiados desde el inicio podrían cambiar la letalidad
  temprana del brote de forma real, no solo ruido; documentar el
  análisis igual que Task 1) y `npx tsc --noEmit` en verde.
- [ ] **Step 4: Commit** — `feat: una fraccion de familias empieza dentro de su casa (Plan 19)`

---

## Task 4: Cierre

- [ ] **Step 1:** `npm test` completo (las 3 tasks anteriores, junto)
  y `npx tsc --noEmit` limpios. Confirmar que `tests/portabilidad.test.ts`
  sigue verde (sin `Math.hypot`/etc. nuevos).
- [ ] **Step 2: Cierre** — actualizar la sección "Vida ambiental" del
  design doc (autos-obstáculo y familias-en-casa pasan a ✅), lecciones
  en CLAUDE.md si aplica (especialmente si el balance se movió y hubo
  que recalibrar), checkboxes marcados, commit
  `chore: vida ambiental verificada (Plan 19 completo)`, push.
