export { addToSyncQueue, getSyncQueue, getPendingSyncItems, getFailedSyncItems, clearSyncQueue, getSyncQueueCount, setCachedData, getCachedData, removeCachedData, clearExpiredCache, clearAllOfflineData } from "./db";
export type { SyncQueueItem, SyncItemType, SyncStatus, CachedData } from "./db";
export { synchroniserDonnees } from "./sync";
export type { SyncResult } from "./sync";
export { saveAttendanceOffline, saveGradesOffline, saveCahierDeTexteOffline, saveOfflineAction } from "./offline-actions";
export { preloadDataForRole, preloadTeacherData, preloadStudentData, preloadAdminData, preloadParentData, cacheApiResponse, getCachedApiResponse } from "./cache-manager";
export { OfflineProvider, useOffline } from "./offline-context";
