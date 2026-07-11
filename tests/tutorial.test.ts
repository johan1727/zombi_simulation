import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { huboHabilidadDeJugador, hayPanicoMasivo } from '../src/ui/tutorial';

describe('tutorial: detección de disparadores', () => {
  it('huboHabilidadDeJugador es false en un mundo recién creado', () => {
    const w = new World('tuto-1', 2);
    expect(huboHabilidadDeJugador(w)).toBe(false);
  });

  it('huboHabilidadDeJugador ignora hitos que NO son de habilidad del jugador', () => {
    const w = new World('tuto-2', 2);
    w.hitos.push({ tick: 10, tipo: 'brecha', a: 0, b: 0 });
    w.hitos.push({ tick: 11, tipo: 'caida_agente', a: 0, b: -1 });
    w.hitos.push({ tick: 12, tipo: 'transformacion_cabeza', a: 0, b: -1 });
    expect(huboHabilidadDeJugador(w)).toBe(false);
  });

  it.each(['disparo', 'rescate', 'megafono', 'refuerzo'] as const)(
    'huboHabilidadDeJugador es true en cuanto aparece un hito %s',
    (tipo) => {
      const w = new World(`tuto-3-${tipo}`, 2);
      w.hitos.push({ tick: 5, tipo, a: 0, b: -1 });
      expect(huboHabilidadDeJugador(w)).toBe(true);
    }
  );

  it('hayPanicoMasivo es false con 30 o menos ciudadanos en pánico', () => {
    const w = new World('tuto-4', 40);
    for (let i = 0; i < 30; i++) w.citizens[i].animo = 'panico';
    expect(hayPanicoMasivo(w)).toBe(false);
  });

  it('hayPanicoMasivo es true con más de 30 ciudadanos en pánico a la vez', () => {
    const w = new World('tuto-5', 40);
    for (let i = 0; i < 31; i++) w.citizens[i].animo = 'panico';
    expect(hayPanicoMasivo(w)).toBe(true);
  });
});
