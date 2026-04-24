import { useOffline } from "./offline/offline-context";
import { getPendingSyncItems, type SyncQueueItem } from "./offline/db";
import { useState, useEffect, useCallback } from "react";

export function useOfflineGrades() {
  const { isOnline, pendingCount } = useOffline();
  const [pendingGrades, setPendingGrades] = useState<SyncQueueItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const items = await getPendingSyncItems();
      setPendingGrades(items.filter((i) => i.type === "NOTE"));
    } catch {
      setPendingGrades([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, pendingCount]);

  return {
    isOnline,
    pendingGrades,
    hasPending: pendingGrades.length > 0,
  };
}
