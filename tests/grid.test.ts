import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/sim/spatialGrid';

const p = (x: number, z: number, activo = true) => ({ x, z, activo });

describe('rejilla espacial', () => {
  it('encuentra vecinos dentro del radio y excluye lejanos', () => {
    const items = [p(10, 10), p(12, 10), p(40, 40), p(10.5, 10.5)];
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, (it) => it.activo);
    const res = g.queryCircle(10, 10, 3);
    expect([...res].sort()).toEqual([0, 1, 3]);
  });

  it('excluye inactivos', () => {
    const items = [p(10, 10), p(11, 10, false)];
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, (it) => it.activo);
    expect([...g.queryCircle(10, 10, 5)]).toEqual([0]);
  });

  it('el orden del resultado es determinista', () => {
    const items = Array.from({ length: 50 }, (_, i) => p(5 + (i % 10), 5 + Math.floor(i / 10)));
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, () => true);
    const a = [...g.queryCircle(9, 7, 6)];
    g.rebuild(items, () => true);
    const b = [...g.queryCircle(9, 7, 6)];
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('tolera coordenadas en el borde del mapa', () => {
    const items = [p(0, 0), p(271.5, 359.5)];
    const g = new SpatialGrid<(typeof items)[number]>();
    g.rebuild(items, () => true);
    expect([...g.queryCircle(0, 0, 2)]).toEqual([0]);
    expect([...g.queryCircle(271, 359, 2)]).toEqual([1]);
  });
});
