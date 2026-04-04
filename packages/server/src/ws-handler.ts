import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import type { FileWatcher, BatchedFileChangeEvent } from './file-watcher.js';

/**
 * Wire a FileWatcher to a WebSocketServer so that debounced/batched
 * file change events are broadcast to every connected client.
 *
 * Returns the WebSocketServer instance for testing or further configuration.
 */
export function setupFileWatcherWebSocket(
  server: Server,
  watcher: FileWatcher,
  wsPath = '/ws',
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: wsPath });

  wss.on('connection', (ws) => {
    ws.on('error', (err) => {
      console.error('WebSocket client error:', err.message);
    });
  });

  watcher.on('changes', (batch: BatchedFileChangeEvent) => {
    const message = JSON.stringify(batch);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  return wss;
}
