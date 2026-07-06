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
- En Windows, usar las herramientas de preview (dev server + eval/screenshot) para
  verificar consola, FPS y memoria de forma programática, pero dejar el juicio
  visual fino (fluidez percibida, estética) a un humano.
- Al añadir pánico/huida (Task 6), tests previos que asumían presas "lentas"
  (velocidad de caminar, 1.4 m/s) dejaron de cumplirse: en pánico huyen a
  `PANICO.velocidadHuida` (2.8 m/s), casi tan rápido como el zombi (3.4 m/s),
  así que escenarios de caza con ventanas de tiempo cortas (~10s) pueden
  necesitar más margen. Revisar tests de sistemas anteriores tras cambios de
  velocidad/comportamiento, no solo los tests nuevos.
- Trampa de `THREE.InstancedMesh` (Task 9, `SplatsView`): si la malla nace con
  `count = 0` y se llena con instancias más tarde, el primer render calcula
  `boundingSphere` con el conjunto vacío y lo deja inválido (radio `-1`) para
  siempre — las instancias futuras se recortan del frustum aunque la cámara
  las mire de frente (invisibles, pero `mesh.count` y las matrices/colores
  están bien). Si una `InstancedMesh` crece con el tiempo desde vacía, poner
  `mesh.frustumCulled = false` o recalcular `computeBoundingSphere()` tras
  cada `update()`.
- El "búnker eterno" (Task 10, BLOCKED) era un recorte de mecánica, no un mal
  ajuste: sin presión externa (`asedio.ts`) un refugio lleno sin infectado
  dentro nunca revienta. Con asedio + los 6 knobs de balance al extremo
  autorizado el colapso pasó de "nunca" a real (~610-616 s) pero sigue fuera
  de la ventana 1:30-8:00 pedida — la tasa de mordida sigue siendo el techo.
