import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { AGENTES, HERIDAS, OBRERO, POLICIA } from '../src/sim/config';
import { resolverCombates } from '../src/sim/combate';

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

  it('el paramédico amputa un brazo dentro de la ventana y detiene la infección', () => {
    const w = new World('amputa-1', 5);
    const para = w.agentes[1];
    const c = w.citizens[0];
    c.salud = 'incubando';
    c.zonaHerida = 'brazo';
    c.ventanaAmputarTicks = HERIDAS.ventanaAmputarTicks;
    c.x = para.x + 1;
    c.z = para.z;
    c.prevX = c.x;
    c.prevZ = c.z;
    w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: c.x, z: c.z });
    w.tick();
    expect(c.brazoAmputado).toBe(true);
    expect(c.salud).toBe('sano');
    expect(c.ventanaAmputarTicks).toBe(0);
  });

  it('la amputación no dispara si la ventana ya se cerró', () => {
    const w = new World('amputa-2', 5);
    const para = w.agentes[1];
    const c = w.citizens[0];
    c.salud = 'incubando';
    c.zonaHerida = 'brazo';
    c.ventanaAmputarTicks = 0; // ya se cerró
    c.x = para.x + 1;
    c.z = para.z;
    c.prevX = c.x;
    c.prevZ = c.z;
    w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: c.x, z: c.z });
    w.tick();
    expect(c.brazoAmputado).toBe(false);
  });

  it('el paramédico no amputa a un zombi ni a un eliminado con ventana residual', () => {
    const w = new World('amputa-4', 5);
    const para = w.agentes[1];
    const zombi = w.citizens[0];
    zombi.salud = 'zombi';
    zombi.zonaHerida = 'brazo';
    zombi.ventanaAmputarTicks = HERIDAS.ventanaAmputarTicks; // ventana congelada (agente sin rescatar, ver revisión P5-T2)
    zombi.x = para.x + 1;
    zombi.z = para.z;
    zombi.prevX = zombi.x;
    zombi.prevZ = zombi.z;
    w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: zombi.x, z: zombi.z });
    w.tick();
    expect(zombi.brazoAmputado).toBe(false);
    expect(zombi.ventanaAmputarTicks).toBe(HERIDAS.ventanaAmputarTicks);
    expect(w.hitos.some((h) => h.tipo === 'amputacion')).toBe(false);
  });

  it('un agente caído con brazo mordido: primera orden amputa, segunda (tras el enfriamiento) revive', () => {
    const w = new World('amputa-5', 5);
    const para = w.agentes[1];
    const caido = w.agentes[0];
    caido.salud = 'caido';
    caido.caidoTicks = AGENTES.ventanaCaidoTicks;
    caido.zonaHerida = 'brazo';
    caido.ventanaAmputarTicks = HERIDAS.ventanaAmputarTicks;
    caido.x = para.x + 1;
    caido.z = para.z;
    caido.prevX = caido.x;
    caido.prevZ = caido.z;

    w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: caido.x, z: caido.z });
    w.tick();
    expect(caido.brazoAmputado).toBe(true);
    expect(caido.ventanaAmputarTicks).toBe(0);
    expect(caido.salud).toBe('caido'); // amputar no revive: sigue en el suelo

    for (let t = 0; t < POLICIA.cooldownTicks; t++) w.tick(); // esperar el enfriamiento del paramédico
    w.encolarOrden({ agente: para.id, tipo: 'habilidad', x: caido.x, z: caido.z });
    w.tick();
    expect(caido.salud).toBe('sano'); // segunda orden: ya no hay ventana que amputar, revive normal
  });

  it('una orden "control" con veloz=true mueve al agente mas rapido que sin el flag', () => {
    // Comparación de distancia recorrida desde el mismo punto de partida
    // (misma semilla ⇒ misma posición inicial en ambos mundos), patrón de
    // heridas.test.ts/panico.test.ts (sqrt(dx*dx+dz*dz), nunca Math.hypot).
    // Se prefiere esto a la variante del brief (que creaba mundos extra solo
    // para leer x0/dejaba una variable `dLento` sin usar) por más clara.
    const lento = new World('sprint-1', 5);
    const rapido = new World('sprint-1', 5);
    const aLento = lento.agentes[0];
    const aRapido = rapido.agentes[0];
    const x0 = aLento.x;
    const z0 = aLento.z;
    for (let t = 0; t < 30; t++) {
      lento.encolarOrden({ agente: aLento.id, tipo: 'control', x: aLento.x + 10, z: aLento.z });
      rapido.encolarOrden({ agente: aRapido.id, tipo: 'control', x: aRapido.x + 10, z: aRapido.z, veloz: true });
      lento.tick();
      rapido.tick();
    }
    const distLento = Math.sqrt((aLento.x - x0) ** 2 + (aLento.z - z0) ** 2);
    const distRapido = Math.sqrt((aRapido.x - x0) ** 2 + (aRapido.z - z0) ** 2);
    expect(distRapido).toBeGreaterThan(distLento * 1.3); // holgado bajo el factor 1.6 real
  });

  it('una orden "mover" (modo director) ignora veloz: nunca hay sprint fuera de posesion', () => {
    const w = new World('sprint-2', 5);
    const a = w.agentes[0];
    w.encolarOrden({ agente: a.id, tipo: 'mover', x: a.x + 10, z: a.z, veloz: true });
    w.tick();
    expect(a.corriendoOrden).toBe(false);
  });

  it('un agente poseido que camina hacia la puerta de un edificio jugable entra solo', () => {
    const w = new World('entrada-agente-1', 5);
    const a = w.agentes[0];
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    const p = b.puerta!;
    const fuera: ReadonlyArray<readonly [number, number]> = [[-3, 0], [0, -3], [3, 0], [0, 3]];
    a.x = p.x + fuera[p.lado][0];
    a.z = p.z + fuera[p.lado][1];
    a.prevX = a.x;
    a.prevZ = a.z;
    for (let t = 0; t < 60; t++) {
      w.encolarOrden({ agente: a.id, tipo: 'control', x: p.x, z: p.z });
      w.tick();
      if (a.dentroDe >= 0) break;
    }
    expect(a.dentroDe).toBe(b.id);
  });

  it('una orden "mover" (modo director) NUNCA hace entrar a un agente a un edificio, aunque pase cerca de la puerta', () => {
    const w = new World('entrada-agente-2', 5);
    const a = w.agentes[0];
    const b = w.city.buildings.find((x) => x.kind === 'jugable')!;
    const p = b.puerta!;
    const fuera: ReadonlyArray<readonly [number, number]> = [[-3, 0], [0, -3], [3, 0], [0, 3]];
    a.x = p.x + fuera[p.lado][0];
    a.z = p.z + fuera[p.lado][1];
    a.prevX = a.x;
    a.prevZ = a.z;
    for (let t = 0; t < 60; t++) {
      w.encolarOrden({ agente: a.id, tipo: 'mover', x: p.x, z: p.z });
      w.tick();
    }
    expect(a.dentroDe).toBe(-1);
  });

  it('un ciudadano con brazo amputado no cuenta como luchador', () => {
    const w = new World('amputa-3', 6);
    const zombi = w.citizens[0];
    zombi.salud = 'zombi';
    zombi.x = 50;
    zombi.z = 4;
    zombi.prevX = 50;
    zombi.prevZ = 4;
    // 3 civiles cerca, uno de ellos manco y 'valiente' — el manco no debe contar,
    // así que sin OTRO valiente sano el grupo no debe vencer al zombi.
    const posiciones: ReadonlyArray<readonly [number, number]> = [[52, 4], [48, 5], [50, 6]];
    for (let i = 1; i <= 3; i++) {
      const c = w.citizens[i];
      c.x = posiciones[i - 1][0];
      c.z = posiciones[i - 1][1];
      c.prevX = c.x;
      c.prevZ = c.z;
      c.personality = 'cobarde';
    }
    w.citizens[1].personality = 'valiente';
    w.citizens[1].brazoAmputado = true;
    w.grid.rebuild(w.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
    resolverCombates(w);
    expect(zombi.salud).toBe('zombi'); // sin un valiente ÚTIL, el grupo no gana
  });
});
