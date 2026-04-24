import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    path: "/api/socket.io",
  });

  io.on("connection", (socket) => {
    socket.on("join", (userId: unknown) => {
      if (typeof userId === "number" && userId > 0) {
        socket.join(`user:${userId}`);
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function emitToUser(userId: number, event: string, data?: unknown) {
  try {
    getIO().to(`user:${userId}`).emit(event, data);
  } catch {}
}

export function emitToUsers(userIds: number[], event: string, data?: unknown) {
  try {
    const ioInstance = getIO();
    for (const uid of userIds) {
      ioInstance.to(`user:${uid}`).emit(event, data);
    }
  } catch {}
}
