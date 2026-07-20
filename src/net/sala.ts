// PANDEMIA — cliente delgado del relay de matchmaking en vivo (Plan 10, Task 1).
//
// Wrapper sobre el WebSocket nativo del navegador (global, sin import).
// Protocolo JSON definido en server/relay.ts — debe mantenerse en sync
// con los tipos MsgCliente/MsgServidor de ese archivo.
//
// Nota sobre el contrato: el plan describe la interfaz ConexionSala con
// crear()/unirse()/enviarMuestra()/onMuestraRival()/onDesconexion() ("expone
// algo como" — ilustrativo, no literal). Se agregó onEmparejado(): quien
// LLAMA a crear() recibe el código de sala de inmediato (para mostrarlo en
// pantalla), pero el emparejamiento — y por lo tanto la seed compartida —
// llega después, de forma asíncrona, cuando el segundo jugador se une. No
// hay forma de modelar eso con una promesa que resuelve una sola vez, así
// que ese lado usa un callback, igual que onMuestraRival/onDesconexion.

export interface Muestra {
  vivosPct: number;
  indiceCiudad: number;
  brecha: boolean;
}

export interface ConexionSala {
  /** Pide una sala nueva; resuelve con el código en cuanto el relay lo confirma. */
  crear(): Promise<string>;
  /** Se une a una sala existente; resuelve con la seed compartida al emparejar. */
  unirse(sala: string): Promise<string>;
  enviarMuestra(m: Muestra): void;
  onMuestraRival(cb: (m: Muestra) => void): void;
  onDesconexion(cb: () => void): void;
  /** Solo relevante para quien llamó crear(): se dispara cuando el rival se une. */
  onEmparejado(cb: (seed: string) => void): void;
}

type MsgCliente =
  | { tipo: 'crear' }
  | { tipo: 'unirse'; sala: string }
  | { tipo: 'muestra'; vivosPct: number; indiceCiudad: number; brecha: boolean };

type MsgServidor =
  | { tipo: 'sala-creada'; sala: string }
  | { tipo: 'emparejado'; seed: string }
  | { tipo: 'rival-desconectado' }
  | { tipo: 'muestra-rival'; vivosPct: number; indiceCiudad: number; brecha: boolean };

/** URL del relay local. Task 4 la hará configurable vía import.meta.env para producción. */
export const URL_RELAY_LOCAL = 'ws://localhost:8787';

const TIMEOUT_MS = 10_000;

export function crearConexionSala(url: string = URL_RELAY_LOCAL): ConexionSala {
  const ws = new WebSocket(url);

  let cbMuestraRival: ((m: Muestra) => void) | undefined;
  let cbDesconexion: (() => void) | undefined;
  let cbEmparejado: ((seed: string) => void) | undefined;

  const listo = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener(
      'error',
      () => reject(new Error('No se pudo conectar al relay de sala')),
      { once: true },
    );
  });

  ws.addEventListener('message', (ev: MessageEvent) => {
    let msg: MsgServidor;
    try {
      msg = JSON.parse(ev.data as string);
    } catch {
      return;
    }
    if (msg.tipo === 'muestra-rival') {
      cbMuestraRival?.({
        vivosPct: msg.vivosPct,
        indiceCiudad: msg.indiceCiudad,
        brecha: msg.brecha,
      });
    } else if (msg.tipo === 'emparejado') {
      cbEmparejado?.(msg.seed);
    } else if (msg.tipo === 'rival-desconectado') {
      cbDesconexion?.();
    }
  });

  function enviar(m: MsgCliente): void {
    ws.send(JSON.stringify(m));
  }

  /** Espera un único mensaje del relay que cumpla `pred`, con timeout. */
  function esperarMensaje<T extends MsgServidor>(
    pred: (m: MsgServidor) => m is T,
    timeoutMsg: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.removeEventListener('message', onMessage);
        reject(new Error(timeoutMsg));
      }, TIMEOUT_MS);

      function onMessage(ev: MessageEvent): void {
        let msg: MsgServidor;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (pred(msg)) {
          clearTimeout(timer);
          ws.removeEventListener('message', onMessage);
          resolve(msg);
        }
      }
      ws.addEventListener('message', onMessage);
    });
  }

  return {
    async crear(): Promise<string> {
      await listo;
      const promesa = esperarMensaje(
        (m): m is Extract<MsgServidor, { tipo: 'sala-creada' }> => m.tipo === 'sala-creada',
        'Timeout esperando sala-creada',
      );
      enviar({ tipo: 'crear' });
      const msg = await promesa;
      return msg.sala;
    },

    async unirse(sala: string): Promise<string> {
      await listo;
      const promesa = esperarMensaje(
        (m): m is Extract<MsgServidor, { tipo: 'emparejado' }> => m.tipo === 'emparejado',
        'Timeout esperando emparejado',
      );
      enviar({ tipo: 'unirse', sala });
      const msg = await promesa;
      return msg.seed;
    },

    enviarMuestra(m: Muestra): void {
      enviar({ tipo: 'muestra', ...m });
    },

    onMuestraRival(cb: (m: Muestra) => void): void {
      cbMuestraRival = cb;
    },

    onDesconexion(cb: () => void): void {
      cbDesconexion = cb;
    },

    onEmparejado(cb: (seed: string) => void): void {
      cbEmparejado = cb;
    },
  };
}
