import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { replayYComparar, validarPeticion, type PeticionVerificar } from '../server/verificar';

/**
 * Juega una partida real corta y devuelve exactamente lo que un cliente
 * mandaría a `/verificar`: semilla, log de órdenes, duración, curva (misma
 * cadencia/downsample que `Partida`/`desafio.ts`) e índice final.
 */
function jugarPartidaCorta(seed: string, duracionTicks: number): PeticionVerificar {
  // Sin citizenCount custom: `replayYComparar` siempre construye `new
  // World(seed)` con la población por defecto (como el juego real), así que
  // la partida "real" de este test debe usar la misma población para que
  // ambas corridas sean comparables.
  const w = new World(seed);
  const a = w.agentes[0];
  w.encolarOrden({ agente: a.id, tipo: 'mover', x: a.x + 10, z: a.z });

  const curvaFina: number[] = [];
  for (let t = 0; t < duracionTicks; t++) {
    if (t === 60) {
      w.encolarOrden({ agente: a.id, tipo: 'mover', x: a.x - 5, z: a.z + 5 });
    }
    w.tick();
    if (w.tickCount % 150 === 0 && w.tickCount > 0 && curvaFina.length < 145) {
      curvaFina.push(w.vivosPct);
    }
  }
  const curvaAfirmada: number[] = [];
  for (let idx = 0; idx < curvaFina.length; idx += 2) {
    curvaAfirmada.push(Math.max(0, Math.min(100, Math.round(curvaFina[idx]))));
  }

  return {
    seed,
    ordenLog: w.ordenLog.map((e) => ({ tick: e.tick, orden: e.orden })),
    duracionTicks,
    curvaAfirmada,
    indiceAfirmado: w.indiceCiudad,
  };
}

describe('verificar (replay server-side)', () => {
  it('confirma como válida una partida real replayada con sus propios datos', () => {
    const peticion = jugarPartidaCorta('verificar-1', 320);
    const resultado = replayYComparar(peticion);
    expect(resultado.valido).toBe(true);
  });

  it('detecta un indiceAfirmado alterado a mano', () => {
    const peticion = jugarPartidaCorta('verificar-2', 320);
    const alterada = { ...peticion, indiceAfirmado: peticion.indiceAfirmado + 5 };
    const resultado = replayYComparar(alterada);
    expect(resultado.valido).toBe(false);
  });

  it('detecta una curvaAfirmada alterada a mano', () => {
    const peticion = jugarPartidaCorta('verificar-3', 320);
    expect(peticion.curvaAfirmada.length).toBeGreaterThan(0);
    const curvaAlterada = [...peticion.curvaAfirmada];
    // Restar (no sumar): si el valor real ya está cerca de 100, sumar y
    // recortar a [0, 100] podría no cambiar nada (falso negativo del test).
    curvaAlterada[0] = Math.max(0, curvaAlterada[0] - 40);
    const resultado = replayYComparar({ ...peticion, curvaAfirmada: curvaAlterada });
    expect(resultado.valido).toBe(false);
  });

  it('detecta un largo de curvaAfirmada distinto al del replay real', () => {
    const peticion = jugarPartidaCorta('verificar-4', 320);
    const curvaAlterada = [...peticion.curvaAfirmada, 50];
    const resultado = replayYComparar({ ...peticion, curvaAfirmada: curvaAlterada });
    expect(resultado.valido).toBe(false);
  });

  it('es determinista: dos replays de la misma petición dan el mismo veredicto', () => {
    const peticion = jugarPartidaCorta('verificar-5', 320);
    expect(replayYComparar(peticion)).toEqual(replayYComparar(peticion));
  });

  describe('validarPeticion', () => {
    it('acepta un cuerpo bien formado', () => {
      const peticion = jugarPartidaCorta('verificar-6', 320);
      expect(validarPeticion(peticion)).not.toBeNull();
    });

    it('rechaza JSON sin la forma esperada', () => {
      expect(validarPeticion(null)).toBeNull();
      expect(validarPeticion({})).toBeNull();
      expect(validarPeticion({ seed: 's' })).toBeNull();
    });

    it('rechaza una orden con tipo inválido dentro del log', () => {
      const peticion = jugarPartidaCorta('verificar-7', 320);
      const malformada = {
        ...peticion,
        ordenLog: [{ tick: 0, orden: { agente: 0, tipo: 'volar', x: 0, z: 0 } }],
      };
      expect(validarPeticion(malformada)).toBeNull();
    });

    it('rechaza duracionTicks fuera de rango', () => {
      const peticion = jugarPartidaCorta('verificar-8', 320);
      expect(validarPeticion({ ...peticion, duracionTicks: -1 })).toBeNull();
      expect(validarPeticion({ ...peticion, duracionTicks: 999999 })).toBeNull();
    });
  });
});
