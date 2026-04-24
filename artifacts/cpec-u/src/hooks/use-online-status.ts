import { useOffline } from "@/lib/offline/offline-context";

/**
 * Convenience hook for checking online/offline status.
 * Backed by the OfflineContext — no additional event listeners.
 */
export function useOnlineStatus() {
  const { isOnline, isSyncing, pendingCount, triggerSync } = useOffline();

  return {
    isOnline,
    isOffline: !isOnline,
    isSyncing,
    pendingCount,
    triggerSync,
  };
}
