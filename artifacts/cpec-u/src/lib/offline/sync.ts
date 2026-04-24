import {
  getPendingSyncItems,
  updateSyncItem,
  removeSyncItem,
  type SyncQueueItem,
} from "./db";

const MAX_RETRIES = 3;

export interface SyncResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ id: number; type: string; error: string }>;
}

async function sendToServer(item: SyncQueueItem): Promise<boolean> {
  const res = await fetch(`/api${item.endpoint}`, {
    method: item.method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item.data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return true;
}

export async function synchroniserDonnees(
  onProgress?: (current: number, total: number) => void
): Promise<SyncResult> {
  const pending = await getPendingSyncItems();
  const result: SyncResult = {
    total: pending.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  if (pending.length === 0) return result;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    if (!item.id) continue;

    onProgress?.(i + 1, pending.length);

    try {
      await updateSyncItem(item.id, { statut: "EN_COURS" });

      await sendToServer(item);

      await removeSyncItem(item.id);
      result.success++;
    } catch (error) {
      const newTentatives = item.tentatives + 1;
      const newStatus = newTentatives >= MAX_RETRIES ? "ECHEC" : "EN_ATTENTE";

      await updateSyncItem(item.id, {
        tentatives: newTentatives,
        statut: newStatus,
      });

      result.failed++;
      result.errors.push({
        id: item.id,
        type: item.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
