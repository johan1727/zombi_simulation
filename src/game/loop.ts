import { DT } from '../sim/config';
import type { World } from '../sim/world';

/** Máximo de tiempo real procesado por llamada (evita la espiral de la muerte). */
const MAX_ELAPSED = 0.25;

export function createStepper(tick: () => void): (elapsedSeconds: number) => number {
  let acc = 0;
  return (elapsedSeconds: number): number => {
    acc += Math.min(elapsedSeconds, MAX_ELAPSED);
    while (acc >= DT) {
      tick();
      acc -= DT;
    }
    return acc / DT;
  };
}

export function startLoop(
  world: World,
  render: (alpha: number) => void,
  onTick?: () => void
): void {
  const step = createStepper(() => {
    onTick?.();
    world.tick();
  });
  let last = performance.now();
  const frame = (now: number): void => {
    const alpha = step((now - last) / 1000);
    last = now;
    render(alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
