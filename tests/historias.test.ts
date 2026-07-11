import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { componerHistorias } from '../src/ui/historias';

/** Dos ids de edificio jugable distintos, para las historias de brecha. */
function dosJugables(w: World): [number, number] {
  const jugables = w.city.buildings.filter((b) => b.kind === 'jugable');
  expect(jugables.length).toBeGreaterThanOrEqual(2);
  return [jugables[0].id, jugables[1].id];
}

describe('componerHistorias', () => {
  it('brecha: prioriza la de más ocupantes aunque su tick sea más tardío', () => {
    const w = new World('historias-1', 10);
    const [b1, b2] = dosJugables(w);
    w.hitos.push({ tick: 500, tipo: 'brecha', a: 3, b: b1 });
    w.hitos.push({ tick: 100, tipo: 'brecha', a: 12, b: b2 });
    const historias = componerHistorias(w);
    const iMenor = historias.findIndex((h) => h.includes(`calle ${b1}`));
    const iMayor = historias.findIndex((h) => h.includes(`calle ${b2}`));
    expect(iMayor).toBeGreaterThanOrEqual(0);
    expect(iMenor).toBeGreaterThanOrEqual(0);
    expect(iMayor).toBeLessThan(iMenor);
    expect(historias[iMayor]).toBe(`El refugio de la calle ${b2} cayó con 12 personas dentro.`);
  });

  it('brecha con un solo ocupante usa singular', () => {
    const w = new World('historias-1b', 10);
    const [b1] = dosJugables(w);
    w.hitos.push({ tick: 10, tipo: 'brecha', a: 1, b: b1 });
    const historias = componerHistorias(w);
    expect(historias).toContain(`El refugio de la calle ${b1} cayó con 1 persona dentro.`);
  });

  it('caida_agente sin rescate posterior genera la historia; con rescate NO', () => {
    const w = new World('historias-2', 10);
    const policia = w.agentes[0];
    const paramedico = w.agentes[1];
    w.hitos.push({ tick: 10, tipo: 'caida_agente', a: policia.id, b: -1 });
    const sinRescate = componerHistorias(w);
    expect(sinRescate).toContain(`El policía ${policia.name.split(' ')[0]} cayó… y nadie llegó a tiempo.`);

    w.hitos.push({ tick: 20, tipo: 'rescate', a: paramedico.id, b: policia.id });
    const conRescate = componerHistorias(w);
    expect(conRescate).not.toContain(`El policía ${policia.name.split(' ')[0]} cayó… y nadie llegó a tiempo.`);
    expect(conRescate).toContain(
      `La paramédico ${paramedico.name.split(' ')[0]} revivió a ${policia.name.split(' ')[0]} con la horda encima.`
    );
  });

  it('un segundo caida_agente del mismo agente, ya sin rescate, SÍ genera historia', () => {
    const w = new World('historias-2b', 10);
    const policia = w.agentes[0];
    const paramedico = w.agentes[1];
    w.hitos.push({ tick: 10, tipo: 'caida_agente', a: policia.id, b: -1 });
    w.hitos.push({ tick: 20, tipo: 'rescate', a: paramedico.id, b: policia.id });
    w.hitos.push({ tick: 30, tipo: 'caida_agente', a: policia.id, b: -1 });
    const historias = componerHistorias(w);
    expect(historias).toContain(`El policía ${policia.name.split(' ')[0]} cayó… y nadie llegó a tiempo.`);
  });

  it('transformacion_cabeza: solo si queda algún familiar vivo', () => {
    const conFamiliaViva = new World('historias-3', 10);
    conFamiliaViva.citizens[0].familia = 0;
    conFamiliaViva.citizens[0].cabezaFamilia = 0;
    conFamiliaViva.citizens[0].familiares = [1];
    conFamiliaViva.citizens[1].familia = 0;
    conFamiliaViva.citizens[1].cabezaFamilia = 0;
    conFamiliaViva.citizens[1].familiares = [0];
    conFamiliaViva.citizens[1].salud = 'sano';
    conFamiliaViva.hitos.push({ tick: 5, tipo: 'transformacion_cabeza', a: 0, b: -1 });
    const nombre = conFamiliaViva.citizens[0].name.split(' ')[0];
    expect(componerHistorias(conFamiliaViva)).toContain(
      `${nombre} buscaba a su familia cuando dejó de ser ${nombre}.`
    );

    const sinFamiliaViva = new World('historias-3', 10);
    sinFamiliaViva.citizens[0].familia = 0;
    sinFamiliaViva.citizens[0].cabezaFamilia = 0;
    sinFamiliaViva.citizens[0].familiares = [1];
    sinFamiliaViva.citizens[1].familia = 0;
    sinFamiliaViva.citizens[1].cabezaFamilia = 0;
    sinFamiliaViva.citizens[1].familiares = [0];
    sinFamiliaViva.citizens[1].salud = 'eliminado';
    sinFamiliaViva.hitos.push({ tick: 5, tipo: 'transformacion_cabeza', a: 0, b: -1 });
    expect(componerHistorias(sinFamiliaViva)).not.toContain(
      `${nombre} buscaba a su familia cuando dejó de ser ${nombre}.`
    );
  });

  it('protector: historia solo si termina a menos de 5 m de un familiar vivo', () => {
    const cerca = new World('historias-4', 10);
    cerca.citizens[2].personality = 'protector';
    cerca.citizens[2].familia = 1;
    cerca.citizens[2].familiares = [3];
    cerca.citizens[3].familia = 1;
    cerca.citizens[3].familiares = [2];
    cerca.citizens[3].salud = 'sano';
    cerca.citizens[2].x = 10;
    cerca.citizens[2].z = 10;
    cerca.citizens[3].x = 12;
    cerca.citizens[3].z = 10;
    const nombre = cerca.citizens[2].name.split(' ')[0];
    expect(componerHistorias(cerca)).toContain(`${nombre} nunca soltó a los suyos.`);

    const lejos = new World('historias-4', 10);
    lejos.citizens[2].personality = 'protector';
    lejos.citizens[2].familia = 1;
    lejos.citizens[2].familiares = [3];
    lejos.citizens[3].familia = 1;
    lejos.citizens[3].familiares = [2];
    lejos.citizens[3].salud = 'sano';
    lejos.citizens[2].x = 10;
    lejos.citizens[2].z = 10;
    lejos.citizens[3].x = 50;
    lejos.citizens[3].z = 50;
    expect(componerHistorias(lejos)).not.toContain(`${nombre} nunca soltó a los suyos.`);
  });

  it('protector: sin historia si el protector o el familiar ya son zombis', () => {
    const protectorZombi = new World('historias-4', 10);
    protectorZombi.citizens[2].personality = 'protector';
    protectorZombi.citizens[2].familia = 1;
    protectorZombi.citizens[2].familiares = [3];
    protectorZombi.citizens[2].salud = 'zombi';
    protectorZombi.citizens[3].familia = 1;
    protectorZombi.citizens[3].familiares = [2];
    protectorZombi.citizens[3].salud = 'sano';
    protectorZombi.citizens[2].x = 10;
    protectorZombi.citizens[2].z = 10;
    protectorZombi.citizens[3].x = 12;
    protectorZombi.citizens[3].z = 10;
    const nombre2 = protectorZombi.citizens[2].name.split(' ')[0];
    expect(componerHistorias(protectorZombi)).not.toContain(`${nombre2} nunca soltó a los suyos.`);

    const familiarZombi = new World('historias-4', 10);
    familiarZombi.citizens[2].personality = 'protector';
    familiarZombi.citizens[2].familia = 1;
    familiarZombi.citizens[2].familiares = [3];
    familiarZombi.citizens[2].salud = 'sano';
    familiarZombi.citizens[3].familia = 1;
    familiarZombi.citizens[3].familiares = [2];
    familiarZombi.citizens[3].salud = 'zombi';
    familiarZombi.citizens[2].x = 10;
    familiarZombi.citizens[2].z = 10;
    familiarZombi.citizens[3].x = 12;
    familiarZombi.citizens[3].z = 10;
    const nombre3 = familiarZombi.citizens[2].name.split(' ')[0];
    expect(componerHistorias(familiarZombi)).not.toContain(`${nombre3} nunca soltó a los suyos.`);
  });

  it('respeta el tope `max` y es determinista (mismo orden en llamadas repetidas)', () => {
    const w = new World('historias-5', 10);
    const jugables = w.city.buildings.filter((b) => b.kind === 'jugable');
    for (let i = 0; i < 6 && i < jugables.length; i++) {
      w.hitos.push({ tick: i * 10, tipo: 'brecha', a: i + 1, b: jugables[i].id });
    }
    const a = componerHistorias(w, 4);
    const b = componerHistorias(w, 4);
    expect(a.length).toBe(4);
    expect(a).toEqual(b);
  });

  it('max=4 por defecto', () => {
    const w = new World('historias-6', 10);
    const jugables = w.city.buildings.filter((b) => b.kind === 'jugable');
    for (let i = 0; i < 6 && i < jugables.length; i++) {
      w.hitos.push({ tick: i * 10, tipo: 'brecha', a: i + 1, b: jugables[i].id });
    }
    expect(componerHistorias(w).length).toBeLessThanOrEqual(4);
  });
});
