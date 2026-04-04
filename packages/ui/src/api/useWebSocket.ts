import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface WsMessage {
  type: string;
  payload: any;
}

// Global event target for test runner events
export const testRunnerEvents = new EventTarget();

/**
 * Dispatch a custom event for test runner WebSocket messages.
 */
function dispatchRunnerEvent(type: string, payload: any) {
  testRunnerEvents.dispatchEvent(
    new CustomEvent(type, { detail: payload }),
  );
}

/**
 * Connect to the server's WebSocket and invalidate queries on file changes.
 */
export function useWebSocket() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          handleMessage(msg, queryClient);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        // Reconnect after a delay
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [queryClient]);
}

function handleMessage(msg: WsMessage, queryClient: any) {
  switch (msg.type) {
    case 'file:changed': {
      const { fileId, testFlow } = msg.payload;
      // Update the cached test flow for this file
      queryClient.setQueryData(['testFlow', fileId], testFlow);
      break;
    }

    case 'file:created':
    case 'file:deleted':
      // Invalidate the test file list so the sidebar refreshes
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      break;

    case 'pageObject:changed': {
      const { fileId: poFileId, pageObject } = msg.payload;
      queryClient.setQueryData(['pageObject', poFileId], pageObject);
      queryClient.invalidateQueries({ queryKey: ['pageObjects'] });
      break;
    }

    case 'pageObject:created':
    case 'pageObject:deleted':
      queryClient.invalidateQueries({ queryKey: ['pageObjects'] });
      break;

    // Test runner events — forward to event target
    case 'testRun:started':
    case 'testRun:output':
    case 'testRun:finished':
    case 'testRun:stopped':
    case 'testRun:error':
      dispatchRunnerEvent(msg.type, msg.payload);
      queryClient.invalidateQueries({ queryKey: ['runnerStatus'] });
      break;
  }
}
