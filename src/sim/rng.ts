export type Rng = {
  /** Número en [0, 1). */
  next(): number;
  /** Entero en [min, max], ambos inclusive. */
  int(min: number, max: number): number;
  /** Elemento al azar del arreglo. */
  pick<T>(arr: readonly T[]): T;
  /** true con probabilidad p. */
  chance(p: number): boolean;
};

/** FNV-1a de 32 bits, sin signo. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG mulberry32: rápido, determinista, suficiente para gameplay. */
export function createRng(seed: number | string): Rng {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}
