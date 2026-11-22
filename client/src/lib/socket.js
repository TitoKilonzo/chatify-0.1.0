import { io } from 'socket.io-client';

let socket = null;

/**
 * The single shared Socket.io connection. It authenticates with the same httpOnly cookies as the
 * REST API, so no token is ever handled in JavaScript. Created lazily and connected by the
 * realtime hook; same-origin in production and proxied by Vite in development.
 */
export function openSocket() {
  if (!socket) {
    socket = io({
      autoConnect: false,
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
  }
  return socket;
}

export function getSocket() {
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.close();
    socket = null;
  }
}
