import { describe, expect, it } from 'vitest';
import { createStepper } from '../src/game/loop';
import { DT } from '../src/sim/config';

describe('bucle de paso fijo', () => {
  it('ejecuta un tick por cada DT acumulado', () => {
    let ticks = 0;
    const step = createStepper(() => ticks++);
    step(DT * 3);
    expect(ticks).toBe(3);
  });

  it('acumula fracciones entre llamadas', () => {
    let ticks = 0;
    const step = createStepper(() => ticks++);
    step(DT * 0.6);
    expect(ticks).toBe(0);
    step(DT * 0.6);
    expect(ticks).toBe(1);
  });

  it('devuelve alpha en [0, 1)', () => {
    const step = createStepper(() => undefined);
    const alpha = step(DT * 1.5);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('limita el tiempo por llamada (pestaña en segundo plano)', () => {
    let ticks = 0;
    const step = createStepper(() => ticks++);
    step(60); // un minuto congelado no debe disparar 1800 ticks
    expect(ticks).toBeLessThanOrEqual(Math.ceil(0.25 / DT));
  });
});
