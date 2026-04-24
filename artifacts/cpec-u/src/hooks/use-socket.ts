import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, connectSocket, disconnectSocket } from "@/lib/socket";

export function useSocket(userId: number | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) {
      disconnectSocket();
      return;
    }

    const socket = getSocket();
    connectSocket(userId);

    const onMessageNew = () => {
      qc.invalidateQueries({ queryKey: ["/api/messages"] });
      qc.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    };

    const onNotificationNew = () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    };

    socket.on("message:new", onMessageNew);
    socket.on("notification:new", onNotificationNew);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("notification:new", onNotificationNew);
    };
  }, [userId, qc]);
}
