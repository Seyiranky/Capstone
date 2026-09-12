import { io, type Socket } from 'socket.io-client';

// Same origin the REST API uses. When VITE_API_URL is an absolute URL
// (local dev without Docker) we connect straight to that host; when it's a
// relative path like "/api" (Docker) we connect same-origin and let the Vite
// dev server proxy /socket.io through to the API container.
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const socketUrl = apiUrl.startsWith('http') ? new URL(apiUrl).origin : '/';

let socket: Socket | null = null;

const getSocket = (): Socket => {
  if (!socket) {
    socket = io(socketUrl, {
      autoConnect: false,
      auth: (cb) => cb({ token: localStorage.getItem('token') ?? '' }),
    });
  }
  return socket;
};

export const connectSocket = (): Socket => {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: localStorage.getItem('token') ?? '' };
    s.connect();
  }
  return s;
};

export const disconnectSocket = (): void => {
  socket?.disconnect();
};
