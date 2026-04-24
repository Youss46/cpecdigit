import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, classEnrollmentsTable, scheduleEntriesTable, usersTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUsers } from "./push.js";
import { emitToUsers } from "../lib/socket.js";

const router = Router();

// GET /api/notifications — current user's notifications (latest 50)
router.get("/", requireRole("student", "teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/notifications/unread-count
router.get("/unread-count", requireRole("student", "teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const rows = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
    res.json({ count: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch("/:id/read", requireRole("student", "teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = parseInt(req.params.id);
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/notifications/read-all — mark all as read
router.post("/read-all", requireRole("student", "teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, userId));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;

// ─── Helper: create notifications for all students of given class IDs ─────────
export async function notifyStudentsOfClasses(
  classIds: number[],
  type: string,
  title: string,
  message: string
) {
  if (classIds.length === 0) return;
  const enrollments = await db
    .select({ studentId: classEnrollmentsTable.studentId })
    .from(classEnrollmentsTable)
    .where(inArray(classEnrollmentsTable.classId, classIds));

  const studentIds = [...new Set(enrollments.map(e => e.studentId))];
  if (studentIds.length === 0) return;

  await db.insert(notificationsTable).values(
    studentIds.map(userId => ({ userId, type, title, message }))
  );

  // Also send push notifications and socket events (fire and forget)
  sendPushToUsers(studentIds, { title, body: message, type }).catch(() => {});
  emitToUsers(studentIds, "notification:new");
}

// ─── Helper: notify all students (no filter) ──────────────────────────────────
export async function notifyAllStudents(type: string, title: string, message: string) {
  const students = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "student"));
  if (students.length === 0) return;
  await db.insert(notificationsTable).values(
    students.map(s => ({ userId: s.id, type, title, message }))
  );

  const studentIds = students.map(s => s.id);
  sendPushToUsers(studentIds, { title, body: message, type }).catch(() => {});
  emitToUsers(studentIds, "notification:new");
}

// ─── Helper: notify students enrolled in classes that have entries for a semester ─
export async function notifyStudentsBySemester(semesterId: number, type: string, title: string, message: string) {
  const entries = await db
    .select({ classId: scheduleEntriesTable.classId })
    .from(scheduleEntriesTable)
    .where(eq(scheduleEntriesTable.semesterId, semesterId));
  const classIds = [...new Set(entries.map(e => e.classId))];
  if (classIds.length === 0) {
    await notifyAllStudents(type, title, message);
  } else {
    await notifyStudentsOfClasses(classIds, type, title, message);
  }
}
