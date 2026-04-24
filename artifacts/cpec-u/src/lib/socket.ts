import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/api/socket.io",
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionAttempts: 10,
    });
  }
  return socket;
}

export function connectSocket(userId: number) {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
    s.once("connect", () => {
      s.emit("join", userId);
    });
  } else {
    s.emit("join", userId);
  }
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
