import { useOffline } from "@/lib/offline/offline-context";
import { RefreshCw, WifiOff, CloudOff, CheckCircle2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * SyncStatusBar — compact horizontal bar for the sidebar footer.
 * Shows when offline, syncing, or when there are pending items.
 */
export function SyncStatusBar() {
  const { isOnline, isSyncing, syncProgress, pendingCount, lastSyncResult, triggerSync } =
    useOffline();

  if (isOnline && !isSyncing && pendingCount === 0 && !lastSyncResult) return null;

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs mb-2">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium flex-1">Hors ligne</span>
        {pendingCount > 0 && (
          <span className="bg-amber-200 text-amber-800 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs mb-2">
        <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
        <span className="font-medium flex-1">
          Synchronisation
          {syncProgress ? ` ${syncProgress.current}/${syncProgress.total}` : "…"}
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        onClick={() => triggerSync()}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs mb-2 hover:bg-slate-200 transition-colors"
      >
        <CloudOff className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium flex-1 text-left">
          {pendingCount} en attente
        </span>
        <RefreshCw className="w-3 h-3 opacity-60" />
      </button>
    );
  }

  if (lastSyncResult && lastSyncResult.success > 0 && lastSyncResult.failed === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs mb-2">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">
          {lastSyncResult.success} synchronisé{lastSyncResult.success > 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  return null;
}

/**
 * SyncStatusDot — tiny indicator dot for compact spaces (header, badges).
 */
export function SyncStatusDot() {
  const { isOnline, isSyncing, pendingCount } = useOffline();

  if (isOnline && !isSyncing && pendingCount === 0) return null;

  const label = !isOnline
    ? "Hors ligne"
    : isSyncing
    ? "Synchronisation en cours…"
    : `${pendingCount} modification${pendingCount > 1 ? "s" : ""} en attente`;

  const dotClass = !isOnline
    ? "bg-amber-500"
    : isSyncing
    ? "bg-blue-500 animate-pulse"
    : "bg-slate-400 animate-pulse";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
