import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { synchroniserDonnees, type SyncResult } from "./sync";
import { getPendingSyncItems } from "./db";
import { preloadDataForRole } from "./cache-manager";

interface OfflineContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  syncProgress: { current: number; total: number } | null;
  pendingCount: number;
  lastSyncResult: SyncResult | null;
  triggerSync: () => Promise<SyncResult | null>;
  preloadCache: (role: string) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isSyncing: false,
  syncProgress: null,
  pendingCount: 0,
  lastSyncResult: null,
  triggerSync: async () => null,
  preloadCache: async () => {},
});

export function useOffline() {
  return useContext(OfflineContext);
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async (): Promise<number> => {
    try {
      const items = await getPendingSyncItems();
      setPendingCount(items.length);
      return items.length;
    } catch {
      return 0;
    }
  }, []);

  const triggerSync = useCallback(async (): Promise<SyncResult | null> => {
    if (syncingRef.current || !navigator.onLine) return null;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncProgress(null);

    try {
      const result = await synchroniserDonnees((current, total) => {
        setSyncProgress({ current, total });
      });

      setLastSyncResult(result);
      await refreshPendingCount();
      return result;
    } catch {
      return null;
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
      syncingRef.current = false;
    }
  }, [refreshPendingCount]);

  const preloadCache = useCallback(async (role: string) => {
    if (!navigator.onLine) return;
    try {
      await preloadDataForRole(role);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    refreshPendingCount().then((count) => {
      if (navigator.onLine && (count ?? 0) > 0) {
        triggerSync();
      }
    });

    const interval = setInterval(refreshPendingCount, 10_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [triggerSync, refreshPendingCount]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        syncProgress,
        pendingCount,
        lastSyncResult,
        triggerSync,
        preloadCache,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}
