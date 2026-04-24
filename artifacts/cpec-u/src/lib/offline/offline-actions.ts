import { addToSyncQueue, type SyncItemType } from "./db";

interface OfflineActionOptions {
  type: SyncItemType;
  endpoint: string;
  method?: string;
  data: unknown;
}

export async function saveOfflineAction(options: OfflineActionOptions): Promise<number> {
  return addToSyncQueue({
    type: options.type,
    endpoint: options.endpoint,
    method: options.method ?? "POST",
    data: options.data,
    timestamp: Date.now(),
    statut: "EN_ATTENTE",
    tentatives: 0,
  });
}

export async function saveAttendanceOffline(payload: {
  subjectId: number;
  classId: number;
  semesterId: number;
  sessionDate: string;
  records: Array<{
    studentId: number;
    status: string;
    note?: string;
    startTime?: string;
    endTime?: string;
  }>;
}): Promise<number> {
  return saveOfflineAction({
    type: "PRESENCE",
    endpoint: "/teacher/attendance/save",
    data: payload,
  });
}

export async function saveGradesOffline(grades: Array<{
  studentId: number;
  subjectId: number;
  semesterId: number;
  evaluationNumber: number;
  value: number;
}>): Promise<number> {
  return saveOfflineAction({
    type: "NOTE",
    endpoint: "/teacher/grades/bulk",
    data: { grades },
  });
}

export async function saveCahierDeTexteOffline(payload: {
  subjectId: string;
  classId: string;
  semesterId: string;
  sessionDate: string;
  title: string;
  contenu: string;
  devoirs: string | null;
  heuresEffectuees: number | null;
}): Promise<number> {
  return saveOfflineAction({
    type: "CAHIER",
    endpoint: "/teacher/cahier-de-texte",
    data: payload,
  });
}
