// PANDEMIA — relay de matchmaking en vivo (Plan 10, Task 1).
//
// Node puro, FUERA de src/ — no pasa por Vite ni por el tsconfig del
// cliente. La regla de determinismo de src/sim/ NO aplica aquí: este
// proceso corre en el servidor, no en la sim, así que Math.random /
// crypto.randomUUID son válidos.
//
// El relay es deliberadamente tonto: no conoce ninguna regla del juego.
// Solo empareja dos sockets por código de sala y reenvía "muestras" tal
// cual de un socket al otro. Sin base de datos, sin persistencia: si el
// proceso se reinicia, las salas activas se pierden (aceptable).
//
// Arranque: `node server/relay.ts` (Node 24 ejecuta TypeScript "erasable"
// directamente, sin transpilar — ver .superpowers/sdd/p10-task-1-report.md
// para el porqué de esta decisión).

import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const PUERTO = Number(process.env.PUERTO_RELAY ?? 8787);

type MsgCliente =
  | { tipo: 'crear' }
  | { tipo: 'unirse'; sala: string }
  | { tipo: 'muestra'; vivosPct: number; indiceCiudad: number; brecha: boolean };

type MsgServidor =
  | { tipo: 'sala-creada'; sala: string }
  | { tipo: 'emparejado'; seed: string }
  | { tipo: 'rival-desconectado' }
  | { tipo: 'muestra-rival'; vivosPct: number; indiceCiudad: number; brecha: boolean };

/** Código de sala → hasta 2 sockets. */
const salas = new Map<string, WebSocket[]>();

function enviar(ws: WebSocket, msg: MsgServidor): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function generarCodigoSala(): string {
  // 6 caracteres alfanuméricos en mayúsculas: corto, fácil de dictar o copiar.
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function otroSocket(sala: string, ws: WebSocket): WebSocket | undefined {
  return salas.get(sala)?.find((s) => s !== ws);
}

function quitarDeSala(sala: string, ws: WebSocket): void {
  const sockets = salas.get(sala);
  if (!sockets) return;
  const idx = sockets.indexOf(ws);
  if (idx !== -1) sockets.splice(idx, 1);
  if (sockets.length === 0) salas.delete(sala);
}

const wss = new WebSocketServer({ port: PUERTO });

wss.on('connection', (ws: WebSocket) => {
  let salaActual: string | undefined;

  ws.on('message', (data) => {
    let msg: MsgCliente;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // mensaje no-JSON: se ignora, el relay no valida esquema estricto
    }

    if (msg.tipo === 'crear') {
      let sala = generarCodigoSala();
      while (salas.has(sala)) sala = generarCodigoSala();
      salas.set(sala, [ws]);
      salaActual = sala;
      enviar(ws, { tipo: 'sala-creada', sala });
      return;
    }

    if (msg.tipo === 'unirse') {
      const sockets = salas.get(msg.sala);
      if (!sockets || sockets.length !== 1) return; // sala inexistente, llena o vacía
      sockets.push(ws);
      salaActual = msg.sala;
      const seed = randomUUID();
      for (const s of sockets) enviar(s, { tipo: 'emparejado', seed });
      return;
    }

    if (msg.tipo === 'muestra') {
      if (!salaActual) return;
      const rival = otroSocket(salaActual, ws);
      if (!rival) return;
      enviar(rival, {
        tipo: 'muestra-rival',
        vivosPct: msg.vivosPct,
        indiceCiudad: msg.indiceCiudad,
        brecha: msg.brecha,
      });
    }
  });

  ws.on('close', () => {
    if (!salaActual) return;
    const rival = otroSocket(salaActual, ws);
    quitarDeSala(salaActual, ws);
    if (rival) enviar(rival, { tipo: 'rival-desconectado' });
  });
});

console.log(`[relay] escuchando en ws://localhost:${PUERTO}`);
