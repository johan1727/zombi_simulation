import { describe, expect, it } from 'vitest';
import { RivalEnVivo } from '../src/net/rivalEnVivo';
import type { ConexionSala, Muestra } from '../src/net/sala';

/**
 * `ConexionSala` falsa: no abre ningún WebSocket real, solo guarda el
 * callback que `onMuestraRival` registra para que el test lo dispare a mano
 * (simula que llegó un mensaje `'muestra-rival'` del relay).
 */
function crearConexionFalsa(): ConexionSala & { emitirMuestra(m: Muestra): void } {
  let cb: ((m: Muestra) => void) | undefined;
  return {
    crear: async () => 'ABCD',
    unirse: async () => 'semilla-falsa',
    enviarMuestra: () => {},
    onMuestraRival: (callback) => {
      cb = callback;
    },
    onDesconexion: () => {},
    onEmparejado: () => {},
    emitirMuestra(m: Muestra): void {
      cb?.(m);
    },
  };
}

describe('RivalEnVivo', () => {
  it('antes de la primera muestra, usa el fallback vivosPct=100 / indiceCiudad=0', () => {
    const conexion = crearConexionFalsa();
    const rival = new RivalEnVivo(conexion);
    expect(rival.vivosPct).toBe(100);
    expect(rival.indiceCiudad).toBe(0);
    expect(rival.curva).toEqual([]);
    expect(rival.avisosBrecha).toEqual([]);
  });

  it('cada muestra recibida agrega una entrada a curva y actualiza vivosPct/indiceCiudad', () => {
    const conexion = crearConexionFalsa();
    const rival = new RivalEnVivo(conexion);

    conexion.emitirMuestra({ vivosPct: 90, indiceCiudad: 10, brecha: false });
    expect(rival.curva).toEqual([90]);
    expect(rival.vivosPct).toBe(90);
    expect(rival.indiceCiudad).toBe(10);

    conexion.emitirMuestra({ vivosPct: 75, indiceCiudad: 20, brecha: false });
    expect(rival.curva).toEqual([90, 75]);
    expect(rival.vivosPct).toBe(75);
    expect(rival.indiceCiudad).toBe(20);
  });

  it('una muestra con brecha=true agrega el índice (1-based) de esa muestra a avisosBrecha', () => {
    const conexion = crearConexionFalsa();
    const rival = new RivalEnVivo(conexion);

    conexion.emitirMuestra({ vivosPct: 90, indiceCiudad: 10, brecha: false });
    conexion.emitirMuestra({ vivosPct: 70, indiceCiudad: 15, brecha: true });
    conexion.emitirMuestra({ vivosPct: 60, indiceCiudad: 18, brecha: false });
    conexion.emitirMuestra({ vivosPct: 40, indiceCiudad: 22, brecha: true });

    expect(rival.avisosBrecha).toEqual([2, 4]);
  });

  it('la curva se limita a 145 muestras, pero vivosPct/indiceCiudad siguen la última muestra recibida', () => {
    const conexion = crearConexionFalsa();
    const rival = new RivalEnVivo(conexion);

    for (let i = 0; i < 150; i++) {
      conexion.emitirMuestra({ vivosPct: i, indiceCiudad: i, brecha: false });
    }

    expect(rival.curva.length).toBe(145);
    expect(rival.vivosPct).toBe(149);
    expect(rival.indiceCiudad).toBe(149);
  });

  it('tick() no lanza y no cambia el estado (no hay tick real del lado del rival remoto)', () => {
    const conexion = crearConexionFalsa();
    const rival = new RivalEnVivo(conexion);
    conexion.emitirMuestra({ vivosPct: 55, indiceCiudad: 5, brecha: false });
    expect(() => rival.tick()).not.toThrow();
    expect(rival.vivosPct).toBe(55);
    expect(rival.curva).toEqual([55]);
  });
});
