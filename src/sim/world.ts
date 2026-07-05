import { createRng, type Rng } from './rng';
import { generateCity, type CityLayout } from './cityGen';
import { spawnCitizens, updateCitizen } from './citizens';
import type { Citizen } from './types';
import { CITIZENS } from './config';

export class World {
  readonly seed: string;
  readonly city: CityLayout;
  readonly citizens: Citizen[];
  tickCount = 0;

  private readonly rng: Rng;

  constructor(seed: string, citizenCount: number = CITIZENS.count) {
    this.seed = seed;
    this.rng = createRng(`pandemia:${seed}`);
    this.city = generateCity(this.rng);
    this.citizens = spawnCitizens(this.rng, citizenCount);
  }

  tick(): void {
    for (const c of this.citizens) updateCitizen(c, this.rng);
    this.tickCount++;
  }

  /** Huella FNV del estado, para los tests de determinismo. */
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
    mix(this.tickCount);
    for (const c of this.citizens) {
      mix(Math.round(c.x * 100));
      mix(Math.round(c.z * 100));
      mix(c.state === 'caminando' ? 1 : 2);
    }
    return h >>> 0;
  }
}
