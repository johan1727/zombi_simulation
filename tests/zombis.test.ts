import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { TICK_RATE, AUTOS } from '../src/sim/config';

function prepara(): { w: World; zombi: World['citizens'][0]; presa: World['citizens'][0] } {
  const w = new World('caza-1', 2);
  const [zombi, presa] = w.citizens;
  zombi.salud = 'zombi';
  zombi.x = 50; zombi.z = 4; zombi.prevX = 50; zombi.prevZ = 4;
  presa.x = 58; presa.z = 4; presa.prevX = 58; presa.prevZ = 4;
  presa.dirX = 0; presa.dirZ = 1; // que no huya en línea recta por construcción
  return { w, zombi, presa };
}

describe('zombis', () => {
  it('persigue y muerde a la presa más cercana', () => {
    const { w, presa } = prepara();
    // La presa puede entrar en pánico y huir (Task 6): dar margen extra
    // sobre el tiempo que tardaría un zombi en alcanzarla caminando.
    for (let t = 0; t < 20 * TICK_RATE; t++) w.tick();
    expect(presa.salud).not.toBe('sano'); // fue mordida (incubando o ya zombi)
  });

  it('la mordida genera un grito (ruido)', () => {
    const { w, zombi, presa } = prepara();
    for (let t = 0; t < 20 * TICK_RATE; t++) {
      w.tick();
      if (presa.salud !== 'sano') break;
    }
    expect(presa.salud).not.toBe('sano'); // fue mordida
    expect(w.ruidos.length).toBeGreaterThanOrEqual(1); // la mordida (o el pánico) genera grito
    expect(zombi.cdMordida).toBeGreaterThanOrEqual(0);
  });

  it('los ruidos decaen y desaparecen', () => {
    const w = new World('caza-2', 1);
    // Con Plan 19, si la única ciudadana de esta semilla nació ya adentro de
    // un refugio ocupado, resolverAsedios() añade su propio ruido periódico
    // de "refugiados" en tickCount % ASEDIO.ruidoCadaTicks === 0 (incluido
    // el tick 0) — ruido real, pero ajeno a lo que este test mide. Se fuerza
    // a la calle para aislar el decaimiento del ruido de prueba.
    w.citizens[0].dentroDe = -1;
    w.ruidos.push({ x: 10, z: 10, radio: 12, ticks: 3 });
    for (let t = 0; t < 5; t++) w.tick();
    expect(w.ruidos.length).toBe(0);
  });

  it('sin presa a la vista, erra sin congelarse', () => {
    const w = new World('caza-3', 1);
    const z = w.citizens[0];
    z.salud = 'zombi';
    const x0 = z.x;
    const z0 = z.z;
    for (let t = 0; t < 5 * TICK_RATE; t++) w.tick();
    const movio = Math.abs(z.x - x0) + Math.abs(z.z - z0) > 0.5;
    expect(movio).toBe(true);
  });
});

describe('alarma de autos (Plan 19 Task 2)', () => {
  function preparaCercaDeAuto(seed: string): { w: World; z: World['citizens'][0]; auto: { x: number; z: number } } {
    const w = new World(seed, 1);
    const auto = w.city.autos[0];
    const z = w.citizens[0];
    z.salud = 'zombi';
    return { w, z, auto };
  }

  /** Mantiene al zombi pegado a AUTOS.radioActivacion del auto en cada tick,
   * sin invadir el radio duro de colisión (RADIO_AUTO), y sin dejar rastro
   * de teletransporte (prevX/prevZ resetean junto con x/z, regla de CLAUDE.md). */
  function pegarAlAuto(z: World['citizens'][0], auto: { x: number; z: number }): void {
    z.x = auto.x + 2.5;
    z.z = auto.z;
    z.prevX = z.x;
    z.prevZ = z.z;
  }

  it('un zombi que pasa cerca de un auto, corrido suficientes ticks, dispara la alarma al menos una vez', () => {
    const { w, z, auto } = preparaCercaDeAuto('autos-1');
    let disparos = 0;
    let vistoRuidoDeAlarma = false;
    for (let t = 0; t < 3000; t++) {
      pegarAlAuto(z, auto);
      const antes = w.enfriamientoAuto[0];
      w.tick();
      // el cooldown se fija a AUTOS.enfriamientoTicks (900) en updateZombi,
      // pero el decaimiento de world.tick() ya le resta 1 en el MISMO tick
      // (corre después, en el mismo tick() en que se disparó) — por eso la
      // transición 0→(>0) es la señal de disparo, no comparar con el valor exacto.
      if (antes === 0 && w.enfriamientoAuto[0] > 0) {
        disparos++;
        // justo en el tick del disparo, el ruido de la alarma debe existir
        // (radio/posición del auto — más fuerte que un grito normal).
        if (w.ruidos.some((r) => r.radio === AUTOS.radioRuido && r.x === auto.x && r.z === auto.z)) {
          vistoRuidoDeAlarma = true;
        }
      }
    }
    expect(disparos).toBeGreaterThanOrEqual(1);
    expect(vistoRuidoDeAlarma).toBe(true);
  });

  it('el enfriamiento evita una segunda alarma del MISMO auto antes de enfriamientoTicks', () => {
    const { w, z, auto } = preparaCercaDeAuto('autos-1');
    let disparoTick = -1;
    let antes = w.enfriamientoAuto[0];
    for (let t = 0; t < 3000 && disparoTick < 0; t++) {
      pegarAlAuto(z, auto);
      antes = w.enfriamientoAuto[0];
      w.tick();
      if (antes === 0 && w.enfriamientoAuto[0] > 0) disparoTick = t;
    }
    expect(disparoTick).toBeGreaterThanOrEqual(0);
    // durante el resto de la ventana de enfriamiento, nunca vuelve a llegar a 0
    // (lo que haría falta para poder disparar de nuevo) — ninguna transición
    // 0→(>0) adicional debería verse dentro de esta ventana. Tras el tick del
    // disparo, enfriamientoAuto[0] ya quedó en enfriamientoTicks-1 (el propio
    // tick del disparo lo decrementa una vez); necesita enfriamientoTicks-1
    // decrementos MÁS para tocar 0 — nos quedamos un tick corto de eso.
    let disparosDeMas = 0;
    for (let t = 0; t < AUTOS.enfriamientoTicks - 2; t++) {
      pegarAlAuto(z, auto);
      const previo = w.enfriamientoAuto[0];
      w.tick();
      expect(w.enfriamientoAuto[0]).toBeGreaterThan(0);
      if (previo === 0 && w.enfriamientoAuto[0] > 0) disparosDeMas++;
    }
    expect(disparosDeMas).toBe(0);
  });
});
