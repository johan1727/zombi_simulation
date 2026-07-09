import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROHIBIDOS = [
  'Math.random', 'Date.now', 'performance.now',
  'Math.hypot', 'Math.cos', 'Math.sin', 'Math.tan', 'Math.atan2',
  "from 'three'",
];

describe('determinismo portable en src/sim', () => {
  const dir = join(__dirname, '..', 'src', 'sim');
  for (const archivo of readdirSync(dir)) {
    it(`${archivo} no usa APIs no portables`, () => {
      const codigo = readFileSync(join(dir, archivo), 'utf-8');
      for (const patron of PROHIBIDOS) {
        expect(codigo.includes(patron), `${archivo} contiene ${patron}`).toBe(false);
      }
    });
  }
});
