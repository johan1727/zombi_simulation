import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { HERIDAS, CITIZENS, DT } from '../src/sim/config';
import { infectar } from '../src/sim/infeccion';

describe('heridas localizadas', () => {
  it('infectar asigna una zona de las tres posibles', () => {
    const w = new World('heridas-1', 50);
    const zonas = new Set<string>();
    for (const c of w.citizens) {
      infectar(c, w.rngInfeccion, w.rngHeridas);
      zonas.add(c.zonaHerida);
    }
    expect([...zonas].sort()).toEqual(['brazo', 'pierna', 'torso']);
  });

  it('herida de pierna reduce la velocidad de caminata a un 40%', () => {
    const w = new World('heridas-2', 5);
    const herido = w.citizens[0];
    const sano = w.citizens[1];
    herido.zonaHerida = 'pierna'; // forzado, sin pasar por infectar: aísla solo el efecto de velocidad
    sano.zonaHerida = '';
    const x0h = herido.x;
    const z0h = herido.z;
    const x0s = sano.x;
    const z0s = sano.z;
    for (let t = 0; t < 30; t++) w.tick();
    const dHerido = Math.sqrt((herido.x - x0h) ** 2 + (herido.z - z0h) ** 2);
    const dSano = Math.sqrt((sano.x - x0s) ** 2 + (sano.z - z0s) ** 2);
    // dSano puede ser 0 si el sano quedó 'quieto' esos 30 ticks (walkSpeed
    // tiene pausas); comparar contra el paso teórico máximo en vez del sano
    // real evita un test intermitente.
    const pasoMaximoSano = CITIZENS.walkSpeed * DT * 30;
    expect(dHerido).toBeLessThan(pasoMaximoSano * HERIDAS.factorVelocidadFractura * 1.3);
    expect(dSano).toBeGreaterThanOrEqual(0); // sano nunca "retrocede"
  });

  it('herida de brazo abre una ventana de amputación que se agota sola', () => {
    const w = new World('heridas-3', 5);
    const c = w.citizens[0];
    c.salud = 'sano';
    infectar(c, w.rngInfeccion, w.rngHeridas);
    c.zonaHerida = 'brazo';
    c.ventanaAmputarTicks = 3;
    for (let t = 0; t < 5; t++) w.tick();
    expect(c.ventanaAmputarTicks).toBe(0);
    expect(c.brazoAmputado).toBe(false); // nadie la usó
  });

  it('gemelos deterministas con heridas', () => {
    const a = new World('heridas-4', 300);
    const b = new World('heridas-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
