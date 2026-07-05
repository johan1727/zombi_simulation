/** Ticks de simulación por segundo. La sim SIEMPRE avanza a este paso fijo. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const CITY = {
  blocksX: 6,
  blocksY: 8,
  blockSize: 36, // metros por manzana
  streetWidth: 8, // metros de calle
} as const;

/** Periodo de la retícula: manzana + calle. */
export const CITY_PERIOD = CITY.blockSize + CITY.streetWidth;
/** El mapa termina en calle por ambos lados. */
export const CITY_WIDTH = CITY.blocksX * CITY_PERIOD + CITY.streetWidth;
export const CITY_DEPTH = CITY.blocksY * CITY_PERIOD + CITY.streetWidth;

export const CITIZENS = {
  count: 800,
  walkSpeed: 1.4, // m/s
  idleMin: 2, // segundos quieto (mínimo)
  idleMax: 8, // segundos quieto (máximo)
} as const;
