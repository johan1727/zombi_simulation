import { CITY_DEPTH, CITY_WIDTH, GRID_CELDA } from './config';

/**
 * Rejilla espacial uniforme y determinista (arreglos planos, orden fijo).
 * Reconstruir cada tick con rebuild(); queryCircle() devuelve índices.
 * ATENCIÓN: queryCircle reusa un scratch interno — no anidar consultas.
 */
export class SpatialGrid<T extends { x: number; z: number }> {
  readonly cols = Math.ceil(CITY_WIDTH / GRID_CELDA);
  readonly rows = Math.ceil(CITY_DEPTH / GRID_CELDA);

  private readonly cells: number[][] = Array.from(
    { length: this.cols * this.rows },
    () => []
  );
  private readonly scratch: number[] = [];
  private items: readonly T[] = [];

  rebuild(items: readonly T[], activo: (item: T) => boolean): void {
    for (const cell of this.cells) cell.length = 0;
    this.items = items;
    for (let i = 0; i < items.length; i++) {
      if (!activo(items[i])) continue;
      const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(items[i].x / GRID_CELDA)));
      const cz = Math.min(this.rows - 1, Math.max(0, Math.floor(items[i].z / GRID_CELDA)));
      this.cells[cz * this.cols + cx].push(i);
    }
  }

  /** Índices de items activos a distancia <= r de (x,z), orden determinista. */
  queryCircle(x: number, z: number, r: number): readonly number[] {
    const out = this.scratch;
    out.length = 0;
    const c0 = Math.max(0, Math.floor((x - r) / GRID_CELDA));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / GRID_CELDA));
    const r0 = Math.max(0, Math.floor((z - r) / GRID_CELDA));
    const r1 = Math.min(this.rows - 1, Math.floor((z + r) / GRID_CELDA));
    const r2 = r * r;
    for (let cz = r0; cz <= r1; cz++) {
      for (let cx = c0; cx <= c1; cx++) {
        for (const i of this.cells[cz * this.cols + cx]) {
          const it = this.items[i];
          if ((it.x - x) ** 2 + (it.z - z) ** 2 <= r2) out.push(i);
        }
      }
    }
    return out;
  }
}
