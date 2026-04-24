import { useOffline } from "@/lib/offline/offline-context";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import { useState, useEffect } from "react";

export function OfflineBanner() {
  const { isOnline, isSyncing, syncProgress, pendingCount, lastSyncResult } = useOffline();
  const [showSuccess, setShowSuccess] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!(lastSyncResult && lastSyncResult.success > 0 && lastSyncResult.failed === 0)) return;
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 4000);
    return () => clearTimeout(timer);
  }, [lastSyncResult]);

  useEffect(() => {
    if (!isOnline) {
      setDismissed(false);
    }
  }, [isOnline]);

  if (showSuccess && isOnline && !isSyncing) {
    return (
      <div className="bg-emerald-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium z-50">
        <CheckCircle2 className="w-4 h-4" />
        <span>
          Synchronisation terminée — {lastSyncResult!.success} élément{lastSyncResult!.success > 1 ? "s" : ""} envoyé{lastSyncResult!.success > 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-md">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>
          Synchronisation en cours…
          {syncProgress ? ` ${syncProgress.current}/${syncProgress.total}` : ""}
        </span>
      </div>
    );
  }

  if (!isOnline && !dismissed) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-sm font-medium shadow-md">
        <div className="flex items-center gap-2 flex-1 justify-center">
          <WifiOff className="w-4 h-4" />
          <span>
            Mode hors ligne — Données sauvegardées localement
            {pendingCount > 0 ? ` (${pendingCount} en attente)` : ""}
          </span>
        </div>
        <button onClick={() => setDismissed(true)} className="ml-2 hover:bg-amber-700 rounded p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (isOnline && lastSyncResult && lastSyncResult.failed > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-md">
        <AlertTriangle className="w-4 h-4" />
        <span>
          {lastSyncResult.failed} élément{lastSyncResult.failed > 1 ? "s" : ""} non synchronisé{lastSyncResult.failed > 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  if (isOnline && pendingCount > 0 && !isSyncing) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-slate-700 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-md">
        <RefreshCw className="w-4 h-4" />
        <span>{pendingCount} élément{pendingCount > 1 ? "s" : ""} en attente de synchronisation</span>
      </div>
    );
  }

  return null;
}

export function OfflineCapabilities({ role }: { role: string }) {
  const { isOnline } = useOffline();

  if (isOnline) return null;

  const capabilities: Record<string, { available: string[]; unavailable: string[] }> = {
    teacher: {
      available: [
        "Saisie des présences",
        "Saisie des notes",
        "Emploi du temps (cache)",
        "Cahier de texte",
      ],
      unavailable: [
        "Messagerie",
        "Notifications",
        "Téléchargement PDF",
      ],
    },
    student: {
      available: [
        "Consultation des notes (cache)",
        "Emploi du temps (cache)",
        "Carte étudiante (cache)",
        "Cahier de texte (cache)",
      ],
      unavailable: [
        "Réclamations",
        "Messagerie",
        "Notifications",
        "Téléchargement PDF",
      ],
    },
    admin: {
      available: [
        "Consultation listes (cache)",
        "Tableaux de bord (cache)",
      ],
      unavailable: [
        "Modification données",
        "Messagerie",
        "Notifications",
        "Gestion utilisateurs",
      ],
    },
  };

  const cap = capabilities[role];
  if (!cap) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
        <WifiOff className="w-4 h-4" />
        Vous êtes hors ligne
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-emerald-700 mb-1.5">Disponible</p>
          <ul className="space-y-1">
            {cap.available.map((item) => (
              <li key={item} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-red-600 mb-1.5">Non disponible</p>
          <ul className="space-y-1">
            {cap.unavailable.map((item) => (
              <li key={item} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <X className="w-3 h-3 text-red-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
