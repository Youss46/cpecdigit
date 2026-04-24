import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  studentProfilesTable,
  classEnrollmentsTable,
  classesTable,
  semestersTable,
  attendanceTable,
  notificationsTable,
  parentStudentLinksTable,
  subjectsTable,
  scheduleEntriesTable,
  gradesTable,
  studentFeesTable,
  paymentsTable,
  paymentInstallmentsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();

// ─── Helper: get linked students for a parent ──────────────────────────────
async function getLinkedStudentIds(parentId: number): Promise<number[]> {
  const links = await db
    .select({ studentId: parentStudentLinksTable.studentId })
    .from(parentStudentLinksTable)
    .where(eq(parentStudentLinksTable.parentId, parentId));
  return links.map((l) => l.studentId);
}

// ─── GET /parent/profile — infos parent + enfants liés ─────────────────────
router.get("/parent/profile", requireRole("parent"), async (req, res) => {
  try {
    const parentId = req.session!.userId!;
    const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, parentId)).limit(1);
    if (!user) { res.status(404).json({ error: "Parent introuvable" }); return; }

    const studentIds = await getLinkedStudentIds(parentId);
    const students = studentIds.length > 0
      ? await db.select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          matricule: studentProfilesTable.matricule,
          photoUrl: studentProfilesTable.photoUrl,
          phone: studentProfilesTable.phone,
        })
          .from(usersTable)
          .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, usersTable.id))
          .where(inArray(usersTable.id, studentIds))
      : [];

    // For each student, get current class
    const studentsWithClass = await Promise.all(students.map(async (s) => {
      const [enroll] = await db.select({ className: classesTable.name, classId: classesTable.id })
        .from(classEnrollmentsTable)
        .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
        .where(eq(classEnrollmentsTable.studentId, s.id))
        .orderBy(desc(classEnrollmentsTable.enrolledAt))
        .limit(1);
      return { ...s, className: enroll?.className ?? null, classId: enroll?.classId ?? null };
    }));

    res.json({ parent: user, students: studentsWithClass });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /parent/student/:studentId/results — résultats académiques ────────
router.get("/parent/student/:studentId/results", requireRole("parent"), async (req, res) => {
  try {
    const parentId = req.session!.userId!;
    const studentId = parseInt(req.params.studentId);
    const linkedIds = await getLinkedStudentIds(parentId);
    if (!linkedIds.includes(studentId)) { res.status(403).json({ error: "Accès refusé" }); return; }

    const semesters = await db.select().from(semestersTable)
      .where(eq(semestersTable.published, true))
      .orderBy(desc(semestersTable.startDate));

    const results = await Promise.all(semesters.map(async (sem) => {
      const gradeRows = await db.select({
        subjectId: gradesTable.subjectId,
        subjectName: subjectsTable.name,
        coefficient: subjectsTable.coefficient,
        grade: gradesTable.grade,
        approved: gradesTable.approved,
      })
        .from(gradesTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
        .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, sem.id)));

      return { semesterId: sem.id, semesterName: sem.name, academicYear: sem.academicYear, grades: gradeRows };
    }));

    res.json(results.filter(r => r.grades.length > 0));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /parent/student/:studentId/absences — bilan absences ──────────────
router.get("/parent/student/:studentId/absences", requireRole("parent"), async (req, res) => {
  try {
    const parentId = req.session!.userId!;
    const studentId = parseInt(req.params.studentId);
    const linkedIds = await getLinkedStudentIds(parentId);
    if (!linkedIds.includes(studentId)) { res.status(403).json({ error: "Accès refusé" }); return; }

    const { semesterId } = req.query as { semesterId?: string };

    let query = db.select({
      id: attendanceTable.id,
      sessionDate: attendanceTable.sessionDate,
      status: attendanceTable.status,
      justified: attendanceTable.justified,
      note: attendanceTable.note,
      subjectName: subjectsTable.name,
      startTime: attendanceTable.startTime,
      endTime: attendanceTable.endTime,
      semesterId: attendanceTable.semesterId,
    })
      .from(attendanceTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, attendanceTable.subjectId))
      .where(and(
        eq(attendanceTable.studentId, studentId),
        ...(semesterId ? [eq(attendanceTable.semesterId, parseInt(semesterId))] : []),
      ))
      .orderBy(desc(attendanceTable.sessionDate)) as any;

    const rows = await query;
    const absences = (rows as any[]).filter((r: any) => r.status === "absent" || r.status === "late");

    const semesters = await db.select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable).orderBy(desc(semestersTable.startDate));

    res.json({ absences, totalAbsences: absences.filter((r: any) => r.status === "absent").length, totalLates: absences.filter((r: any) => r.status === "late").length, semesters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /parent/student/:studentId/schedule — emploi du temps publié ──────
router.get("/parent/student/:studentId/schedule", requireRole("parent"), async (req, res) => {
  try {
    const parentId = req.session!.userId!;
    const studentId = parseInt(req.params.studentId);
    const linkedIds = await getLinkedStudentIds(parentId);
    if (!linkedIds.includes(studentId)) { res.status(403).json({ error: "Accès refusé" }); return; }

    // Get current class
    const [enroll] = await db.select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .orderBy(desc(classEnrollmentsTable.enrolledAt))
      .limit(1);

    if (!enroll) { res.json([]); return; }

    const { semesterId } = req.query as { semesterId?: string };
    const publishedSemesters = semesterId
      ? [{ id: parseInt(semesterId) }]
      : await db.select({ id: semestersTable.id }).from(semestersTable)
          .where(and(eq(semestersTable.published, true))).orderBy(desc(semestersTable.startDate)).limit(1);

    if (!publishedSemesters.length) { res.json([]); return; }

    const schedule = await db.select({
      id: scheduleEntriesTable.id,
      dayOfWeek: scheduleEntriesTable.dayOfWeek,
      startTime: scheduleEntriesTable.startTime,
      endTime: scheduleEntriesTable.endTime,
      subjectName: subjectsTable.name,
      teacherName: usersTable.name,
      roomName: scheduleEntriesTable.roomId,
      semesterId: scheduleEntriesTable.semesterId,
    })
      .from(scheduleEntriesTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, scheduleEntriesTable.subjectId))
      .innerJoin(usersTable, eq(usersTable.id, scheduleEntriesTable.teacherId))
      .where(and(
        eq(scheduleEntriesTable.classId, enroll.classId),
        eq(scheduleEntriesTable.semesterId, publishedSemesters[0].id),
        eq(scheduleEntriesTable.published, true),
      ))
      .orderBy(scheduleEntriesTable.dayOfWeek, scheduleEntriesTable.startTime);

    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /parent/student/:studentId/info — fiche étudiant ──────────────────
router.get("/parent/student/:studentId/info", requireRole("parent"), async (req, res) => {
  try {
    const parentId = req.session!.userId!;
    const studentId = parseInt(req.params.studentId);
    const linkedIds = await getLinkedStudentIds(parentId);
    if (!linkedIds.includes(studentId)) { res.status(403).json({ error: "Accès refusé" }); return; }

    const [info] = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      matricule: studentProfilesTable.matricule,
      dateNaissance: studentProfilesTable.dateNaissance,
      lieuNaissance: studentProfilesTable.lieuNaissance,
      phone: studentProfilesTable.phone,
      photoUrl: studentProfilesTable.photoUrl,
      sexe: studentProfilesTable.sexe,
    })
      .from(usersTable)
      .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, usersTable.id))
      .where(eq(usersTable.id, studentId))
      .limit(1);

    if (!info) { res.status(404).json({ error: "Étudiant introuvable" }); return; }

    const [enroll] = await db.select({ className: classesTable.name, classId: classesTable.id })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .orderBy(desc(classEnrollmentsTable.enrolledAt))
      .limit(1);

    res.json({ ...info, className: enroll?.className ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /parent/student/:studentId/scolarite ─────────────────────────────
// Situation financière complète de l'enfant — lecture seule pour le parent
router.get("/parent/student/:studentId/scolarite", requireRole("parent"), async (req, res) => {
  try {
    const parentId = req.session!.userId!;
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "studentId invalide" }); return; }

    // 🔒 Security: strict link check
    const linkedIds = await getLinkedStudentIds(parentId);
    if (!linkedIds.includes(studentId)) {
      res.status(403).json({ error: "Accès refusé — cet étudiant ne vous est pas lié." });
      return;
    }

    // ── Fee info ──────────────────────────────────────────────────────────────
    const [fee] = await db.select().from(studentFeesTable)
      .where(eq(studentFeesTable.studentId, studentId)).limit(1);

    const [paidAgg] = await db
      .select({ totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
      .from(paymentsTable)
      .where(eq(paymentsTable.studentId, studentId));

    const totalAmount = fee?.totalAmount ?? 0;
    const totalPaid = Number(paidAgg?.totalPaid ?? 0);
    const remaining = Math.max(0, totalAmount - totalPaid);
    let status: "À jour" | "Partiellement payé" | "Impayé" = "Impayé";
    if (totalAmount > 0) {
      if (totalPaid >= totalAmount) status = "À jour";
      else if (totalPaid > 0) status = "Partiellement payé";
    }

    // ── Payments list ─────────────────────────────────────────────────────────
    const payments = await db
      .select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        description: paymentsTable.description,
        paymentDate: paymentsTable.paymentDate,
        paymentMethod: paymentsTable.paymentMethod,
        reference: paymentsTable.reference,
        status: paymentsTable.status,
        createdAt: paymentsTable.createdAt,
        recordedByName: usersTable.name,
      })
      .from(paymentsTable)
      .leftJoin(usersTable, eq(usersTable.id, paymentsTable.recordedById))
      .where(eq(paymentsTable.studentId, studentId))
      .orderBy(desc(paymentsTable.paymentDate));

    // ── Installments / Échéancier ─────────────────────────────────────────────
    const rawInstallments = await db
      .select()
      .from(paymentInstallmentsTable)
      .where(eq(paymentInstallmentsTable.studentId, studentId))
      .orderBy(paymentInstallmentsTable.dueDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const installments = rawInstallments.map(inst => {
      const due = new Date(inst.dueDate);
      due.setHours(0, 0, 0, 0);
      let instStatus: "Payée" | "En attente" | "En retard" = "En attente";
      if (inst.paidAt) {
        instStatus = "Payée";
      } else if (due < today) {
        instStatus = "En retard";
      }
      return {
        id: inst.id,
        label: inst.label,
        dueDate: inst.dueDate,
        amount: inst.amount,
        paidAt: inst.paidAt,
        status: instStatus,
      };
    });

    res.json({
      fee: fee ?? null,
      totalAmount,
      totalPaid,
      remaining,
      status,
      academicYear: fee?.academicYear ?? null,
      payments,
      installments,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;

// ─── Exported helper: notify parents of a student ──────────────────────────
export async function notifyParentsOfStudent(
  studentId: number,
  type: string,
  title: string,
  message: string
): Promise<void> {
  const links = await db
    .select({ parentId: parentStudentLinksTable.parentId })
    .from(parentStudentLinksTable)
    .where(eq(parentStudentLinksTable.studentId, studentId));

  for (const link of links) {
    await db.insert(notificationsTable).values({
      userId: link.parentId,
      type,
      title,
      message,
      read: false,
    });
    sendPushToUser(link.parentId, { title, body: message, type }).catch(() => {});
  }
}
