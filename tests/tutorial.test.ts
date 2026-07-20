import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { huboHabilidadDeJugador, hayPanicoMasivo, huboPosesion } from '../src/ui/tutorial';

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

  it('huboPosesion es false en un mundo recién creado (ningún agente poseído todavía)', () => {
    const w = new World('tuto-6', 2);
    expect(huboPosesion(w)).toBe(false);
  });

  it('huboPosesion ignora ordenControl en civiles (nunca debería estar en true, pero por si acaso)', () => {
    const w = new World('tuto-7', 2);
    w.citizens[0].ordenControl = true;
    expect(huboPosesion(w)).toBe(false);
  });

  it('huboPosesion es true en cuanto un agente tiene ordenControl (posesión WASD aplicada)', () => {
    const w = new World('tuto-8', 2);
    w.agentes[0].ordenControl = true;
    expect(huboPosesion(w)).toBe(true);
  });
});
