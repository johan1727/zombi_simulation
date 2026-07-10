import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { AGENTES, OBRERO, POLICIA } from '../src/sim/config';

describe('agentes', () => {
  it('nacen 4 agentes al final del array, sanos y sin familia', () => {
    const w = new World('agentes-1', 100);
    expect(w.citizens.length).toBe(104);
    const roles = w.citizens.slice(100).map((c) => c.rolAgente);
    expect(roles).toEqual(['policia', 'paramedico', 'megafono', 'obrero']);
    for (const a of w.citizens.slice(100)) {
      expect(a.esAgente).toBe(true);
      expect(a.salud).toBe('sano');
      expect(a.familia).toBe(-1);
    }
  });

  it('obedece órdenes de mover y llega', () => {
    const w = new World('agentes-2', 10);
    const a = w.agentes[0];
    const destinoX = a.x + 10;
    w.encolarOrden({ agente: a.id, tipo: 'mover', x: destinoX, z: a.z });
    for (let t = 0; t < 10 * 30; t++) w.tick();
    expect(Math.abs(a.x - destinoX)).toBeLessThan(1.5);
  });

  it('el policía elimina un zombi a distancia y el disparo mete ruido grande', () => {
    const w = new World('agentes-3', 10);
    const a = w.agentes[0];
    const z = w.citizens[0];
    z.salud = 'zombi';
    z.x = a.x + 8;
    z.z = a.z;
    z.prevX = z.x;
    z.prevZ = z.z;
    w.tick(); // reconstruir rejilla
    w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: z.x, z: z.z });
    w.tick();
    expect(z.salud).toBe('eliminado');
    expect(w.ruidos.some((r) => r.radio === POLICIA.radioRuido)).toBe(true);
    expect(a.cdHabilidad).toBeGreaterThan(0);
  });

  it('agente mordido cae y el paramédico lo revive a tiempo', () => {
    const w = new World('agentes-4', 10);
    const poli = w.agentes[0];
    const para = w.agentes[1];
    const z = w.citizens[0];
    z.salud = 'zombi';
    z.x = poli.x + 0.5;
    z.z = poli.z;
    z.prevX = z.x;
    z.prevZ = z.z;
    for (let t = 0; t < 5 * 30 && poli.salud === 'sano'; t++) w.tick();
    expect(poli.salud).toBe('caido');
    z.salud = 'eliminado'; // despejar
    para.x = poli.x + 1;
    para.z = poli.z;
    w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: poli.x, z: poli.z });
    w.tick();
    expect(poli.salud).toBe('sano');
  });

  it('agente caído sin rescate se transforma al agotar la ventana', () => {
    const w = new World('agentes-5', 5);
    const a = w.agentes[3];
    a.salud = 'caido';
    a.caidoTicks = 3;
    for (let t = 0; t < 5; t++) w.tick();
    expect(a.salud).toBe('zombi');
  });

  it('el obrero refuerza una puerta y gasta un uso', () => {
    const w = new World('agentes-6', 5);
    const a = w.agentes[3];
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    a.x = b.puerta!.x;
    a.z = b.puerta!.z;
    a.prevX = a.x;
    a.prevZ = a.z;
    w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: a.x, z: a.z });
    w.tick();
    expect(w.refuerzoPuerta[b.id]).toBe(OBRERO.refuerzo);
    expect(w.usosObrero).toBe(OBRERO.usos - 1);
  });

  it('el megáfono arrastra civiles al punto ordenado', () => {
    const w = new World('agentes-7', 30);
    const a = w.agentes[2];
    // colocar 5 civiles alrededor del agente
    for (let i = 0; i < 5; i++) {
      const c = w.citizens[i];
      c.x = a.x + (i % 2 === 0 ? 2 : -2);
      c.z = a.z + i * 0.5;
      c.prevX = c.x;
      c.prevZ = c.z;
    }
    w.tick();
    const destinoX = Math.min(a.x + 20, 260);
    w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: destinoX, z: a.z });
    w.tick();
    const forzados = w.citizens.slice(0, 5).filter((c) => c.forzadoTicks > 0).length;
    expect(forzados).toBeGreaterThanOrEqual(3);
    const antes = w.citizens[0].x;
    for (let t = 0; t < 60; t++) w.tick();
    expect(Math.abs(w.citizens[0].x - antes)).toBeGreaterThan(1);
  });

  it('DETERMINISMO CON ÓRDENES: misma semilla + mismo guion = mismo hash', () => {
    const guion = (w: World): void => {
      const a = w.agentes[0];
      if (w.tickCount === 30) w.encolarOrden({ agente: a.id, tipo: 'mover', x: a.x + 15, z: a.z });
      if (w.tickCount === 300) w.encolarOrden({ agente: a.id, tipo: 'habilidad', x: a.x, z: a.z });
      if (w.tickCount === 600) w.encolarOrden({ agente: w.agentes[2].id, tipo: 'habilidad', x: 100, z: 100 });
    };
    const a = new World('guion-1', 200);
    const b = new World('guion-1', 200);
    for (let t = 0; t < 900; t++) {
      guion(a);
      guion(b);
      a.tick();
      b.tick();
    }
    expect(a.hashState()).toBe(b.hashState());
  });

  it('los mundos SIN órdenes no cambian por la existencia de agentes ociosos', () => {
    const a = new World('quieto-1', 200);
    const b = new World('quieto-1', 200);
    for (let t = 0; t < 900; t++) {
      a.tick();
      b.tick();
    }
    expect(a.hashState()).toBe(b.hashState());
  });

  it('un caído no imanta al zombi: prefiere a la presa viva que se mueve', () => {
    const w = new World('iman-1', 10);
    const zombi = w.citizens[0];
    const presa = w.citizens[1];
    const caido = w.agentes[0];
    zombi.salud = 'zombi';
    zombi.x = caido.x + 1;
    zombi.z = caido.z;
    zombi.prevX = zombi.x;
    zombi.prevZ = zombi.z;
    caido.salud = 'caido';
    caido.caidoTicks = 30 * 30;
    presa.x = caido.x + 10;
    presa.z = caido.z;
    presa.prevX = presa.x;
    presa.prevZ = presa.z;
    // alejar al resto para que no interfiera
    for (let i = 2; i < 10; i++) {
      const c = w.citizens[i];
      c.x = 260;
      c.z = 350;
      c.prevX = c.x;
      c.prevZ = c.z;
    }
    const d0 = Math.sqrt((zombi.x - presa.x) ** 2 + (zombi.z - presa.z) ** 2);
    for (let t = 0; t < 60; t++) w.tick();
    const d1 = Math.sqrt((zombi.x - presa.x) ** 2 + (zombi.z - presa.z) ** 2);
    expect(d1).toBeLessThan(d0); // fue por la presa viva
    expect(caido.salud).toBe('caido'); // al caído nadie lo volvió a tocar
  });
});
