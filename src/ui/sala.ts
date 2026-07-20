// PANDEMIA — pantalla de sala (Plan 10 Task 3): se muestra ANTES de
// construir el `World`, porque la semilla depende de la elección del
// jugador. Tres caminos:
//   - "JUGAR SOLO": sin red, el llamador (`main.ts`) sigue el flujo de
//     siempre (`?seed=` de la URL o una aleatoria).
//   - "CREAR SALA": pide un código nuevo al relay y espera a que el rival
//     se una (`onEmparejado`); mientras espera, ofrece cancelar (cierra el
//     WebSocket y vuelve al menú).
//   - "UNIRSE A SALA": pega/escribe el código de una sala existente.
//
// Se salta por completo cuando hay `?reto=` en la URL — decisión de
// `main.ts`, esta función ni se entera de esa lógica.

import { crearConexionSala, type ConexionSala } from '../net/sala';
import { escapeHtml } from './resultado';

export interface EleccionInicio {
  /** Presente solo si el jugador creó/se unió a una sala y ya se emparejó. */
  conexion?: ConexionSala;
  /** Seed repartida por el relay al emparejar; ausente en "jugar solo". */
  seed?: string;
}

function vistaMenu(mensajeError?: string): string {
  return `
    <div class="sala-caja">
      <div class="sala-titulo">PANDEMIA</div>
      ${mensajeError ? `<div class="sala-error">${escapeHtml(mensajeError)}</div>` : ''}
      <button id="sala-btn-solo" type="button">JUGAR SOLO</button>
      <button id="sala-btn-buscar" type="button">BUSCAR PARTIDA</button>
      <div class="sala-separador">o jugá con un amigo, en vivo</div>
      <button id="sala-btn-crear" type="button">CREAR SALA</button>
      <div class="sala-unirse">
        <input id="sala-input-codigo" type="text" placeholder="CÓDIGO DE SALA" maxlength="6" autocomplete="off" />
        <button id="sala-btn-unirse" type="button">UNIRSE</button>
      </div>
    </div>`;
}

function vistaCargando(mensaje: string): string {
  return `
    <div class="sala-caja">
      <div class="sala-cargando">${escapeHtml(mensaje)}</div>
      <button id="sala-btn-cancelar" type="button">CANCELAR</button>
    </div>`;
}

function vistaEsperando(codigo: string): string {
  return `
    <div class="sala-caja">
      <div class="sala-titulo">CREASTE UNA SALA</div>
      <div class="sala-codigo">${escapeHtml(codigo)}</div>
      <button id="sala-btn-copiar" type="button">COPIAR CÓDIGO</button>
      <div id="sala-manual" class="sala-manual">
        No se pudo copiar automáticamente. Copiá el código:
        <input id="sala-manual-input" type="text" readonly />
      </div>
      <div class="sala-esperando">Esperando a que tu rival se una…</div>
      <button id="sala-btn-cancelar" type="button">CANCELAR</button>
    </div>`;
}

/**
 * Copiado del código al portapapeles con el MISMO fallback en tres niveles
 * que `resultado.ts` (`copiarDesafio`, Plan 4 Task 10): `navigator.clipboard`
 * → `execCommand('copy')` → campo de texto visible preseleccionado. Se
 * replica en vez de importarse porque el DOM/botones son locales a cada
 * pantalla (no vale la pena una abstracción compartida para un solo uso más).
 */
function conectarCopiado(el: HTMLElement, codigo: string): void {
  const btn = el.querySelector('#sala-btn-copiar') as HTMLButtonElement | null;
  if (!btn) return;

  const textoOriginal = btn.textContent ?? 'COPIAR CÓDIGO';
  const marcarCopiado = (): void => {
    btn.textContent = '¡Copiado!';
    window.setTimeout(() => {
      btn.textContent = textoOriginal;
    }, 2000);
  };
  const mostrarCopiaManual = (): void => {
    const panel = el.querySelector('#sala-manual');
    const input = el.querySelector('#sala-manual-input') as HTMLInputElement | null;
    if (!panel || !input) return;
    panel.classList.add('activo');
    input.value = codigo;
    input.focus();
    input.select();
  };
  const intentarExecCommand = (): boolean => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = codigo;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  btn.addEventListener('click', () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(codigo)
        .then(marcarCopiado)
        .catch(() => {
          if (intentarExecCommand()) marcarCopiado();
          else mostrarCopiaManual();
        });
    } else if (intentarExecCommand()) {
      marcarCopiado();
    } else {
      mostrarCopiaManual();
    }
  });
}

export function mostrarPantallaSala(): Promise<EleccionInicio> {
  const el = document.getElementById('sala') as HTMLDivElement;
  el.classList.add('activo');

  return new Promise<EleccionInicio>((resolve) => {
    const terminar = (eleccion: EleccionInicio): void => {
      el.classList.remove('activo');
      el.innerHTML = '';
      resolve(eleccion);
    };

    const mostrarMenu = (mensajeError?: string): void => {
      el.innerHTML = vistaMenu(mensajeError);
      el.querySelector('#sala-btn-solo')?.addEventListener('click', () => terminar({}));
      el.querySelector('#sala-btn-buscar')?.addEventListener('click', () => flujoBuscar());
      el.querySelector('#sala-btn-crear')?.addEventListener('click', () => flujoCrear());
      const btnUnirse = el.querySelector('#sala-btn-unirse') as HTMLButtonElement | null;
      const inputCodigo = el.querySelector('#sala-input-codigo') as HTMLInputElement | null;
      const intentarUnirse = (): void => {
        const codigo = (inputCodigo?.value ?? '').trim().toUpperCase();
        if (codigo) flujoUnirse(codigo);
      };
      btnUnirse?.addEventListener('click', intentarUnirse);
      inputCodigo?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') intentarUnirse();
      });
    };

    const conectarCancelar = (conexion: ConexionSala): void => {
      el.querySelector('#sala-btn-cancelar')?.addEventListener('click', () => {
        conexion.cerrar?.();
        mostrarMenu();
      });
    };

    const flujoCrear = (): void => {
      const conexion = crearConexionSala();
      el.innerHTML = vistaCargando('Creando sala…');
      conectarCancelar(conexion);
      conexion
        .crear()
        .then((codigo) => {
          el.innerHTML = vistaEsperando(codigo);
          conectarCopiado(el, codigo);
          conectarCancelar(conexion);
          conexion.onEmparejado((seed) => terminar({ conexion, seed }));
        })
        .catch(() => mostrarMenu('No se pudo crear la sala. ¿Está corriendo el relay?'));
    };

    const flujoBuscar = (): void => {
      const conexion = crearConexionSala();
      el.innerHTML = vistaCargando('Buscando un rival…');
      conectarCancelar(conexion);
      conexion
        .buscarPartida()
        .then((seed) => terminar({ conexion, seed }))
        .catch(() => mostrarMenu('No se pudo buscar partida. ¿Está corriendo el relay?'));
    };

    const flujoUnirse = (codigo: string): void => {
      const conexion = crearConexionSala();
      el.innerHTML = vistaCargando('Uniéndose a la sala…');
      conectarCancelar(conexion);
      conexion
        .unirse(codigo)
        .then((seed) => terminar({ conexion, seed }))
        .catch(() => mostrarMenu('No se pudo unir a esa sala. Revisá el código.'));
    };

    mostrarMenu();
  });
}
