export type Personality =
  | 'lider'
  | 'cobarde'
  | 'valiente'
  | 'protector'
  | 'egoista'
  | 'imprudente';

export type CitizenState = 'quieto' | 'caminando';

/** Rol de un agente del jugador; '' para civiles (no agentes). */
export type RolAgente = '' | 'policia' | 'paramedico' | 'megafono' | 'obrero';

/** Orden del jugador; entra SOLO por world.encolarOrden. */
export interface OrdenJugador {
  /** Índice del agente en world.citizens. */
  agente: number;
  tipo: 'mover' | 'habilidad' | 'control';
  x: number;
  z: number;
}

/** Evento notable para historias/audio/HUD. El texto lo compone la UI. */
export interface Hito {
  tick: number;
  tipo: 'disparo' | 'rescate' | 'megafono' | 'refuerzo' | 'caida_agente' | 'brecha' | 'transformacion_cabeza' | 'amputacion';
  /**
   * índice del protagonista. CASO ESPECIAL 'brecha': no hay protagonista
   * (siempre viene de un edificio), así que aquí se reaprovecha para guardar
   * los OCUPANTES humanos que había dentro en el instante de la brecha
   * (`world.ocupantes[b]` en ese tick) — historias.ts lo necesita para
   * dramatizar y ese dato no sobrevive al tick siguiente (los ocupantes
   * huyen o mueren). Ver src/sim/asedio.ts.
   */
  a: number;
  b: number; // índice/edificio secundario, -1 si no aplica
}

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
  /** id de familia (−1 = sin familia; va solo). */
  familia: number;
  /** id (menor) del miembro que hace de cabeza; él mismo si va solo. */
  cabezaFamilia: number;
  /** ids de los demás miembros de la familia (estático, llenado al nacer). */
  familiares: number[];
  /** true si este citizen es un agente del jugador (no civil). */
  esAgente: boolean;
  /** rol del agente; '' si no es agente. */
  rolAgente: RolAgente;
  /** Destino de la orden de mover activa; NaN = sin orden. */
  ordenX: number;
  ordenZ: number;
  /** Ticks restantes antes de que un agente caído se transforme en zombi. */
  caidoTicks: number;
  /** Enfriamiento de habilidad (solo agentes). */
  cdHabilidad: number;
  /** Ticks restantes en los que este incubando aparece marcado (paramédico). */
  diagnosticadoTicks: number;
  /** Punto al que el megáfono obliga a caminar; NaN = sin orden forzada. */
  forzadoX: number;
  forzadoZ: number;
  /** Ticks restantes bajo el efecto del megáfono. */
  forzadoTicks: number;
  /** Zona de la mordida que originó la infección/caída; '' si no aplica. */
  zonaHerida: ZonaHerida;
  /** Ticks restantes de la ventana de amputación (solo si zonaHerida === 'brazo'). */
  ventanaAmputarTicks: number;
  /** true si el brazo herido ya fue amputado. */
  brazoAmputado: boolean;
  /** Ticks consecutivos huyendo en pánico (solo humanos); resetea al calmarse. */
  ticksSprintando: number;
}

export type Salud = 'sano' | 'incubando' | 'zombi' | 'eliminado' | 'caido';
export type Animo = 'tranquilo' | 'panico';
export type ZonaHerida = '' | 'pierna' | 'brazo' | 'torso';

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
