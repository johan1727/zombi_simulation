import type { Personality } from './types';

/** Ticks de simulación por segundo. La sim SIEMPRE avanza a este paso fijo. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const CITY = {
  blocksX: 6,
  blocksY: 8,
  blockSize: 36, // metros por manzana
  streetWidth: 8, // metros de calle
} as const;

/** Acera dentro de la manzana (única fuente de verdad; cityGen y collision la importan). */
export const MARGEN_ACERA = 2;

/**
 * 16 direcciones unitarias precalculadas como LITERALES.
 * Las funciones trigonométricas (coseno, seno) no son idénticas bit a bit
 * entre motores JS; esta tabla sí.
 */
export const DIRECCIONES: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.9239, 0.3827], [0.7071, 0.7071], [0.3827, 0.9239],
  [0, 1], [-0.3827, 0.9239], [-0.7071, 0.7071], [-0.9239, 0.3827],
  [-1, 0], [-0.9239, -0.3827], [-0.7071, -0.7071], [-0.3827, -0.9239],
  [0, -1], [0.3827, -0.9239], [0.7071, -0.7071], [0.9239, -0.3827],
];

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
  velocidad: 3.4, // m/s persiguiendo (estilo Guerra Mundial Z)
  velocidadErrante: 0.9,
  radioVision: 15,
  enfriamientoMordidaTicks: 6,
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
export const PROB_PANICO_POR_GRITO: Record<Personality, number> = {
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
  radioPuerta: 4, // m alrededor de la puerta donde los zombis presionan
  presionPorZombi: 2, // presión por zombi por tick
  alivioPorTick: 2, // la presión decae sin zombis
  // ADVERTENCIA: el paisaje de balance es NO monotónico (caótico). Cualquier
  // cambio aquí — o en enfriamientoMordidaTicks / presionPorZombi — exige
  // re-correr tests/balance.test.ts completo. Datos vigentes (régimen de
  // asedio a la puerta): docs/superpowers/reports/2026-07-09-recalibracion-plan3-task10.md
  resistencia: 50, // presión para brecha
  ruidoCadaTicks: 90, // los refugiados hacen ruido periódico
  ruidoRadio: 10,
  ruidoTicks: 30,
} as const;

// ——— Plan 3: refugio y sociedad ———

export const INTERIOR = {
  alturaPiso: 3, // m por piso (render y = piso * alturaPiso)
  azotea: 2, // índice del piso azotea (0 = planta baja, 1 = piso, 2 = azotea)
  escaleraLado: 5, // m del cuadro de escalera
  anchoPuerta: 3, // m del hueco de la puerta
  escaleraTicks: 45, // ticks para cambiar de piso (1.5 s)
} as const;

export const INTERIOR_VISION = 12; // m de vista dentro (sin paredes internas)

export const PELIGRO = {
  celda: 16, // m por celda de la rejilla gruesa de memoria colectiva
  porMuerte: 30,
  maximo: 250,
  decaimientoCadaTicks: 300,
} as const;

export const LIDER = {
  radio: 8, // m para detectar líder/pánicos cercanos
  factorCalma: 0.5, // multiplicador a la probabilidad de contagio de pánico
  divisorCalmarse: 4, // divide ticksCalmarse cuando hay líder cerca
  panicosParaGuiar: 2, // pánicos cercanos mínimos para que el líder guíe
  alcanceGuia: 50, // m máximos para buscar puerta al guiar
} as const;
