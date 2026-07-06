import { createRng, type Rng } from './rng';
import { generateCity, type CityLayout } from './cityGen';
import { spawnCitizens } from './citizens';
import type { Citizen, Ruido, Splat } from './types';
import { CITIZENS, INFECCION } from './config';
import { SpatialGrid } from './spatialGrid';
import { actualizarIncubacion, elegirPacienteCero, infectar } from './infeccion';
import { updateZombi } from './zombis';
import { updateHumano } from './panico';

export class World {
  readonly seed: string;
  readonly city: CityLayout;
  readonly citizens: Citizen[];
  tickCount = 0;

  /** Streams de RNG por subsistema: cada sistema usa SOLO el suyo. */
  readonly rngCiudadanos: Rng;
  readonly rngInfeccion: Rng;
  readonly rngZombis: Rng;
  readonly rngPanico: Rng;
  readonly rngCombate: Rng;

  readonly splats: Splat[] = [];
  readonly ruidos: Ruido[] = [];
  readonly ocupantes: number[];
  readonly brecha: boolean[];
  readonly grid = new SpatialGrid<Citizen>();

  constructor(seed: string, citizenCount: number = CITIZENS.count) {
    this.seed = seed;
    const rngCiudad = createRng(`pandemia:${seed}:ciudad`);
    this.rngCiudadanos = createRng(`pandemia:${seed}:ciudadanos`);
    this.rngInfeccion = createRng(`pandemia:${seed}:infeccion`);
    this.rngZombis = createRng(`pandemia:${seed}:zombis`);
    this.rngPanico = createRng(`pandemia:${seed}:panico`);
    this.rngCombate = createRng(`pandemia:${seed}:combate`);
    this.city = generateCity(rngCiudad);
    this.citizens = spawnCitizens(this.rngCiudadanos, citizenCount);
    this.ocupantes = this.city.buildings.map(() => 0);
    this.brecha = this.city.buildings.map(() => false);
  }

  get stats(): { vivos: number; zombis: number } {
    let vivos = 0;
    let zombis = 0;
    for (const c of this.citizens) {
      if (c.salud === 'zombi') zombis++;
      else if (c.salud !== 'eliminado') vivos++;
    }
    return { vivos, zombis };
  }

  tick(): void {
    if (this.tickCount === INFECCION.pacienteCeroTick) {
      infectar(this.citizens[elegirPacienteCero(this.citizens, this.rngInfeccion)], this.rngInfeccion);
    }
    this.grid.rebuild(this.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
    for (const c of this.citizens) {
      if (c.salud === 'eliminado') { c.prevX = c.x; c.prevZ = c.z; continue; }
      if (c.salud === 'zombi') {
        updateZombi(c, this);
      } else {
        updateHumano(c, this);
        actualizarIncubacion(c, this);
      }
    }
    // decaimiento de ruidos (compactación estable, sin filter para no asignar)
    let w = 0;
    for (const r of this.ruidos) {
      r.ticks--;
      if (r.ticks > 0) this.ruidos[w++] = r;
    }
    this.ruidos.length = w;
    this.tickCount++;
  }

  /**
   * Huella FNV del estado para los tests de determinismo.
   * Mezcla 24 bits por valor: suficiente hasta mapas de ~1.6 km.
   */
  hashState(): number {
    let h = 0x811c9dc5;
    const mix = (n: number): void => {
      h ^= n & 0xff;
      h = Math.imul(h, 0x01000193);
      h ^= (n >>> 8) & 0xff;
      h = Math.imul(h, 0x01000193);
      h ^= (n >>> 16) & 0xff;
      h = Math.imul(h, 0x01000193);
    };
    const SALUD = { sano: 1, incubando: 2, zombi: 3, eliminado: 4 } as const;
    mix(this.tickCount);
    for (const c of this.citizens) {
      mix(Math.round(c.x * 100));
      mix(Math.round(c.z * 100));
      mix(SALUD[c.salud]);
      mix(c.animo === 'panico' ? 2 : 1);
      mix(c.dentroDe + 1);
    }
    return h >>> 0;
  }
}
