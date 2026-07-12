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
- Streams de RNG por subsistema (`pandemia:<seed>:<sistema>`): cada sistema
  usa SOLO su stream; nunca mezclar.
- `SpatialGrid.queryCircle` reusa un scratch interno: NUNCA anidar consultas.
- Todo teletransporte (entrar/salir de edificios, re-enganche a la calle)
  resetea `prevX/prevZ` para no dejar estelas en el render.
- PROHIBIDOS también en `src/sim/`: `Math.hypot/cos/sin/tan/atan2` (no portables
  entre motores JS). Distancias con `sqrt(dx*dx+dz*dz)`; direcciones desde la
  tabla `DIRECCIONES` de config. Lo vigila `tests/portabilidad.test.ts`.

## Flujo de trabajo

- Tests con Vitest: `npm test`. TDD para todo código de `src/sim/`.
- Verificar antes de cada commit: `npm test` y `npx tsc --noEmit`.
- Commits pequeños, mensajes en español (`feat:`, `test:`, `chore:`).
- Planes de implementación: `docs/superpowers/plans/`.

## Automejora (bucle de aprendizaje)

Este archivo es un documento vivo. Al terminar cada tarea o plan:

1. Si descubriste algo que a un futuro agente le ahorraría tiempo o errores
   (un patrón que funcionó, una trampa de Three.js/Vitest/Windows, una regla
   de balance del juego), agrégalo en «Lecciones aprendidas»: una línea.
2. Si una regla de este documento resultó mal o incompleta, corrígela en el
   momento y menciónalo en el mensaje de commit.
3. Mantenlo corto: máximo ~10 lecciones. Si se llena, fusiona o borra las que
   ya estén cubiertas por el código, los tests o los planes.

## Lecciones aprendidas

- `hashState()` en `world.ts` trunca posiciones a 24 bits (tres bytes en `mix()`);
  si el mapa crece mucho más allá de ~1677 m (a escala ×100), ampliar el mezclador.
- `CameraRig` registra listeners en `window` (`pointerup`, `pointermove`, `resize`)
  en el constructor sin `dispose()`: si algún día se reconstruye sin recargar la
  página, añadir teardown para evitar fugas de listeners duplicados.
- En Windows, usar las herramientas de preview (dev server + eval) para verificar
  consola, FPS y memoria de forma programática, pero dejar el juicio visual fino
  (fluidez percibida, estética) a un humano. El screenshot de esas herramientas
  puede colgarse con el canvas WebGL del juego (timeout ~30s) sin que la página
  esté rota — usar `javascript_tool`/eval para leer estado en vez de fiarse solo
  de la imagen. Además, `document.hidden === true` NO congela `requestAnimationFrame`
  del todo (Chrome lo regula a una tasa baja, no lo suspende): tickear el mundo a
  mano vía el gancho `window.pandemia.tick()` mientras la pestaña sigue "viva"
  puede mezclarse con ticks del bucle real y desincronizar el resultado de una
  corrida limpia (como `balance.test.ts`) por sensibilidad caótica. Para verificar
  NÚMEROS exactos de balance, confiar en el test automatizado; el gancho de dev
  sirve para probar FLUJO (órdenes, posesión, overlays, costo por tick), no para
  reproducir un porcentaje preciso.
- Trampa de `THREE.InstancedMesh` (Task 9, `SplatsView`): si la malla nace con
  `count = 0` y se llena con instancias más tarde, el primer render calcula
  `boundingSphere` con el conjunto vacío y lo deja inválido (radio `-1`) para
  siempre — las instancias futuras se recortan del frustum aunque la cámara
  las mire de frente (invisibles, pero `mesh.count` y las matrices/colores
  están bien). Si una `InstancedMesh` crece con el tiempo desde vacía, poner
  `mesh.frustumCulled = false` o recalcular `computeBoundingSphere()` tras
  cada `update()`.
- Balance (Planes 2-3-5): los cuellos de botella suelen ser MECÁNICA faltante,
  no ajuste (búnker eterno → asedio); el gate debe medir la curva a un punto
  fijo del reloj, no la cola larga; y el paisaje es NO monotónico — palancas
  "obviamente letales" empeoran la devastación, y algunas perillas (Plan 5,
  `HERIDAS.probPierna`) tienen "agujas" aisladas de ~0.05 de ancho por semilla
  (pasa en 0.55, falla en 0.5 y en 0.6) en vez de una meseta — perseguirlas es
  sobreajustar a la semilla de ejemplo, no balancear el juego. Causa raíz Plan
  5: cualquier función de la sim que haga UN `rng.next()` adicional e
  incondicional por evento (aquí, `sortearZonaHerida` en cada infección)
  resecuencia TODOS los draws futuros de ese stream — el efecto dominante en
  el resultado puede ser ese reordenamiento, no el diseño de la mecánica en
  sí. Una perilla por corrida, tabla de datos, y re-correr el gate completo
  — y si una perilla tiene rango prohibido (p. ej. `probPierna = 0` rompe
  `heridas.test.ts` porque `r < 0` nunca es cierto), revalidar el test de la
  mecánica ANTES de medir balance, no después.
- Dos trampas de TS estrictas ya vistas: `noUnusedParameters` exige `void
  param;` para CADA parámetro sin usar de un stub (no solo los "extra"); y
  `if (c.salud !== 'zombi')` justo después de un `if (c.salud === 'zombi')
  {...; return;}` no compila (TS2367, tipo ya estrechado) — quitar el `if`
  redundante.
- (Plan 4 Task 4, fin de partida) `startLoop` (`src/game/loop.ts`) tenía
  `world.tick()` cableado dentro del stepper sin punto de corte: para congelar
  la sim sin tocar el render (reloj a 0:00), se le añadieron `debeSeguir?` (se
  chequea ANTES del tick) y `afterTick?` (se llama justo DESPUÉS, para que
  `Partida.update` vea el `tickCount` recién actualizado y no dispare un tick
  extra por condición de carrera de un tick de retraso).
- (Plan 4 Task 8, audio) Para consumir DELTAS de un array de la sim entre
  frames de render, importa si el array solo CRECE (`world.hitos`) o se
  COMPACTA in-place cada tick (`world.ruidos`) — ahí un índice guardado no
  sobrevive ni un tick. Para señales derivadas de algo que se compacta, leer
  un ESTADO agregado y estable y disparar por su cambio entre frames, en vez
  de perseguir índices del array volátil.
- (Plan 4, arquitectura para Plan 5) Dos patrones reutilizables: la cola de
  órdenes (`world.encolarOrden`, FIFO al inicio del tick) es la única forma
  correcta de meter input del jugador a una sim determinista; el modo estático
  de `Rival` (nunca tickea, deriva `curva`/`indiceCiudad` de datos congelados
  en vez de simular) es el patrón para "comparar contra una partida grabada"
  sin duplicar clases. Replicar ambos en vez de inventar de nuevo.
- (Plan 4 Task 10, hallazgo de revisión) Un `.catch(() => {})` silencioso en
  `navigator.clipboard.writeText` deja al usuario sin forma de copiar un link
  viral si el navegador lo bloquea (falta de gesto real, permiso denegado,
  contexto sin TLS) — encadenar un fallback `execCommand('copy')` y, si
  también falla, revelar un campo de texto visible y preseleccionado para
  copiar a mano. Nunca fallar en silencio en una feature de compartir.
- (Plan 5 Task 5, giros de semilla) Cuando un brief da un snippet de código
  ilustrativo, no copiarlo literal: el ejemplo de `eventos.ts` traía `import
  type { World }` sin usarlo en el cuerpo — con `noUnusedLocals` eso no
  compila. Y ojo con confundir la sección "Files" (qué archivos toca la
  task) con el alcance real de un efecto: un implementador leyó "Files"
  como si acotara DÓNDE aplicar el factor de lluvia sobre `PANICO.radioGrito`
  y aplicó el efecto solo en `panico.ts`, saltándose `zombis.ts` (el grito de
  la mordida) — pese a que la prosa de "Interfaces" nombraba ambos archivos
  explícitamente y `zombis.ts` sí estaba en la lista de "Files" (hallazgo de
  revisión, corregido). "Files" dice qué se toca; el alcance real de un
  efecto está en la prosa de "Interfaces" — verificar ahí, no inferir de la
  lista de archivos.
