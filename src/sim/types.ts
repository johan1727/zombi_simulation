export type Personality =
  | 'lider'
  | 'cobarde'
  | 'valiente'
  | 'protector'
  | 'egoista'
  | 'imprudente';

export type CitizenState = 'quieto' | 'caminando';

export interface Citizen {
  id: number;
  name: string;
  personality: Personality;
  x: number;
  z: number;
  /** Posición del tick anterior; el render interpola entre prev y actual. */
  prevX: number;
  prevZ: number;
  /** Eje de marcha: exactamente uno de dirX/dirZ es ±1, el otro 0. */
  dirX: number;
  dirZ: number;
  /** Desvío perpendicular dentro del ancho de la calle. */
  laneOffset: number;
  state: CitizenState;
  /** Ticks restantes en estado 'quieto'. */
  idleTicks: number;
  /** id del último cruce donde ya decidió girar o seguir. */
  lastCrossing: number;
  salud: Salud;
  /** Ticks restantes de incubación (si salud === 'incubando'). */
  incubacionTicks: number;
  animo: Animo;
  /** Ticks sin ver zombis (para calmarse). */
  animoTicks: number;
  /** id del edificio en el que se refugia, o -1. */
  dentroDe: number;
  /** Piso actual dentro del edificio (0 = planta baja). Solo válido si dentroDe >= 0. */
  piso: number;
  /** Piso al que quiere llegar (instinto de esconderse arriba). */
  pisoObjetivo: number;
  /** Ticks acumulados subiendo/bajando la escalera. */
  escaleraTicks: number;
  /** Enfriamiento de mordida (solo zombis). */
  cdMordida: number;
}

export type Salud = 'sano' | 'incubando' | 'zombi' | 'eliminado';
export type Animo = 'tranquilo' | 'panico';

/** Mancha de pintura en el suelo (la "sangre" del juego). */
export interface Splat {
  x: number;
  z: number;
  /** 0..1: elige color de la paleta, rotación y tamaño. */
  tono: number;
}

/** Fuente de ruido temporal (gritos, brechas). Atrae zombis y contagia pánico. */
export interface Ruido {
  x: number;
  z: number;
  radio: number;
  ticks: number;
}
