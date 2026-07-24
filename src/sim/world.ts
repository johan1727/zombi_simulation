import { createRng, type Rng } from './rng';
import { corridorCenter, generateCity, type CityLayout } from './cityGen';
import { spawnCitizens } from './citizens';
import type { Citizen, Hito, OrdenJugador, Ruido, Splat } from './types';
import { CITIZENS, CITY_WIDTH, CITY_DEPTH, EVENTO, INFECCION, OBRERO, PELIGRO, type TipoEvento } from './config';
import { SpatialGrid } from './spatialGrid';
import { actualizarIncubacion, elegirPacienteCero, infectar } from './infeccion';
import { updateZombi } from './zombis';
import { updateHumano } from './panico';
import { resolverCombates } from './combate';
import { resolverAsedios } from './asedio';
import { updateInterior } from './interior';
import { aplicarOrden, crearAgente, updateAgente } from './agentes';
import { elegirEvento } from './eventos';

export class World {
  readonly seed: string;
  readonly city: CityLayout;
  readonly citizens: Citizen[];
  tickCount = 0;

  /** Streams de RNG por subsistema: cada sistema usa SOLO el suyo. */
  readonly rngCiudadanos: Rng;
  readonly rngInfeccion: Rng;
  readonly rngZombis: Rng;
  readonly rngPanico: Rng;
  readonly rngCombate: Rng;
  /** Nombres de agente al spawn (crearAgente) y tono de splat en disparo/caída (agentes.ts). */
  readonly rngAgentes: Rng;
  /** Sorteo del giro de semilla (elegirEvento); stream propio, sin tocar el conteo de draws de los demás. */
  readonly rngEvento: Rng;
  /** Zona de herida al infectar (sortearZonaHerida, infeccion.ts); stream propio para no resecuenciar rngInfeccion/rngCombate/rngAgentes. */
  readonly rngHeridas: Rng;
  /** Activación de alarma de auto (updateZombi, zombis.ts); stream propio para no resecuenciar rngZombis. */
  readonly rngAutos: Rng;

  /** Giro de semilla a mitad de partida: tick y tipo sorteados en el constructor, IDÉNTICO para World y Rival (misma semilla). */
  readonly evento: { tick: number; tipo: TipoEvento; activo: boolean; helicopteroLlegaEnTicks: number };

  readonly splats: Splat[] = [];
  readonly ruidos: Ruido[] = [];
  readonly ocupantes: number[];
  readonly brecha: boolean[];
  readonly presion: number[];
  /** Presión extra que aguanta cada puerta reforzada por el obrero (por edificio). */
  readonly refuerzoPuerta: number[];
  /** Enfriamiento de la alarma de cada auto (paralelo a city.autos), decae 1/tick hasta 0. */
  readonly enfriamientoAuto: number[];
  /** Usos restantes de la habilidad del obrero (compartidos entre todas las puertas). */
  usosObrero = OBRERO.usos;
  /** Eventos notables para historias/audio/HUD; tope 300 salvo hitos de agente. */
  readonly hitos: Hito[] = [];
  private readonly colaOrdenes: OrdenJugador[] = [];
  /** Log completo de órdenes propias con su tick, para replay/verificación server-side (Plan 17). */
  readonly ordenLog: { tick: number; orden: OrdenJugador }[] = [];
  readonly grid = new SpatialGrid<Citizen>();
  /** Un array de índices de citizens por edificio, reconstruido cada tick en orden de índice. */
  readonly dentroPorEdificio: number[][];

  /** Memoria colectiva: rejilla gruesa de "peligro" (dónde ha muerto/roto gente). */
  readonly peligro: number[];
  private readonly peligroCols = Math.ceil(CITY_WIDTH / PELIGRO.celda);
  /** Cerrado ligado a esta instancia; se pasa a updateCitizen sin reconstruirse cada tick. */
  readonly peligroFn = (x: number, z: number): number => this.peligroEn(x, z);

  constructor(seed: string, citizenCount: number = CITIZENS.count) {
    this.seed = seed;
    const rngCiudad = createRng(`pandemia:${seed}:ciudad`);
    this.rngCiudadanos = createRng(`pandemia:${seed}:ciudadanos`);
    this.rngInfeccion = createRng(`pandemia:${seed}:infeccion`);
    this.rngZombis = createRng(`pandemia:${seed}:zombis`);
    this.rngPanico = createRng(`pandemia:${seed}:panico`);
    this.rngCombate = createRng(`pandemia:${seed}:combate`);
    this.rngAgentes = createRng(`pandemia:${seed}:agentes`);
    this.rngEvento = createRng(`pandemia:${seed}:evento`);
    this.rngHeridas = createRng(`pandemia:${seed}:heridas`);
    this.rngAutos = createRng(`pandemia:${seed}:autos`);
    const { tick, tipo } = elegirEvento(this.rngEvento);
    this.evento = { tick, tipo, activo: false, helicopteroLlegaEnTicks: 0 };
    this.city = generateCity(rngCiudad);
    this.citizens = spawnCitizens(this.rngCiudadanos, citizenCount, this.city);
    // 4 agentes deterministas, DISPERSOS en cuatro cruces del centro: evita
    // el imán degenerado de un cúmulo inmóvil y que una sola horda barra al
    // equipo entero (decisión de diseño, resolución del bloqueo de la Task 1).
    this.citizens.push(crearAgente('policia', corridorCenter(2), corridorCenter(3), this.citizens.length, this.rngAgentes));
    this.citizens.push(crearAgente('paramedico', corridorCenter(4), corridorCenter(3), this.citizens.length, this.rngAgentes));
    this.citizens.push(crearAgente('megafono', corridorCenter(2), corridorCenter(5), this.citizens.length, this.rngAgentes));
    this.citizens.push(crearAgente('obrero', corridorCenter(4), corridorCenter(5), this.citizens.length, this.rngAgentes));
    // Cuenta los ocupantes iniciales (familias que nacen ya adentro, Plan 19)
    // en vez de asumir que todo edificio arranca vacío.
    this.ocupantes = this.city.buildings.map((b) => {
      let n = 0;
      for (const c of this.citizens) if (c.dentroDe === b.id) n++;
      return n;
    });
    this.brecha = this.city.buildings.map(() => false);
    this.presion = this.city.buildings.map(() => 0);
    this.refuerzoPuerta = this.city.buildings.map(() => 0);
    this.enfriamientoAuto = this.city.autos.map(() => 0);
    this.dentroPorEdificio = this.city.buildings.map(() => []);
    this.peligro = new Array(this.peligroCols * Math.ceil(CITY_DEPTH / PELIGRO.celda)).fill(0);
  }

  /** Solo para conveniencia del game layer; la sim itera por índice. */
  get agentes(): Citizen[] {
    return this.citizens.filter((c) => c.esAgente);
  }

  /** Encola una orden del jugador; se aplica al INICIO del siguiente tick. */
  encolarOrden(o: OrdenJugador): void {
    this.ordenLog.push({ tick: this.tickCount, orden: o });
    this.colaOrdenes.push(o);
  }

  registrarPeligro(x: number, z: number): void {
    const cx = Math.min(this.peligroCols - 1, Math.max(0, Math.floor(x / PELIGRO.celda)));
    const cz = Math.max(0, Math.floor(z / PELIGRO.celda));
    const idx = cz * this.peligroCols + cx;
    if (idx < this.peligro.length) {
      this.peligro[idx] = Math.min(PELIGRO.maximo, this.peligro[idx] + PELIGRO.porMuerte);
    }
  }

  peligroEn(x: number, z: number): number {
    // Fuera del mapa devuelve el máximo A PROPÓSITO: en los cruces cercanos
    // al borde, los caminantes prefieren girar hacia dentro de la ciudad.
    if (x < 0 || z < 0 || x >= CITY_WIDTH || z >= CITY_DEPTH) return PELIGRO.maximo;
    const cx = Math.floor(x / PELIGRO.celda);
    const cz = Math.floor(z / PELIGRO.celda);
    return this.peligro[cz * this.peligroCols + cx] ?? 0;
  }

  get stats(): { vivos: number; zombis: number } {
    let vivos = 0;
    let zombis = 0;
    for (const c of this.citizens) {
      if (c.salud === 'zombi') zombis++;
      else if (c.salud !== 'eliminado') vivos++;
    }
    return { vivos, zombis };
  }

  /** % de la población original con vida (0-100), sin el bono de refugios. */
  get vivosPct(): number {
    return (this.stats.vivos / this.citizens.length) * 100;
  }

  /** Índice de Ciudad: % vivos (0-100) + 1 punto por refugio jugable sin brecha. */
  get indiceCiudad(): number {
    const total = this.citizens.length;
    const { vivos } = this.stats;
    let intactos = 0;
    for (const b of this.city.buildings) {
      if (b.kind === 'jugable' && !this.brecha[b.id]) intactos++;
    }
    return Math.round((vivos / total) * 100) + intactos;
  }

  tick(): void {
    for (const o of this.colaOrdenes) aplicarOrden(o, this);
    this.colaOrdenes.length = 0;
    if (this.tickCount === INFECCION.pacienteCeroTick) {
      infectar(this.citizens[elegirPacienteCero(this.citizens, this.rngInfeccion)], this.rngInfeccion, this.rngHeridas);
    }
    if (this.tickCount === this.evento.tick) {
      this.evento.activo = true;
      if (this.evento.tipo === 'helicoptero') {
        this.evento.helicopteroLlegaEnTicks = EVENTO.ticksHelicoptero;
      }
    }
    if (this.evento.helicopteroLlegaEnTicks > 0) {
      this.evento.helicopteroLlegaEnTicks--;
    }
    this.grid.rebuild(this.citizens, (c) => c.salud !== 'eliminado' && c.dentroDe < 0);
    for (const lista of this.dentroPorEdificio) lista.length = 0;
    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      if (c.dentroDe >= 0 && c.salud !== 'eliminado') this.dentroPorEdificio[c.dentroDe].push(i);
    }
    for (let bId = 0; bId < this.ocupantes.length; bId++) {
      let humanos = 0;
      for (const i of this.dentroPorEdificio[bId]) {
        if (this.citizens[i].salud !== 'zombi') humanos++;
      }
      this.ocupantes[bId] = humanos;
    }
    for (const c of this.citizens) {
      if (c.salud === 'eliminado') { c.prevX = c.x; c.prevZ = c.z; continue; }
      if (c.dentroDe >= 0) {
        updateInterior(c, this);
        actualizarIncubacion(c, this);
        continue;
      }
      if (c.salud === 'zombi') {
        updateZombi(c, this);
      } else {
        if (c.esAgente) updateAgente(c, this); else updateHumano(c, this);
        actualizarIncubacion(c, this);
      }
    }
    resolverCombates(this);
    resolverAsedios(this);
    // decaimiento de ruidos (compactación estable, sin filter para no asignar)
    let w = 0;
    for (const r of this.ruidos) {
      r.ticks--;
      if (r.ticks > 0) this.ruidos[w++] = r;
    }
    this.ruidos.length = w;
    for (let i = 0; i < this.enfriamientoAuto.length; i++) {
      if (this.enfriamientoAuto[i] > 0) this.enfriamientoAuto[i]--;
    }
    if (this.tickCount % PELIGRO.decaimientoCadaTicks === 0 && this.tickCount > 0) {
      for (let k = 0; k < this.peligro.length; k++) {
        this.peligro[k] = Math.floor((this.peligro[k] * 9) / 10);
      }
    }
    this.tickCount++;
  }

  /**
   * Huella FNV del estado para los tests de determinismo.
   * Mezcla 24 bits por valor: suficiente hasta mapas de ~1.6 km.
   */
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
    const SALUD = { sano: 1, incubando: 2, zombi: 3, eliminado: 4, caido: 5 } as const;
    const ZONA = { '': 0, pierna: 1, brazo: 2, torso: 3 } as const;
    mix(this.tickCount);
    for (const c of this.citizens) {
      mix(Math.round(c.x * 100));
      mix(Math.round(c.z * 100));
      mix(SALUD[c.salud]);
      mix(c.animo === 'panico' ? 2 : 1);
      mix(c.dentroDe + 1);
      mix(c.piso);
      mix(c.caidoTicks);
      mix(ZONA[c.zonaHerida]);
      mix(c.brazoAmputado ? 1 : 0);
    }
    return h >>> 0;
  }
}
