import type { World } from '../sim/world';
import type { Hito } from '../sim/types';
import type { Partida } from '../game/partida';
import type { RivalComparable } from '../game/rival';
import { calcularVeredicto } from './resultado';

/** Volumen maestro (0-1): todo pasa por un único GainNode con este valor. */
const VOLUMEN_MAESTRO = 0.15;

/**
 * Audio 100% sintetizado (osciladores + envolventes cortas), CERO assets.
 * `update()` consume los DELTAS de `world.hitos` (índice consumido, el array
 * solo crece — tope 300, ver `world.ts`) y detecta "grito/pánico" por el
 * CAMBIO del recuento de ciudadanos en pánico entre frames (ver nota abajo),
 * no por `world.ruidos`: ese array se compacta in-place cada tick (decae y
 * se reescribe por delante, `world.ts:167-173`), así que un índice consumido
 * no sobrevive a la compactación entre dos frames de render — el conteo de
 * pánico es una señal estable derivada del mismo estado que ya se lee cada
 * frame en otras vistas, sin ese problema.
 *
 * `update` acepta `partida`/`rival` opcionales (además de `world`, que es lo
 * único exigido por el spec) para poder reutilizar `calcularVeredicto` de
 * `resultado.ts` y sonar el acorde de fin de partida una sola vez. Sin esos
 * dos argumentos, `update(world)` sigue funcionando igual (disparo, grito,
 * brecha, transformación y rescate no los necesitan).
 */
export class Audio {
  habilitado = true;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Cuántos `world.hitos` ya se procesaron (el array solo crece). */
  private hitosConsumidos = 0;
  /** Nº de ciudadanos en pánico en el frame anterior. */
  private panicoPrevio = 0;
  /** Guardia: el acorde de fin de partida suena una sola vez. */
  private finSonado = false;

  /**
   * Alterna encendido/apagado. Es SIEMPRE un gesto real del usuario (botón
   * del HUD o tecla M), así que de paso intenta crear/reanudar el
   * AudioContext — cumple el requisito de los navegadores sin arriesgar el
   * aviso de autoplay en la consola.
   */
  alternar(): void {
    this.habilitado = !this.habilitado;
    if (this.habilitado) this.asegurarContexto();
  }

  /**
   * Intenta crear/reanudar el AudioContext desde CUALQUIER gesto del usuario
   * (primer click o tecla en la partida, no solo el botón de audio). Sin
   * gesto previo, `asegurarContexto()` nunca se llama desde aquí — la
   * llaman los métodos de sonido, que solo se disparan por eventos reales
   * del juego, así que si nadie ha interactuado todavía el navegador puede
   * dejar el contexto en 'suspended' sin loggear nada (no hay reproducción
   * real hasta el resume).
   */
  intentarDesbloquear(): void {
    this.asegurarContexto();
  }

  /**
   * Consume deltas desde el último frame y dispara los sonidos que
   * correspondan. Llamar una vez por frame de render (no por tick de sim).
   */
  update(world: World, partida?: Partida, rival?: RivalComparable): void {
    const desde = this.hitosConsumidos;
    this.hitosConsumidos = world.hitos.length;
    if (this.habilitado) {
      for (let i = desde; i < world.hitos.length; i++) {
        this.procesarHito(world.hitos[i]);
      }
    }

    let panicoActual = 0;
    for (const c of world.citizens) {
      if (c.animo === 'panico') panicoActual++;
    }
    if (this.habilitado && panicoActual > this.panicoPrevio && Math.random() < 1 / 3) {
      this.grito();
    }
    this.panicoPrevio = panicoActual;

    if (partida && rival && !this.finSonado && partida.estado === 'terminada') {
      this.finSonado = true;
      if (this.habilitado) {
        const v = calcularVeredicto(world, partida, rival);
        this.finPartida(v.ganador);
      }
    }
  }

  private procesarHito(h: Hito): void {
    switch (h.tipo) {
      case 'disparo':
        this.tono('square', 180, 60, 80);
        break;
      case 'rescate':
        this.rescate();
        break;
      case 'brecha':
        this.brecha();
        break;
      case 'transformacion_cabeza':
        this.tono('triangle', 200, 80, 220);
        break;
      // 'megafono' | 'refuerzo' | 'caida_agente': sin sonido propio en el
      // spec de esta task (solo disparo/grito/brecha/transformación/
      // rescate/fin listan un timbre); se dejan en silencio a propósito.
      default:
        break;
    }
  }

  // ---- sonidos ----

  private grito(): void {
    this.tono('sawtooth', 600, 900, 120);
  }

  private rescate(): void {
    this.nota(440, 100, 0);
    this.nota(660, 130, 90);
  }

  private finPartida(ganador: 'tu' | 'rival' | 'empate'): void {
    const DO = 261.63;
    const MIb = 311.13;
    const MI = 329.63;
    const SOL = 392.0;
    if (ganador === 'tu') this.acorde([DO, MI, SOL], 700);
    else if (ganador === 'rival') this.acorde([DO, MIb, SOL], 700);
    else this.acorde([DO, SOL], 700); // empate: quinta sin tercera, ni mayor ni menor
  }

  private brecha(): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.master) return;
    const dur = 0.4;
    const t0 = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + 0.02);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    fuente.connect(filtro);
    filtro.connect(gain);
    gain.connect(this.master);
    fuente.start(t0);
    fuente.stop(t0 + dur + 0.02);
  }

  private acorde(frecuencias: number[], durMs: number): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    const dur = durMs / 1000;
    for (const f of frecuencias) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1 / frecuencias.length, t0 + 0.05);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
  }

  private nota(freq: number, durMs: number, delayMs: number): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delayMs / 1000;
    const dur = durMs / 1000;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.9, t0 + 0.01);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private tono(tipo: OscillatorType, f0: number, f1: number, durMs: number): void {
    const ctx = this.asegurarContexto();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    const dur = durMs / 1000;
    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + 0.005);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /**
   * Crea el AudioContext en el primer gesto real del usuario (nunca en el
   * constructor: crearlo sin gesto arriesga el aviso de autoplay del
   * navegador). Llamadas posteriores reutilizan la instancia y la reanudan
   * si el navegador la dejó 'suspended'.
   */
  private asegurarContexto(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    type VentanaConWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as VentanaConWebkit).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = VOLUMEN_MAESTRO;
      this.master.connect(this.ctx.destination);
    } else if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }
}
