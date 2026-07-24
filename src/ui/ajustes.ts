// PANDEMIA — panel de ajustes de calidad gráfica (Plan 18 Task 1).
//
// El juego hoy construye SIEMPRE `PersonajesView` (pool horneado, Plan 9)
// Y `PersonajesAltaView` (esqueletos reales con LOD, Plan 11) sin gate
// alguno. Este módulo expone al jugador la elección entre "alta" (ambas
// vistas, comportamiento actual) y "media" (solo el pool horneado, sin
// esqueletos reales) — el nivel "baja" (cápsulas) fue borrado en el Plan 6
// junto con `citizensView.ts` y no se reconstruye aquí (ver plan).
//
// Simplificación deliberada: el ajuste se lee una sola vez, ANTES de
// `iniciar()` en `main.ts`, y cambiarlo recarga la página entera — no hay
// forma de destruir/reconstruir `PersonajesAltaView` a mitad de partida.

const CLAVE_CALIDAD = 'pandemia-calidad';

export type Calidad = 'alta' | 'media';

export function leerCalidad(): Calidad {
  const v = localStorage.getItem(CLAVE_CALIDAD);
  return v === 'media' ? 'media' : 'alta'; // 'alta' por defecto
}

function guardarCalidad(c: Calidad): void {
  localStorage.setItem(CLAVE_CALIDAD, c);
}

/**
 * Panel simple: mismo patrón de HTML inyectado + listeners que
 * `src/ui/sala.ts`. No depende de assets cargados — puede llamarse antes
 * de que termine el `await Promise.all(...)` de `main.ts`, mientras el HUD
 * todavía muestra "Cargando…".
 */
export function iniciarPanelAjustes(): void {
  const btn = document.getElementById('btn-ajustes');
  const panel = document.getElementById('panel-ajustes') as HTMLDivElement | null;
  if (!btn || !panel) return;

  btn.addEventListener('click', () => panel.classList.toggle('activo'));

  panel.innerHTML = `
    <div class="ajustes-titulo">Calidad gráfica</div>
    <label><input type="radio" name="calidad" value="alta" /> Alta (recomendada)</label>
    <label><input type="radio" name="calidad" value="media" /> Media (computadoras más lentas)</label>
    <div class="ajustes-nota">Se aplica al recargar la página.</div>
  `;

  const actual = leerCalidad();
  const inputActual = panel.querySelector(`input[value="${actual}"]`) as HTMLInputElement | null;
  if (inputActual) inputActual.checked = true;

  panel.querySelectorAll('input[name="calidad"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      guardarCalidad((e.target as HTMLInputElement).value as Calidad);
      location.reload();
    });
  });
}
