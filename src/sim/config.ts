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

// ——— Plan 2: el brote ———

export const INFECCION = {
  pacienteCeroTick: 5 * TICK_RATE, // el brote empieza a los 5 segundos
  radioMordida: 1.2, // m
  incubacionMinTicks: 5 * TICK_RATE,
  incubacionMaxTicks: 15 * TICK_RATE,
  velocidadIncubando: 0.8, // multiplicador al caminar
} as const;

export const ZOMBIS = {
  velocidad: 3.8, // m/s persiguiendo (estilo Guerra Mundial Z)
  velocidadErrante: 0.9,
  radioVision: 15,
  enfriamientoMordidaTicks: 12,
  probCambiarRumbo: 0.02, // por tick, errando sin presa
} as const;

export const PANICO = {
  radioVerZombi: 15,
  radioGrito: 12,
  duracionGritoTicks: TICK_RATE,
  velocidadHuida: 2.5, // m/s (más lento que un zombi cazando)
  ticksCalmarse: 10 * TICK_RATE,
} as const;

/** Probabilidad POR TICK de entrar en pánico al oír un grito, por personalidad. */
export const PROB_PANICO_POR_GRITO: Record<string, number> = {
  cobarde: 0.08,
  protector: 0.04,
  egoista: 0.04,
  imprudente: 0.01,
  valiente: 0.01,
  lider: 0.005,
};

export const COMBATE = {
  radioPelea: 2.5,
  humanosParaGanar: 3,
  probInfeccionAlGanar: 0.25,
} as const;

export const REFUGIO = {
  radioEntrar: 2.5,
  capacidad: 40,
} as const;

export const GRID_CELDA = 4; // m por celda de la rejilla espacial

export const ASEDIO = {
  radio: 10, // m alrededor del edificio donde los zombis presionan
  presionPorZombi: 1, // presión por zombi por tick
  alivioPorTick: 2, // la presión decae sin zombis
  resistencia: 110, // presión para brecha
  ruidoCadaTicks: 90, // los refugiados hacen ruido periódico
  ruidoRadio: 10,
  ruidoTicks: 30,
} as const;
