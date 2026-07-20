// PANDEMIA — tercer modo de "rival" (Plan 10 Task 2): en vez de tickear un
// `World` local (fantasma) o leer un `Desafio` congelado (reto), acumula su
// estado a partir de las muestras `{vivosPct, indiceCiudad, brecha}` que
// llegan por red vía `ConexionSala.onMuestraRival` (src/net/sala.ts). Cada
// jugador sigue simulando SOLO su propia ciudad de forma 100% determinista;
// el relay únicamente reenvía estos números — cero lógica de juego en el
// servidor.
//
// Implementa `RivalComparable` (src/game/rival.ts), el mismo contrato que
// `Rival` (fantasma/reto): así `hud.ts`/`resultado.ts`/`audio.ts` no
// necesitan saber en qué modo está el rival, solo tipan su parámetro como
// `RivalComparable` en vez de la clase concreta `Rival`.

import type { RivalComparable } from '../game/rival';
import { MAX_MUESTRAS } from '../game/rival';
import type { ConexionSala, Muestra } from './sala';

export class RivalEnVivo implements RivalComparable {
  /** Una entrada por cada `Muestra` recibida (tope MAX_MUESTRAS, igual que `Rival`), no por tick propio: el rival remoto no tickea de este lado. */
  readonly curva: number[] = [];
  /**
   * Marca de tiempo de cada aviso: el ÍNDICE (1-based) de la muestra que
   * trajo la brecha, ya que no hay un `tick` real del rival remoto que leer
   * (mismo espíritu que el `tickEstatico` propio del modo reto de `Rival`).
   */
  readonly avisosBrecha: number[] = [];

  /** Último valor conocido; 100/0 antes de la primera muestra (mismo fallback que usa el modo reto de `Rival` para `vivosPct` cuando aún no hay curva). */
  private _vivosPct = 100;
  private _indiceCiudad = 0;

  constructor(conexion: ConexionSala) {
    conexion.onMuestraRival((m) => this.procesarMuestra(m));
  }

  private procesarMuestra(m: Muestra): void {
    // vivosPct/indiceCiudad siempre reflejan la ÚLTIMA muestra recibida,
    // aunque `curva` ya haya llegado al tope (igual que el modo fantasma de
    // `Rival`, donde `vivosPct` lee el `world` en vivo aunque `curva` ya no
    // crezca más).
    this._vivosPct = m.vivosPct;
    this._indiceCiudad = m.indiceCiudad;
    if (this.curva.length < MAX_MUESTRAS) {
      this.curva.push(m.vivosPct);
      if (m.brecha) {
        this.avisosBrecha.push(this.curva.length);
      }
    }
  }

  /**
   * No hay nada que tickear: las muestras llegan async por WebSocket, no por
   * tick de sim. Se deja el método (exigido por `RivalComparable`) como
   * punto de extensión futuro (p. ej. detectar timeout de desconexión), sin
   * necesidad real para esta task.
   */
  tick(): void {
    // sin-op a propósito.
  }

  get vivosPct(): number {
    return this._vivosPct;
  }

  get indiceCiudad(): number {
    return this._indiceCiudad;
  }
}
