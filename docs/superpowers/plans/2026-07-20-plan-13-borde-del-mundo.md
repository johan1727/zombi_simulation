# PANDEMIA — Plan 13: Borde del mundo (sin muro negro) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Plan pequeño, una sola task.

## Meta

Feedback directo del usuario jugando: al panear la cámara hasta el borde
del mapa, se ve un "muro negro" feo en vez de un horizonte. Causa
confirmada leyendo el código: el plano de suelo (`cityView.ts`) mide
EXACTAMENTE `city.width × city.depth` — nada más allá — y el fondo de la
escena (`scene.ts`) es un color plano (`0x0d0f14`) con niebla
(`THREE.Fog`) que recién empieza a los 250 m. `CameraRig.panScreen` limita
el PUNTO DE FOCO a los límites de la ciudad, pero la cámara en sí (offset
en diagonal por el ángulo isométrico) sigue pudiendo mostrar el vacío más
allá del borde cuando el foco está cerca de una esquina.

**Arreglo:** extender el suelo visualmente más allá del borde real de la
ciudad (mismo color/material que la calle, sin edificios ni geometría
extra ahí — sigue siendo barato) y adelantar el inicio de la niebla, para
que el borde se sienta como "la ciudad se pierde en la neblina" en vez de
un corte abrupto. Cero cambios de gameplay (los límites reales de
`CameraRig.panScreen`/`world.city` no cambian, solo lo visual).

Esto es 100% `src/render/` — CERO cambios a `src/sim/`.

## Task 1: Suelo extendido + niebla más cercana

**Files:**
- Modify: `src/render/cityView.ts` (plano de suelo)
- Modify: `src/render/scene.ts` (rango de `THREE.Fog`)

**Interfaces:**

`cityView.ts` — junto al plano de suelo real (`PlaneGeometry(city.width,
city.depth)`), agregar UN plano adicional más grande, mismo color, un
poco más abajo en Y para evitar z-fighting con el real:

```ts
const MARGEN_SUELO_EXTENDIDO = 300; // m más allá del borde real en cada dirección

const sueloExtendido = new THREE.Mesh(
  new THREE.PlaneGeometry(city.width + MARGEN_SUELO_EXTENDIDO * 2, city.depth + MARGEN_SUELO_EXTENDIDO * 2),
  /* MISMO material/color que ya usa el plano de suelo real — reusar la instancia de material si el código actual la tiene extraída, o clonar sus parámetros */
);
sueloExtendido.rotation.x = -Math.PI / 2;
sueloExtendido.position.set(city.width / 2, -0.05, city.depth / 2); // -0.05: ligeramente por debajo del suelo real
scene.add(sueloExtendido);
```

(Leer el bloque real que construye `suelo` en `cityView.ts` primero — usar
el MISMO color/material, no inventar uno nuevo, para que la transición
entre el suelo real y el extendido sea invisible.)

`scene.ts` — adelantar el inicio de la niebla para que el suelo extendido
se pierda en ella ANTES de llegar al límite de renderizado de la cámara
(`far` del `PerspectiveCamera`, revisar el valor real en `cameraRig.ts` —
visto antes en el proyecto como `1500`), no después:

```ts
scene.fog = new THREE.Fog(0x0d0f14, 150, 400); // antes: (0x0d0f14, 250, 600)
```

(Ajustar los números exactos EN NAVEGADOR — el objetivo es que panear
hasta el borde real de la ciudad muestre suelo neblinoso perdiéndose en la
distancia, no un corte visible del suelo extendido ni un cambio brusco de
densidad de niebla. Verificar también que la niebla más cercana no afecte
negativamente la lectura del mapa en el modo de juego normal, zoom alejado
— probar en varios niveles de zoom, no solo pegado al borde.)

- [x] **Step 1: Implementar.**
- [x] **Step 2:** `npx tsc --noEmit` limpio.
- [x] **Step 3: Verificación en navegador** — panear la cámara a las 4
  esquinas y a la mitad de cada borde del mapa (usar `rig.volverADirector`
  o arrastre real) y confirmar visualmente (captura con
  `canvas.toDataURL`, método ya documentado en CLAUDE.md) que ya no se ve
  el muro negro — el suelo se pierde gradualmente en la niebla. Confirmar
  también que la vista normal (ciudad completa, zoom lejano) no se ve
  "neblinosa" de más por el nuevo rango de fog. Sin errores de consola.
- [x] **Step 4: Commit** — `feat: suelo extendido y niebla mas cercana para evitar el muro negro en el borde del mapa (Plan 13)`

---

## Task 2: Cierre

- [x] **Step 1:** `npm test` completo (no debería tocar `src/sim/`) y
  `npx tsc --noEmit` limpios.
- [x] **Step 2: Cierre** — checkboxes marcados, commit
  `chore: borde del mundo verificado (Plan 13 completo)`, push.
