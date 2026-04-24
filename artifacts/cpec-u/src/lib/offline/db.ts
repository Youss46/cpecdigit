const DB_NAME = "cpec-offline";
const DB_VERSION = 1;

export type SyncItemType = "PRESENCE" | "NOTE" | "CAHIER";
export type SyncStatus = "EN_ATTENTE" | "EN_COURS" | "SYNCHRONISE" | "ECHEC";

export interface SyncQueueItem {
  id?: number;
  type: SyncItemType;
  data: unknown;
  endpoint: string;
  method: string;
  timestamp: number;
  statut: SyncStatus;
  tentatives: number;
}

export interface CachedData {
  key: string;
  data: unknown;
  cachedAt: number;
  expiresAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("sync_queue")) {
        db.createObjectStore("sync_queue", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("cached_data")) {
        const store = db.createObjectStore("cached_data", { keyPath: "key" });
        store.createIndex("expiresAt", "expiresAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance && dbInstance.name) {
    return dbInstance;
  }
  dbInstance = await openDB();
  dbInstance.onclose = () => { dbInstance = null; };
  return dbInstance;
}

function tx(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addToSyncQueue(item: Omit<SyncQueueItem, "id">): Promise<number> {
  const db = await getDB();
  const store = tx(db, "sync_queue", "readwrite");
  return reqToPromise(store.add(item)) as Promise<number>;
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  const store = tx(db, "sync_queue", "readonly");
  return reqToPromise(store.getAll());
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const all = await getSyncQueue();
  return all.filter((item) => item.statut === "EN_ATTENTE");
}

export async function getFailedSyncItems(): Promise<SyncQueueItem[]> {
  const all = await getSyncQueue();
  return all.filter((item) => item.statut === "ECHEC");
}

export async function updateSyncItem(id: number, updates: Partial<SyncQueueItem>): Promise<void> {
  const db = await getDB();
  const store = tx(db, "sync_queue", "readwrite");
  const item = await reqToPromise(store.get(id));
  if (!item) return;
  Object.assign(item, updates);
  await reqToPromise(store.put(item));
}

export async function removeSyncItem(id: number): Promise<void> {
  const db = await getDB();
  const store = tx(db, "sync_queue", "readwrite");
  await reqToPromise(store.delete(id));
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  const store = tx(db, "sync_queue", "readwrite");
  await reqToPromise(store.clear());
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await getDB();
  const store = tx(db, "sync_queue", "readonly");
  return reqToPromise(store.count());
}

export async function setCachedData(
  key: string,
  data: unknown,
  ttlMs: number
): Promise<void> {
  const db = await getDB();
  const store = tx(db, "cached_data", "readwrite");
  const now = Date.now();
  const entry: CachedData = { key, data, cachedAt: now, expiresAt: now + ttlMs };
  await reqToPromise(store.put(entry));
}

export async function getCachedData<T = unknown>(key: string): Promise<T | null> {
  const db = await getDB();
  const store = tx(db, "cached_data", "readonly");
  const entry = await reqToPromise(store.get(key)) as CachedData | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    const writeStore = tx(await getDB(), "cached_data", "readwrite");
    writeStore.delete(key);
    return null;
  }
  return entry.data as T;
}

export async function removeCachedData(key: string): Promise<void> {
  const db = await getDB();
  const store = tx(db, "cached_data", "readwrite");
  await reqToPromise(store.delete(key));
}

export async function clearExpiredCache(): Promise<void> {
  const db = await getDB();
  const store = tx(db, "cached_data", "readwrite");
  const all = await reqToPromise(store.getAll()) as CachedData[];
  const now = Date.now();
  for (const entry of all) {
    if (now > entry.expiresAt) {
      store.delete(entry.key);
    }
  }
}

export async function clearAllOfflineData(): Promise<void> {
  const db = await getDB();
  const cacheTx = db.transaction("cached_data", "readwrite");
  await reqToPromise(cacheTx.objectStore("cached_data").clear());

  if ("caches" in window) {
    try {
      await caches.delete("cpec-u-api-v1");
    } catch {
      // ignore
    }
  }
}
