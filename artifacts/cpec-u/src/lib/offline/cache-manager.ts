import { setCachedData, getCachedData } from "./db";

const TTL = {
  SCHEDULE: 7 * 24 * 60 * 60 * 1000,
  STUDENT_LIST: 24 * 60 * 60 * 1000,
  GRADES: 7 * 24 * 60 * 60 * 1000,
  STUDENT_CARD: 30 * 24 * 60 * 60 * 1000,
  SUBJECTS: 7 * 24 * 60 * 60 * 1000,
  DASHBOARD: 4 * 60 * 60 * 1000,
  ASSIGNMENTS: 7 * 24 * 60 * 60 * 1000,
} as const;

async function fetchAndCache(endpoint: string, cacheKey: string, ttl: number): Promise<void> {
  try {
    const res = await fetch(`/api${endpoint}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    await setCachedData(cacheKey, data, ttl);
  } catch {
    // silently fail - not critical
  }
}

export async function preloadTeacherData(): Promise<void> {
  await Promise.allSettled([
    fetchAndCache("/teacher/assignments", "teacher:assignments", TTL.ASSIGNMENTS),
    fetchAndCache("/teacher/dashboard", "teacher:dashboard", TTL.DASHBOARD),
    fetchAndCache("/teacher/cahier-de-texte", "teacher:cahier-de-texte", TTL.SUBJECTS),
    fetchAndCache("/teacher/schedule", "teacher:schedule", TTL.SCHEDULE),
  ]);
}

export async function preloadStudentData(): Promise<void> {
  await Promise.allSettled([
    fetchAndCache("/student/schedule", "student:schedule", TTL.SCHEDULE),
    fetchAndCache("/student/grades", "student:grades", TTL.GRADES),
    fetchAndCache("/student/card", "student:card", TTL.STUDENT_CARD),
    fetchAndCache("/student/dashboard", "student:dashboard", TTL.DASHBOARD),
    fetchAndCache("/student/me", "student:me", TTL.STUDENT_CARD),
    fetchAndCache("/student/cahier-de-texte", "student:cahier-de-texte", TTL.SUBJECTS),
  ]);
}

export async function preloadAdminData(): Promise<void> {
  await Promise.allSettled([
    fetchAndCache("/admin/stats", "admin:stats", TTL.DASHBOARD),
    fetchAndCache("/admin/alertes/resume", "admin:alertes:resume", TTL.DASHBOARD),
  ]);
}

export async function preloadParentData(): Promise<void> {
  await Promise.allSettled([
    fetchAndCache("/parent/dashboard", "parent:dashboard", TTL.DASHBOARD),
    fetchAndCache("/parent/results", "parent:results", TTL.GRADES),
    fetchAndCache("/parent/absences", "parent:absences", TTL.STUDENT_LIST),
    fetchAndCache("/parent/schedule", "parent:schedule", TTL.SCHEDULE),
  ]);
}

export async function preloadDataForRole(role: string): Promise<void> {
  switch (role) {
    case "teacher":
      return preloadTeacherData();
    case "student":
      return preloadStudentData();
    case "admin":
      return preloadAdminData();
    case "parent":
      return preloadParentData();
  }
}

export async function cacheApiResponse(endpoint: string, data: unknown, ttl?: number): Promise<void> {
  const key = `api:${endpoint}`;
  await setCachedData(key, data, ttl ?? TTL.DASHBOARD);
}

export async function getCachedApiResponse<T = unknown>(endpoint: string): Promise<T | null> {
  const key = `api:${endpoint}`;
  return getCachedData<T>(key);
}

export { getCachedData };
