import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';

describe('familias', () => {
  it('los grupos comparten apellido y tienen 2–4 miembros', () => {
    const w = new World('familia-1', 400);
    const familias = new globalThis.Map<number, string[]>();
    for (const c of w.citizens) {
      if (c.familia < 0) continue;
      const lista = familias.get(c.familia) ?? [];
      lista.push(c.name.split(' ')[1]);
      familias.set(c.familia, lista);
    }
    expect(familias.size).toBeGreaterThan(10);
    for (const apellidos of familias.values()) {
      expect(apellidos.length).toBeGreaterThanOrEqual(2);
      expect(apellidos.length).toBeLessThanOrEqual(4);
      expect(new globalThis.Set(apellidos).size).toBe(1);
    }
  });

  it('las familias caminan juntas (cohesión emergente)', () => {
    const w = new World('familia-2', 400);
    for (let t = 0; t < 30 * 30; t++) w.tick();
    let distancias = 0;
    let pares = 0;
    for (const c of w.citizens) {
      if (c.cabezaFamilia === c.id || c.dentroDe >= 0) continue;
      const cabeza = w.citizens[c.cabezaFamilia];
      if (cabeza.dentroDe >= 0 || cabeza.salud === 'eliminado') continue;
      distancias += Math.sqrt((c.x - cabeza.x) ** 2 + (c.z - cabeza.z) ** 2);
      pares++;
    }
    expect(pares).toBeGreaterThan(0);
    expect(distancias / pares).toBeLessThan(8); // pegados a su cabeza de familia
  });

  it('el protector en pánico vuelve por su familiar lejano', () => {
    const w = new World('familia-3', 400);
    const protector = w.citizens.find((c) => c.personality === 'protector' && c.familia >= 0)!;
    expect(protector).toBeDefined();
    const familiar = w.citizens[protector.familiares[0]];
    // separarlos 15 m y ponerle pánico sin zombis cerca; si el protector nació
    // cerca del borde derecho del mapa el clamp original (Math.min(x+15, 270))
    // comprimía la separación a <1 m y volvía el assert trivial/inestable —
    // se aleja hacia el lado con espacio en vez de recortar contra el borde.
    // También: la familia puede tener 2-4 miembros; "el familiar vivo más
    // cercano" del protector podría no ser familiares[0] si otro sigue junto
    // a él tras el spawn (a <4 m, fuera del rango 4–30 m válido) — se mueven
    // TODOS los familiares al mismo punto para que cualquiera que elija el
    // algoritmo esté a la distancia que el test espera medir.
    const destinoX = protector.x + 15 <= 270 ? protector.x + 15 : protector.x - 15;
    for (const j of protector.familiares) {
      const fam = w.citizens[j];
      fam.x = destinoX;
      fam.z = protector.z;
      fam.prevX = fam.x;
      fam.prevZ = fam.z;
    }
    protector.animo = 'panico';
    protector.animoTicks = 0;
    const d0 = Math.sqrt((protector.x - familiar.x) ** 2 + (protector.z - familiar.z) ** 2);
    w.tick();
    const d1 = Math.sqrt((protector.x - familiar.x) ** 2 + (protector.z - familiar.z) ** 2);
    expect(d1).toBeLessThan(d0); // se acerca, no huye
  });

  it('gemelos deterministas con familias', () => {
    const a = new World('familia-4', 300);
    const b = new World('familia-4', 300);
    for (let t = 0; t < 900; t++) { a.tick(); b.tick(); }
    expect(a.hashState()).toBe(b.hashState());
  });
});
