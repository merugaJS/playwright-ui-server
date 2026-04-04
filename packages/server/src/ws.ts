import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

export interface WsMessage {
  type: string;
  payload: unknown;
}

let wss: WebSocketServer | null = null;

export function setupWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  return wss;
}

/**
 * Broadcast a message to all connected clients.
 */
export function broadcast(message: WsMessage): void {
  if (!wss) return;
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
