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
}
