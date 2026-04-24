import { Router } from "express";
import { db } from "@workspace/db";
import {
  teacherAssignmentsTable,
  usersTable,
  subjectsTable,
  classesTable,
  semestersTable,
  scheduleEntriesTable,
  attendanceSessionsTable,
} from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

function requirePlanificateur(req: any, res: any, next: any) {
  if (req.session?.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const subRole = req.session.user.adminSubRole;
  if (subRole !== "planificateur" && subRole !== "directeur") {
    return res.status(403).json({ error: "Réservé au Responsable pédagogique ou au Directeur" });
  }
  next();
}

async function getEnriched() {
  const rows = await db
    .select({
      id: teacherAssignmentsTable.id,
      teacherId: teacherAssignmentsTable.teacherId,
      teacherName: usersTable.name,
      subjectId: teacherAssignmentsTable.subjectId,
      subjectName: subjectsTable.name,
      classId: teacherAssignmentsTable.classId,
      className: classesTable.name,
      semesterId: teacherAssignmentsTable.semesterId,
      semesterName: semestersTable.name,
      plannedHours: teacherAssignmentsTable.plannedHours,
      createdAt: teacherAssignmentsTable.createdAt,
    })
    .from(teacherAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
    .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
    .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
    .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId));
  return rows;
}

async function computeHoursDone(assignmentId: number, ta: any) {
  const entries = await db
    .select({
      sessionDate: scheduleEntriesTable.sessionDate,
      startTime: scheduleEntriesTable.startTime,
      endTime: scheduleEntriesTable.endTime,
    })
    .from(scheduleEntriesTable)
    .where(
      and(
        eq(scheduleEntriesTable.teacherId, ta.teacherId),
        eq(scheduleEntriesTable.subjectId, ta.subjectId),
        eq(scheduleEntriesTable.classId, ta.classId),
        eq(scheduleEntriesTable.semesterId, ta.semesterId),
      )
    );

  const submitted = await db
    .select({ sessionDate: attendanceSessionsTable.sessionDate })
    .from(attendanceSessionsTable)
    .where(
      and(
        eq(attendanceSessionsTable.teacherId, ta.teacherId),
        eq(attendanceSessionsTable.subjectId, ta.subjectId),
        eq(attendanceSessionsTable.classId, ta.classId),
        eq(attendanceSessionsTable.semesterId, ta.semesterId),
        isNotNull(attendanceSessionsTable.sentAt),
      )
    );

  const submittedDates = new Set(submitted.map(s => s.sessionDate));

  let totalHours = 0;
  for (const e of entries) {
    if (submittedDates.has(e.sessionDate)) {
      const [sh, sm] = e.startTime.split(":").map(Number);
      const [eh, em] = e.endTime.split(":").map(Number);
      const dur = (eh * 60 + em - sh * 60 - sm) / 60;
      if (dur > 0) totalHours += dur;
    }
  }
  return Math.round(totalHours * 10) / 10;
}

// GET /api/admin/teacher-assignments/by-teacher/:teacherId — assignments for one teacher
router.get("/by-teacher/:teacherId", requireRole("admin"), async (req, res) => {
  try {
    const teacherId = parseInt(req.params.teacherId);
    if (isNaN(teacherId)) {
      return res.status(400).json({ error: "teacherId invalide" });
    }
    const rows = await db
      .select({
        id: teacherAssignmentsTable.id,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
        classId: teacherAssignmentsTable.classId,
        className: classesTable.name,
        semesterId: teacherAssignmentsTable.semesterId,
        semesterName: semestersTable.name,
        semesterPublished: semestersTable.published,
        semesterStart: semestersTable.startDate,
        semesterEnd: semestersTable.endDate,
      })
      .from(teacherAssignmentsTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId))
      .where(eq(teacherAssignmentsTable.teacherId, teacherId));
    res.json({ assignments: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const rows = await getEnriched();
    const withHours = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        completedHours: await computeHoursDone(r.id, r),
      }))
    );
    res.json(withHours);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { teacherId, subjectId, classId, semesterId, plannedHours } = req.body;
    if (!teacherId || !subjectId || !classId || !semesterId) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // ── Règle métier : une matière = un seul enseignant (par semestre) ─────
    const existing = await db
      .select({
        id: teacherAssignmentsTable.id,
        teacherName: usersTable.name,
        subjectName: subjectsTable.name,
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .where(
        and(
          eq(teacherAssignmentsTable.subjectId, parseInt(subjectId)),
          eq(teacherAssignmentsTable.semesterId, parseInt(semesterId)),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const { teacherName, subjectName } = existing[0];
      return res.status(409).json({
        error: "Conflict",
        message: `Cette matière (${subjectName}) est déjà attribuée à ${teacherName}. Veuillez d'abord retirer cette affectation avant d'en créer une nouvelle.`,
        existingTeacherName: teacherName,
        subjectName,
      });
    }

    const [row] = await db
      .insert(teacherAssignmentsTable)
      .values({ teacherId, subjectId, classId, semesterId, plannedHours: plannedHours ?? 30 })
      .returning();
    const rows = await getEnriched();
    const result = rows.find((r) => r.id === row.id)!;
    res.status(201).json({ ...result, completedHours: 0 });
  } catch (err: any) {
    // Catch DB-level unique violation as safety net
    if (err?.code === "23505") {
      return res.status(409).json({
        error: "Conflict",
        message: "Cette matière est déjà attribuée à un enseignant pour ce semestre.",
      });
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePlanificateur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { plannedHours } = req.body;
    const [row] = await db
      .update(teacherAssignmentsTable)
      .set({ plannedHours })
      .where(eq(teacherAssignmentsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not Found" });
    const rows = await getEnriched();
    const result = rows.find((r) => r.id === row.id)!;
    const completedHours = await computeHoursDone(id, result);
    res.json({ ...result, completedHours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePlanificateur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(teacherAssignmentsTable).where(eq(teacherAssignmentsTable.id, id));
    res.json({ message: "Affectation supprimée" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
