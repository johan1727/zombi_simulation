# PANDEMIA — Plan 18: Menú de ajustes de calidad gráfica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea.

## Meta

Hoy el juego decide todo solo: siempre construye `PersonajesView` (pool
horneado, Plan 9) Y `PersonajesAltaView` (esqueletos reales con LOD,
Plan 11) sin ningún gate — un jugador con una computadora floja no tiene
forma de bajar la exigencia gráfica.

**Alcance real (investigación de código confirmada):** el nivel "Baja"
del diseño original (cápsulas de color) YA NO EXISTE en el código —
`src/render/citizensView.ts` fue borrado por completo en el Plan 6,
reemplazado íntegramente por el pipeline de modelos reales. Reconstruir
un fallback de cápsulas sería un proyecto aparte, no el de este plan
(anotado como stretch al final). Lo que SÍ es directamente alcanzable:
exponer al jugador la elección YA existente en el código entre **"Alta"**
(pool horneado + esqueletos reales LOD, por defecto hoy) y **"Media"**
(solo pool horneado, sin el sistema de esqueletos reales — el nivel de
calidad que ya tenía el juego completo tras el Plan 9, antes del Plan 11).

**Simplificación deliberada:** el ajuste se aplica al INICIAR la partida
(leído de `localStorage` antes de `iniciar()`), no en caliente a mitad de
partida — cambiarlo requiere recargar. Ambas vistas se construyen una
sola vez de forma asíncrona en `main.ts`; permitir el cambio en vivo
significaría poder destruir/reconstruir `PersonajesAltaView` a mitad de
juego, complejidad real que no aporta valor proporcional para un ajuste
que un jugador cambia una vez y no vuelve a tocar.

Esto es 100% `src/ui/`/`src/game/` — CERO cambios a `src/sim/`.

## Task 1: Panel de ajustes con nivel de calidad persistido

**Files:**
- Create: `src/ui/ajustes.ts`
- Modify: `index.html` (botón de ajustes + overlay del panel)
- Modify: `src/game/main.ts` (leer el ajuste antes de construir las vistas)

**Interfaces:**

```ts
// src/ui/ajustes.ts
const CLAVE_CALIDAD = 'pandemia-calidad';
export type Calidad = 'alta' | 'media';

export function leerCalidad(): Calidad {
  const v = localStorage.getItem(CLAVE_CALIDAD);
  return v === 'media' ? 'media' : 'alta'; // 'alta' por defecto
}

function guardarCalidad(c: Calidad): void {
  localStorage.setItem(CLAVE_CALIDAD, c);
}

/** Panel simple: mismo patrón de HTML inyectado + listeners que src/ui/sala.ts. */
export function iniciarPanelAjustes(): void {
  const btn = document.getElementById('btn-ajustes');
  const panel = document.getElementById('panel-ajustes') as HTMLDivElement;
  btn?.addEventListener('click', () => panel.classList.toggle('activo'));
  panel.innerHTML = `
    <div class="ajustes-titulo">Calidad gráfica</div>
    <label><input type="radio" name="calidad" value="alta"> Alta (recomendada)</label>
    <label><input type="radio" name="calidad" value="media"> Media (computadoras más lentas)</label>
    <div class="ajustes-nota">Se aplica al recargar la página.</div>
  `;
  const actual = leerCalidad();
  (panel.querySelector(`input[value="${actual}"]`) as HTMLInputElement).checked = true;
  panel.querySelectorAll('input[name="calidad"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      guardarCalidad((e.target as HTMLInputElement).value as Calidad);
      location.reload();
    });
  });
}
```

`index.html` — botón junto a `#btn-audio` (mismo estilo circular) y el
panel oculto por defecto:
```html
<button id="btn-ajustes" type="button" title="Ajustes">⚙️</button>
<div id="panel-ajustes" class="panel-ajustes"></div>
```
```css
#btn-ajustes {
  position: fixed; top: 52px; left: 52px; z-index: 10;
  /* mismo estilo circular que #btn-audio, ver index.html actual */
}
.panel-ajustes {
  position: fixed; top: 92px; left: 12px; z-index: 15;
  display: none; background: rgba(13, 15, 20, 0.9);
  border: 1px solid rgba(234, 242, 255, 0.25); border-radius: 10px;
  padding: 12px 14px; font-family: system-ui, sans-serif; color: #eaf2ff;
  font-size: 13px; min-width: 220px;
}
.panel-ajustes.activo { display: block; }
.panel-ajustes label { display: block; margin: 6px 0; cursor: pointer; }
.ajustes-nota { margin-top: 8px; font-size: 11px; color: #cdd8e6; }
```
(Ajustar posiciones exactas en navegador para que no se superponga con
`#btn-audio`/`#banner-reto`/el resto del HUD — revisar el layout real de
`index.html` antes de fijar números.)

`main.ts` — leer `leerCalidad()` UNA vez, antes/durante `iniciar()`, y
condicionar la construcción de `PersonajesAltaView` y su `update()`:
```ts
import { leerCalidad, iniciarPanelAjustes } from '../ui/ajustes';
// ...
const calidad = leerCalidad();
// ...
const personajesAltaView = calidad === 'alta'
  ? new PersonajesAltaView(scene, personajesAssets.crudos, personajesAssets.materiales)
  : null;
// ...
// en frame(alpha):
const ocultosPorAlta = personajesAltaView
  ? personajesAltaView.update(world.citizens, alpha, world.tickCount, dtSegundos, rig.camera)
  : undefined;
personajesView.update(world.citizens, alpha, controles.seleccionado, world.tickCount, ocultosPorAlta);
```
Llamar `iniciarPanelAjustes()` una vez al arrancar (fuera de `iniciar()`,
no depende de assets cargados — puede mostrarse incluso durante "Cargando…").

Sin tests unitarios (mismo criterio que el resto de `src/ui/*.ts` sin
lógica de sim). Verificación en navegador.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2:** `npx tsc --noEmit` limpio.
- [ ] **Step 3: Verificación en navegador** — abrir el panel de ajustes,
  cambiar a "Media", confirmar que recarga y que NINGÚN ciudadano anima
  con esqueleto real por cerca que esté la cámara (verificar que
  `PersonajesAltaView` no se construye, p. ej. contando draw calls o
  confirmando que el nuevo código nunca corre); volver a "Alta" y
  confirmar que el sistema de esqueletos reales vuelve a funcionar
  exactamente igual que antes de este plan. Confirmar que el valor
  persiste entre recargas sin tocar el panel. Sin errores de consola.
- [ ] **Step 4: Commit** — `feat: menu de ajustes con nivel de calidad grafica (Plan 18)`

---

## Task 2: Cierre

- [ ] **Step 1:** `npm test` completo (no debería tocar `src/sim/`) y
  `npx tsc --noEmit` limpios.
- [ ] **Step 2: Cierre** — actualizar la tabla de calidad del design doc
  (mencionar que "Alta"/"Media" ya son elegibles por el jugador, "Baja"
  con cápsulas sigue sin existir — anotarlo como trabajo futuro real si
  algún día hace falta un piso más bajo), checkboxes marcados, commit
  `chore: menu de calidad grafica verificado (Plan 18 completo)`, push.

---

## Fuera de alcance (stretch futuro, no bloqueante)

Reconstruir un nivel "Baja" real (geometría de cápsulas, sin modelos
GLB ni animación) para hardware muy limitado — el diseño original lo
preveía como "el mínimo garantizado, nunca se retira", pero se perdió al
reemplazar `citizensView.ts` en el Plan 6. Solo vale la pena si "Media"
(pool horneado sin esqueletos reales) sigue siendo pesado para algún
jugador real — no hay evidencia de eso todavía.
