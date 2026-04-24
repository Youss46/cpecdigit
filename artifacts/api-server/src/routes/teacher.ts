import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  gradesTable,
  subjectsTable,
  classesTable,
  semestersTable,
  teacherAssignmentsTable,
  classEnrollmentsTable,
  subjectApprovalsTable,
  scheduleEntriesTable,
  roomsTable,
  gradeSubmissionsTable,
  notificationsTable,
  studentProfilesTable,
  attendanceTable,
  cahierDeTexteTable,
  retakeSessionsTable,
  retakeGradesTable,
} from "@workspace/db";
import { eq, and, sql, inArray, desc, asc, lt, isNull, or } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();

router.get("/assignments", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const assignments = await db
      .select({
        id: teacherAssignmentsTable.id,
        teacherId: teacherAssignmentsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
        coefficient: subjectsTable.coefficient,
        classId: teacherAssignmentsTable.classId,
        className: classesTable.name,
        semesterId: teacherAssignmentsTable.semesterId,
        semesterName: semestersTable.name,
        plannedHours: teacherAssignmentsTable.plannedHours,
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId))
      .where(eq(teacherAssignmentsTable.teacherId, teacherId));

    // Compute scheduled hours per assignment from schedule entries
    const scheduleRows = await db
      .select({
        subjectId: scheduleEntriesTable.subjectId,
        classId: scheduleEntriesTable.classId,
        semesterId: scheduleEntriesTable.semesterId,
        startTime: scheduleEntriesTable.startTime,
        endTime: scheduleEntriesTable.endTime,
      })
      .from(scheduleEntriesTable)
      .where(eq(scheduleEntriesTable.teacherId, teacherId));

    const scheduledMap: Record<string, number> = {};
    for (const row of scheduleRows) {
      const key = `${row.subjectId}-${row.classId}-${row.semesterId}`;
      const [sh, sm] = row.startTime.split(":").map(Number);
      const [eh, em] = row.endTime.split(":").map(Number);
      const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      scheduledMap[key] = (scheduledMap[key] ?? 0) + hours;
    }

    const result = assignments.map((a) => ({
      ...a,
      scheduledHoursPerWeek: Math.round((scheduledMap[`${a.subjectId}-${a.classId}-${a.semesterId}`] ?? 0) * 10) / 10,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/grades", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, semesterId, classId } = req.query;

    // Verify teacher is assigned to this subject/class/semester
    const conditions: any[] = [eq(teacherAssignmentsTable.teacherId, teacherId)];
    if (subjectId) conditions.push(eq(teacherAssignmentsTable.subjectId, parseInt(subjectId as string)));
    if (semesterId) conditions.push(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId as string)));
    if (classId) conditions.push(eq(teacherAssignmentsTable.classId, parseInt(classId as string)));

    const assignments = await db
      .select({ subjectId: teacherAssignmentsTable.subjectId, classId: teacherAssignmentsTable.classId, semesterId: teacherAssignmentsTable.semesterId })
      .from(teacherAssignmentsTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

    if (assignments.length === 0) {
      res.json([]);
      return;
    }

    const gradeConditions: any[] = [];
    if (subjectId) gradeConditions.push(eq(gradesTable.subjectId, parseInt(subjectId as string)));
    if (semesterId) gradeConditions.push(eq(gradesTable.semesterId, parseInt(semesterId as string)));

    let query = db
      .select({
        id: gradesTable.id,
        studentId: gradesTable.studentId,
        studentName: usersTable.name,
        subjectId: gradesTable.subjectId,
        subjectName: subjectsTable.name,
        coefficient: subjectsTable.coefficient,
        semesterId: gradesTable.semesterId,
        semesterName: semestersTable.name,
        evaluationNumber: gradesTable.evaluationNumber,
        value: gradesTable.value,
        createdAt: gradesTable.createdAt,
        updatedAt: gradesTable.updatedAt,
      })
      .from(gradesTable)
      .innerJoin(usersTable, eq(usersTable.id, gradesTable.studentId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
      .innerJoin(semestersTable, eq(semestersTable.id, gradesTable.semesterId));

    const grades = gradeConditions.length > 0
      ? await query.where(gradeConditions.length === 1 ? gradeConditions[0] : and(...gradeConditions))
      : await query;

    res.json(grades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/grades", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { studentId, subjectId, semesterId, value } = req.body;
    if (studentId === undefined || !subjectId || !semesterId || value === undefined) {
      res.status(400).json({ error: "Bad Request", message: "All fields are required" });
      return;
    }
    if (value < 0 || value > 20) {
      res.status(400).json({ error: "Bad Request", message: "Grade must be between 0 and 20" });
      return;
    }

    // Verify teacher assignment
    const [assignment] = await db
      .select()
      .from(teacherAssignmentsTable)
      .where(and(
        eq(teacherAssignmentsTable.teacherId, teacherId),
        eq(teacherAssignmentsTable.subjectId, subjectId),
        eq(teacherAssignmentsTable.semesterId, semesterId),
      ))
      .limit(1);

    if (!assignment && req.session!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "You are not assigned to this subject" });
      return;
    }

    const [grade] = await db
      .insert(gradesTable)
      .values({ studentId, subjectId, semesterId, value })
      .onConflictDoUpdate({
        target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId],
        set: { value, updatedAt: new Date() },
      })
      .returning();

    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    const [subject] = await db.select({ name: subjectsTable.name, coefficient: subjectsTable.coefficient }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);
    const [semester] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);

    res.json({
      id: grade.id, studentId, studentName: student?.name ?? "",
      subjectId, subjectName: subject?.name ?? "", coefficient: subject?.coefficient ?? 1,
      semesterId, semesterName: semester?.name ?? "",
      value: grade.value, createdAt: grade.createdAt, updatedAt: grade.updatedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/grades/bulk", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { grades } = req.body;
    if (!Array.isArray(grades) || grades.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "Grades array is required" });
      return;
    }

    // Check approval on the first grade entry (all share same subject/class/semester for bulk entry)
    if (grades.length > 0 && req.session!.role !== "admin") {
      const first = grades[0];
      const [approval] = await db
        .select()
        .from(subjectApprovalsTable)
        .innerJoin(teacherAssignmentsTable, and(
          eq(teacherAssignmentsTable.subjectId, subjectApprovalsTable.subjectId),
          eq(teacherAssignmentsTable.classId, subjectApprovalsTable.classId),
          eq(teacherAssignmentsTable.semesterId, subjectApprovalsTable.semesterId),
        ))
        .where(and(
          eq(subjectApprovalsTable.subjectId, first.subjectId),
          eq(subjectApprovalsTable.semesterId, first.semesterId),
        ))
        .limit(1);
      if (approval) {
        res.status(403).json({ error: "Notes verrouillées. Cette matière a été approuvée par le Responsable Scolarité." });
        return;
      }
    }

    const results = [];
    for (const g of grades) {
      const { studentId, subjectId, semesterId, value, evaluationNumber = 1 } = g;
      if (value < 0 || value > 20) continue;
      if (evaluationNumber < 1 || evaluationNumber > 4) continue;

      const [grade] = await db
        .insert(gradesTable)
        .values({ studentId, subjectId, semesterId, evaluationNumber, value })
        .onConflictDoUpdate({
          target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId, gradesTable.evaluationNumber],
          set: { value, updatedAt: new Date() },
        })
        .returning();

      const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
      const [subject] = await db.select({ name: subjectsTable.name, coefficient: subjectsTable.coefficient }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);
      const [semester] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);

      results.push({
        id: grade.id, studentId, studentName: student?.name ?? "",
        subjectId, subjectName: subject?.name ?? "", coefficient: subject?.coefficient ?? 1,
        semesterId, semesterName: semester?.name ?? "",
        value: grade.value, createdAt: grade.createdAt, updatedAt: grade.updatedAt,
      });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher Schedule ─────────────────────────────────────────────────────────

router.get("/schedule", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const rows = await db
      .select({
        id: scheduleEntriesTable.id,
        teacherId: scheduleEntriesTable.teacherId,
        teacherName: usersTable.name,
        subjectId: scheduleEntriesTable.subjectId,
        subjectName: subjectsTable.name,
        classId: scheduleEntriesTable.classId,
        className: classesTable.name,
        roomId: scheduleEntriesTable.roomId,
        roomName: roomsTable.name,
        semesterId: scheduleEntriesTable.semesterId,
        semesterName: semestersTable.name,
        sessionDate: scheduleEntriesTable.sessionDate,
        startTime: scheduleEntriesTable.startTime,
        endTime: scheduleEntriesTable.endTime,
        notes: scheduleEntriesTable.notes,
        published: scheduleEntriesTable.published,
        createdAt: scheduleEntriesTable.createdAt,
      })
      .from(scheduleEntriesTable)
      .innerJoin(usersTable, eq(usersTable.id, scheduleEntriesTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, scheduleEntriesTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, scheduleEntriesTable.classId))
      .innerJoin(roomsTable, eq(roomsTable.id, scheduleEntriesTable.roomId))
      .innerJoin(semestersTable, eq(semestersTable.id, scheduleEntriesTable.semesterId))
      .where(and(
        eq(scheduleEntriesTable.teacherId, teacherId),
        eq(scheduleEntriesTable.published, true)
      ));

    const sorted = rows.sort((a, b) => (a.sessionDate as string).localeCompare(b.sessionDate as string) || a.startTime.localeCompare(b.startTime));
    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /teacher/grade-submissions — teacher submits grades for admin review
router.post("/grade-submissions", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const teacherName = (req.session as any).name as string;
    const { subjectId, classId, semesterId } = req.body;
    if (!subjectId || !classId || !semesterId) {
      return res.status(400).json({ error: "subjectId, classId et semesterId sont requis." });
    }

    // Verify the teacher is assigned to this subject/class/semester
    const assignment = await db
      .select()
      .from(teacherAssignmentsTable)
      .where(
        and(
          eq(teacherAssignmentsTable.teacherId, teacherId),
          eq(teacherAssignmentsTable.subjectId, parseInt(subjectId)),
          eq(teacherAssignmentsTable.classId, parseInt(classId)),
          eq(teacherAssignmentsTable.semesterId, parseInt(semesterId)),
        )
      )
      .limit(1);
    if (assignment.length === 0) {
      return res.status(403).json({ error: "Affectation non trouvée pour cet enseignant." });
    }

    // Check if already approved (locked)
    const approval = await db
      .select()
      .from(subjectApprovalsTable)
      .where(
        and(
          eq(subjectApprovalsTable.subjectId, parseInt(subjectId)),
          eq(subjectApprovalsTable.classId, parseInt(classId)),
          eq(subjectApprovalsTable.semesterId, parseInt(semesterId)),
        )
      )
      .limit(1);
    if (approval.length > 0) {
      return res.status(403).json({ error: "Ces notes sont déjà approuvées et verrouillées." });
    }

    // Fetch names for denormalization
    const subjectRow = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, parseInt(subjectId))).limit(1);
    const classRow = await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, parseInt(classId))).limit(1);

    // Upsert grade submission (re-submit updates the timestamp)
    await db
      .insert(gradeSubmissionsTable)
      .values({
        teacherId,
        teacherName,
        subjectId: parseInt(subjectId),
        subjectName: subjectRow[0]?.name ?? "—",
        classId: parseInt(classId),
        className: classRow[0]?.name ?? "—",
        semesterId: parseInt(semesterId),
        submittedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [gradeSubmissionsTable.teacherId, gradeSubmissionsTable.subjectId, gradeSubmissionsTable.classId, gradeSubmissionsTable.semesterId],
        set: { submittedAt: new Date() },
      });

    res.json({ message: "Notes soumises pour validation." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /teacher/grade-submissions/status — get submission status for current teacher
router.get("/grade-submissions/status", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, semesterId } = req.query;
    if (!subjectId || !classId || !semesterId) {
      return res.status(400).json({ error: "subjectId, classId, semesterId sont requis." });
    }
    const submission = await db
      .select()
      .from(gradeSubmissionsTable)
      .where(
        and(
          eq(gradeSubmissionsTable.teacherId, teacherId),
          eq(gradeSubmissionsTable.subjectId, parseInt(subjectId as string)),
          eq(gradeSubmissionsTable.classId, parseInt(classId as string)),
          eq(gradeSubmissionsTable.semesterId, parseInt(semesterId as string)),
        )
      )
      .limit(1);
    res.json({ submitted: submission.length > 0, submittedAt: submission[0]?.submittedAt ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /teacher/approvals — get approval status for all teacher's assignments
router.get("/approvals", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    // Get all assignments for this teacher
    const assignments = await db
      .select({
        subjectId: teacherAssignmentsTable.subjectId,
        classId: teacherAssignmentsTable.classId,
        semesterId: teacherAssignmentsTable.semesterId,
      })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.teacherId, teacherId));

    if (assignments.length === 0) { res.json([]); return; }

    // Find which ones are approved — join users table to get the approver's name
    const approvals = await db
      .select({
        subjectId: subjectApprovalsTable.subjectId,
        classId: subjectApprovalsTable.classId,
        semesterId: subjectApprovalsTable.semesterId,
        approvedByName: usersTable.name,
        approvedAt: subjectApprovalsTable.approvedAt,
      })
      .from(subjectApprovalsTable)
      .innerJoin(usersTable, eq(usersTable.id, subjectApprovalsTable.approvedById));

    const approvedKeys = new Set(approvals.map(a => `${a.subjectId}-${a.classId}-${a.semesterId}`));
    const result = assignments
      .filter(a => approvedKeys.has(`${a.subjectId}-${a.classId}-${a.semesterId}`))
      .map(a => {
        const approval = approvals.find(ap => ap.subjectId === a.subjectId && ap.classId === a.classId && ap.semesterId === a.semesterId);
        return {
          subjectId: a.subjectId,
          classId: a.classId,
          semesterId: a.semesterId,
          approvedByName: approval?.approvedByName ?? null,
          approvedAt: approval?.approvedAt ? approval.approvedAt.toISOString() : null,
        };
      });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /teacher/grade-submissions/notify-students — send personalized grade notifications to each student
router.post("/grade-submissions/notify-students", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const teacherName = (req.session as any).name as string;
    const { subjectId, classId, semesterId } = req.body;
    if (!subjectId || !classId || !semesterId) {
      return res.status(400).json({ error: "subjectId, classId et semesterId sont requis." });
    }
    const sId = parseInt(subjectId);
    const cId = parseInt(classId);
    const smId = parseInt(semesterId);

    // Verify teacher assignment
    const assignment = await db
      .select()
      .from(teacherAssignmentsTable)
      .where(
        and(
          eq(teacherAssignmentsTable.teacherId, teacherId),
          eq(teacherAssignmentsTable.subjectId, sId),
          eq(teacherAssignmentsTable.classId, cId),
          eq(teacherAssignmentsTable.semesterId, smId),
        )
      )
      .limit(1);
    if (assignment.length === 0) {
      return res.status(403).json({ error: "Affectation non trouvée." });
    }

    // Get subject and semester names
    const [subjectRow] = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, sId)).limit(1);
    const [semesterRow] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, smId)).limit(1);
    const subjectName = subjectRow?.name ?? "Matière";
    const semesterName = semesterRow?.name ?? "Semestre";

    // Get all students enrolled in this class
    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.classId, cId));

    if (enrollments.length === 0) {
      return res.json({ message: "Aucun étudiant inscrit dans cette classe.", notifiedCount: 0 });
    }

    const studentIds = enrollments.map(e => e.studentId);

    // Get all grades for these students for this subject/semester
    const grades = await db
      .select()
      .from(gradesTable)
      .where(
        and(
          eq(gradesTable.subjectId, sId),
          eq(gradesTable.semesterId, smId),
        )
      );

    // Build a map: studentId → evalNumber → value
    const gradeMap = new Map<number, Map<number, number>>();
    for (const g of grades) {
      if (!studentIds.includes(g.studentId)) continue;
      if (!gradeMap.has(g.studentId)) gradeMap.set(g.studentId, new Map());
      gradeMap.get(g.studentId)!.set(g.evaluationNumber, parseFloat(g.value as any));
    }

    // Insert one notification per student
    const EVAL_COUNT = 4;
    const notifications = studentIds.map(studentId => {
      const evals = gradeMap.get(studentId) ?? new Map();
      const evalParts = Array.from({ length: EVAL_COUNT }, (_, i) => {
        const v = evals.get(i + 1);
        return `Éval${i + 1}: ${v !== undefined ? `${v}/20` : "—"}`;
      });
      const values = Array.from(evals.values());
      const avg = values.length > 0
        ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
        : null;
      const message = `${evalParts.join(" | ")}${avg !== null ? ` — Moyenne: ${avg}/20` : ""}\nTransmis par ${teacherName}.`;
      return {
        userId: studentId,
        type: "grades",
        title: `Notes en ${subjectName} (${semesterName})`,
        message,
      };
    });

    await db.insert(notificationsTable).values(notifications);
    res.json({ message: "Notes envoyées aux étudiants.", notifiedCount: notifications.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /teacher/students/:studentId — fiche détaillée d'un étudiant ────────
router.get("/students/:studentId", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const studentId = parseInt(req.params.studentId);

    // Check teacher is assigned to a class this student is enrolled in
    const teacherClasses = await db
      .selectDistinct({ classId: teacherAssignmentsTable.classId })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.teacherId, teacherId));
    const classIds = teacherClasses.map(c => c.classId);
    if (classIds.length === 0) {
      res.status(403).json({ error: "Aucune classe assignée." });
      return;
    }

    const [enrollment] = await db
      .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(and(
        eq(classEnrollmentsTable.studentId, studentId),
        inArray(classEnrollmentsTable.classId, classIds),
      ))
      .limit(1);

    if (!enrollment) {
      res.status(403).json({ error: "Cet étudiant n'est pas dans vos classes." });
      return;
    }

    const [student] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, studentId))
      .limit(1);

    const [profile] = await db
      .select({ photoUrl: studentProfilesTable.photoUrl, matricule: studentProfilesTable.matricule, phone: studentProfilesTable.phone })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.studentId, studentId))
      .limit(1);

    // Grades for this student in teacher's subjects only
    const teacherSubjects = await db
      .selectDistinct({ subjectId: teacherAssignmentsTable.subjectId, semesterId: teacherAssignmentsTable.semesterId })
      .from(teacherAssignmentsTable)
      .where(and(
        eq(teacherAssignmentsTable.teacherId, teacherId),
        eq(teacherAssignmentsTable.classId, enrollment.classId),
      ));

    const subjectIds = teacherSubjects.map(s => s.subjectId);
    const grades = subjectIds.length > 0
      ? await db
          .select({
            subjectId: gradesTable.subjectId,
            subjectName: subjectsTable.name,
            coefficient: subjectsTable.coefficient,
            semesterId: gradesTable.semesterId,
            semesterName: semestersTable.name,
            evaluationNumber: gradesTable.evaluationNumber,
            value: gradesTable.value,
          })
          .from(gradesTable)
          .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
          .innerJoin(semestersTable, eq(semestersTable.id, gradesTable.semesterId))
          .where(and(
            eq(gradesTable.studentId, studentId),
            inArray(gradesTable.subjectId, subjectIds),
          ))
          .orderBy(gradesTable.semesterId, subjectsTable.name, gradesTable.evaluationNumber)
      : [];

    // Absences for this student in teacher's classes
    const absences = await db
      .select({
        id: attendanceTable.id,
        sessionDate: attendanceTable.sessionDate,
        status: attendanceTable.status,
        subjectName: subjectsTable.name,
        semesterName: semestersTable.name,
        note: attendanceTable.note,
        justified: attendanceTable.justified,
      })
      .from(attendanceTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, attendanceTable.subjectId))
      .innerJoin(semestersTable, eq(semestersTable.id, attendanceTable.semesterId))
      .where(and(
        eq(attendanceTable.studentId, studentId),
        eq(attendanceTable.classId, enrollment.classId),
        inArray(attendanceTable.subjectId, subjectIds.length > 0 ? subjectIds : [-1]),
      ))
      .orderBy(desc(attendanceTable.sessionDate));

    res.json({
      student: { ...student, ...profile },
      enrollment,
      grades,
      absences,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /teacher/students — liste des étudiants pour les classes de l'enseignant ───
router.get("/students", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { classId, semesterId } = req.query;

    // Verify teacher is assigned to this class (if classId specified)
    if (classId) {
      const conditions = [eq(teacherAssignmentsTable.teacherId, teacherId), eq(teacherAssignmentsTable.classId, parseInt(classId as string))];
      if (semesterId) conditions.push(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId as string)));
      const assignment = await db.select({ id: teacherAssignmentsTable.id }).from(teacherAssignmentsTable).where(and(...conditions)).limit(1);
      if (assignment.length === 0) {
        res.status(403).json({ error: "Vous n'êtes pas assigné à cette classe." });
        return;
      }
    }

    // Get all class IDs assigned to this teacher (optionally filtered by semester)
    const assignmentConditions = [eq(teacherAssignmentsTable.teacherId, teacherId)];
    if (classId) assignmentConditions.push(eq(teacherAssignmentsTable.classId, parseInt(classId as string)));
    if (semesterId) assignmentConditions.push(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId as string)));

    const teacherClasses = await db
      .selectDistinct({ classId: teacherAssignmentsTable.classId })
      .from(teacherAssignmentsTable)
      .where(and(...assignmentConditions));

    if (teacherClasses.length === 0) {
      res.json([]);
      return;
    }

    const classIds = teacherClasses.map(c => c.classId);

    // Get all students enrolled in those classes
    const students = await db
      .select({
        studentId: classEnrollmentsTable.studentId,
        studentName: usersTable.name,
        studentEmail: usersTable.email,
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
        enrolledAt: classEnrollmentsTable.enrolledAt,
        phone: studentProfilesTable.phone,
        matricule: studentProfilesTable.matricule,
      })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, classEnrollmentsTable.studentId))
      .where(inArray(classEnrollmentsTable.classId, classIds))
      .orderBy(classesTable.name, usersTable.name);

    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Cahier de texte ─────────────────────────────────────────────────────────

// GET /teacher/cahier-de-texte — list entries for this teacher
router.get("/cahier-de-texte", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { classId, subjectId, semesterId } = req.query;

    const conditions: any[] = [eq(cahierDeTexteTable.teacherId, teacherId)];
    if (classId) conditions.push(eq(cahierDeTexteTable.classId, parseInt(classId as string)));
    if (subjectId) conditions.push(eq(cahierDeTexteTable.subjectId, parseInt(subjectId as string)));
    if (semesterId) conditions.push(eq(cahierDeTexteTable.semesterId, parseInt(semesterId as string)));

    const entries = await db
      .select({
        id: cahierDeTexteTable.id,
        sessionDate: cahierDeTexteTable.sessionDate,
        title: cahierDeTexteTable.title,
        contenu: cahierDeTexteTable.contenu,
        devoirs: cahierDeTexteTable.devoirs,
        heuresEffectuees: cahierDeTexteTable.heuresEffectuees,
        subjectId: cahierDeTexteTable.subjectId,
        subjectName: subjectsTable.name,
        classId: cahierDeTexteTable.classId,
        className: classesTable.name,
        semesterId: cahierDeTexteTable.semesterId,
        semesterName: semestersTable.name,
        createdAt: cahierDeTexteTable.createdAt,
        updatedAt: cahierDeTexteTable.updatedAt,
      })
      .from(cahierDeTexteTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, cahierDeTexteTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, cahierDeTexteTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, cahierDeTexteTable.semesterId))
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(cahierDeTexteTable.sessionDate), asc(subjectsTable.name));

    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /teacher/cahier-de-texte — create entry
router.post("/cahier-de-texte", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, semesterId, sessionDate, title, contenu, devoirs, heuresEffectuees } = req.body;

    if (!subjectId || !classId || !semesterId || !sessionDate || !title?.trim() || !contenu?.trim()) {
      res.status(400).json({ error: "Champs obligatoires manquants (matière, classe, semestre, date, titre, contenu)" });
      return;
    }

    // Verify teacher is assigned to this class/subject/semester
    const [assignment] = await db
      .select({ id: teacherAssignmentsTable.id })
      .from(teacherAssignmentsTable)
      .where(and(
        eq(teacherAssignmentsTable.teacherId, teacherId),
        eq(teacherAssignmentsTable.subjectId, parseInt(subjectId)),
        eq(teacherAssignmentsTable.classId, parseInt(classId)),
        eq(teacherAssignmentsTable.semesterId, parseInt(semesterId)),
      ))
      .limit(1);

    if (!assignment) {
      res.status(403).json({ error: "Vous n'êtes pas assigné à cette matière/classe/semestre." });
      return;
    }

    const [entry] = await db
      .insert(cahierDeTexteTable)
      .values({
        teacherId,
        subjectId: parseInt(subjectId),
        classId: parseInt(classId),
        semesterId: parseInt(semesterId),
        sessionDate,
        title: title.trim(),
        contenu: contenu.trim(),
        devoirs: devoirs?.trim() || null,
        heuresEffectuees: heuresEffectuees ? parseFloat(heuresEffectuees) : null,
      })
      .returning();

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /teacher/cahier-de-texte/:id — update entry
router.put("/cahier-de-texte/:id", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const entryId = parseInt(req.params.id);
    const { sessionDate, title, contenu, devoirs, heuresEffectuees } = req.body;

    const [existing] = await db
      .select({ id: cahierDeTexteTable.id, teacherId: cahierDeTexteTable.teacherId })
      .from(cahierDeTexteTable)
      .where(and(eq(cahierDeTexteTable.id, entryId), eq(cahierDeTexteTable.teacherId, teacherId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Entrée introuvable ou non autorisée." });
      return;
    }

    const [updated] = await db
      .update(cahierDeTexteTable)
      .set({
        sessionDate: sessionDate ?? undefined,
        title: title?.trim() ?? undefined,
        contenu: contenu?.trim() ?? undefined,
        devoirs: devoirs?.trim() || null,
        heuresEffectuees: heuresEffectuees !== undefined ? (heuresEffectuees ? parseFloat(heuresEffectuees) : null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(cahierDeTexteTable.id, entryId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /teacher/cahier-de-texte/:id — delete entry
router.delete("/cahier-de-texte/:id", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const entryId = parseInt(req.params.id);

    const [existing] = await db
      .select({ id: cahierDeTexteTable.id })
      .from(cahierDeTexteTable)
      .where(and(eq(cahierDeTexteTable.id, entryId), eq(cahierDeTexteTable.teacherId, teacherId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Entrée introuvable ou non autorisée." });
      return;
    }

    await db.delete(cahierDeTexteTable).where(eq(cahierDeTexteTable.id, entryId));
    res.json({ message: "Entrée supprimée." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Profil enseignant modifiable (T004) ─────────────────────────────────────

router.put("/profile", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { name, email, phone } = req.body;

    const updates: any = { updatedAt: new Date() };
    if (name?.trim()) updates.name = name.trim();
    if (email?.trim()) updates.email = email.trim().toLowerCase();
    if (phone !== undefined) updates.phone = phone?.trim() || null;

    if (Object.keys(updates).length === 1) {
      res.status(400).json({ error: "Aucune donnée à mettre à jour." });
      return;
    }

    if (email?.trim()) {
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email.trim().toLowerCase()))
        .limit(1);
      if (existing && existing.id !== teacherId) {
        res.status(409).json({ error: "Cet email est déjà utilisé." });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, teacherId))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ===========================
// RETAKE SESSION ROUTES (Teacher)
// ===========================

// GET /teacher/rattrapage/session — Get current open session + eligible students (with < 10 in subject)
router.get("/rattrapage/session", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;

    // Find the open retake session (most recent)
    const openSession = await db
      .select({
        id: retakeSessionsTable.id,
        label: retakeSessionsTable.label,
        status: retakeSessionsTable.status,
        semesterId: retakeSessionsTable.semesterId,
        semesterName: semestersTable.name,
        openedAt: retakeSessionsTable.openedAt,
        closedAt: retakeSessionsTable.closedAt,
      })
      .from(retakeSessionsTable)
      .leftJoin(semestersTable, eq(retakeSessionsTable.semesterId, semestersTable.id))
      .orderBy(desc(retakeSessionsTable.openedAt))
      .limit(1);

    if (!openSession[0]) return res.json({ session: null, subjects: [] });

    const session = openSession[0];

    // Get teacher's subjects for this semester
    const assignments = await db
      .select({
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
        classId: teacherAssignmentsTable.classId,
        className: classesTable.name,
      })
      .from(teacherAssignmentsTable)
      .leftJoin(subjectsTable, eq(teacherAssignmentsTable.subjectId, subjectsTable.id))
      .leftJoin(classesTable, eq(teacherAssignmentsTable.classId, classesTable.id))
      .where(and(
        eq(teacherAssignmentsTable.teacherId, teacherId),
        eq(teacherAssignmentsTable.semesterId, session.semesterId!),
      ));

    if (assignments.length === 0) return res.json({ session, subjects: [] });

    const result = [];

    for (const assignment of assignments) {
      // Get students enrolled in this class
      const enrolled = await db
        .select({
          studentId: classEnrollmentsTable.studentId,
          studentName: usersTable.name,
          matricule: studentProfilesTable.matricule,
        })
        .from(classEnrollmentsTable)
        .leftJoin(usersTable, eq(classEnrollmentsTable.studentId, usersTable.id))
        .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, classEnrollmentsTable.studentId))
        .where(and(
          eq(classEnrollmentsTable.classId, assignment.classId!),
          eq(classEnrollmentsTable.semesterId, session.semesterId!),
        ));

      const students = [];
      for (const student of enrolled) {
        // Find all grades for this student in this subject this semester (not evaluationNumber=99)
        const grades = await db
          .select({ value: gradesTable.value, evaluationNumber: gradesTable.evaluationNumber })
          .from(gradesTable)
          .where(and(
            eq(gradesTable.studentId, student.studentId!),
            eq(gradesTable.subjectId, assignment.subjectId!),
            eq(gradesTable.semesterId, session.semesterId!),
          ));

        const normalGrades = grades.filter(g => g.evaluationNumber !== 99);
        if (normalGrades.length === 0) {
          // No grade at all — eligible (absent)
          const existingRetake = await db
            .select()
            .from(retakeGradesTable)
            .where(and(
              eq(retakeGradesTable.sessionId, session.id),
              eq(retakeGradesTable.studentId, student.studentId!),
              eq(retakeGradesTable.subjectId, assignment.subjectId!),
            ))
            .limit(1);
          students.push({
            studentId: student.studentId,
            studentName: student.studentName,
            matricule: student.matricule,
            normalGrade: null,
            status: "Absent",
            retakeGrade: existingRetake[0] ?? null,
          });
        } else {
          const avg = normalGrades.reduce((s, g) => s + g.value, 0) / normalGrades.length;
          if (avg < 10) {
            const existingRetake = await db
              .select()
              .from(retakeGradesTable)
              .where(and(
                eq(retakeGradesTable.sessionId, session.id),
                eq(retakeGradesTable.studentId, student.studentId!),
                eq(retakeGradesTable.subjectId, assignment.subjectId!),
              ))
              .limit(1);
            students.push({
              studentId: student.studentId,
              studentName: student.studentName,
              matricule: student.matricule,
              normalGrade: Math.round(avg * 100) / 100,
              status: "Ajourné",
              retakeGrade: existingRetake[0] ?? null,
            });
          }
        }
      }

      if (students.length > 0) {
        result.push({
          subjectId: assignment.subjectId,
          subjectName: assignment.subjectName,
          classId: assignment.classId,
          className: assignment.className,
          students,
        });
      }
    }

    res.json({ session, subjects: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /teacher/rattrapage/:sessionId/grades — Save draft grades (upsert)
router.put("/rattrapage/:sessionId/grades", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const sessionId = parseInt(req.params.sessionId);
    const { grades } = req.body; // [{ studentId, subjectId, value, observation }]

    if (!Array.isArray(grades)) return res.status(400).json({ error: "grades doit être un tableau" });

    const session = await db.select().from(retakeSessionsTable).where(eq(retakeSessionsTable.id, sessionId)).limit(1);
    if (!session[0]) return res.status(404).json({ error: "Session introuvable" });
    if (session[0].status === "closed") return res.status(403).json({ error: "Session clôturée" });

    for (const g of grades) {
      const { studentId, subjectId, value, observation } = g;
      if (!studentId || !subjectId) continue;
      if (value !== null && value !== undefined && (value < 0 || value > 20)) {
        return res.status(400).json({ error: `Note invalide pour étudiant ${studentId}: doit être entre 0 et 20` });
      }

      const existing = await db
        .select()
        .from(retakeGradesTable)
        .where(and(
          eq(retakeGradesTable.sessionId, sessionId),
          eq(retakeGradesTable.studentId, studentId),
          eq(retakeGradesTable.subjectId, subjectId),
        ))
        .limit(1);

      if (existing[0]) {
        if (existing[0].submissionStatus === "submitted" || existing[0].submissionStatus === "validated") continue;
        await db.update(retakeGradesTable).set({
          value: value ?? null,
          observation: observation ?? null,
          updatedAt: new Date(),
        }).where(eq(retakeGradesTable.id, existing[0].id));
      } else {
        await db.insert(retakeGradesTable).values({
          sessionId,
          studentId,
          subjectId,
          teacherId,
          value: value ?? null,
          observation: observation ?? null,
          submissionStatus: "draft",
        });
      }
    }

    res.json({ saved: grades.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /teacher/rattrapage/:sessionId/submit — Submit grades for a subject
router.post("/rattrapage/:sessionId/submit", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const sessionId = parseInt(req.params.sessionId);
    const { subjectId } = req.body;

    const session = await db.select().from(retakeSessionsTable).where(eq(retakeSessionsTable.id, sessionId)).limit(1);
    if (!session[0]) return res.status(404).json({ error: "Session introuvable" });
    if (session[0].status === "closed") return res.status(403).json({ error: "Session clôturée" });

    // Get all retake grades for this teacher/session/subject
    const draftGrades = await db
      .select()
      .from(retakeGradesTable)
      .where(and(
        eq(retakeGradesTable.sessionId, sessionId),
        eq(retakeGradesTable.teacherId, teacherId),
        eq(retakeGradesTable.subjectId, subjectId),
      ));

    // Check for missing grades (no value and no "Absent" observation)
    const missing = draftGrades.filter(g => g.value === null && (!g.observation || !g.observation.toLowerCase().includes("absent")));
    if (missing.length > 0) {
      return res.status(400).json({
        error: `${missing.length} étudiant(s) n'ont pas de note et ne sont pas marqués absents.`,
        missingCount: missing.length,
      });
    }

    // Mark all as submitted
    await db.update(retakeGradesTable)
      .set({ submissionStatus: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(retakeGradesTable.sessionId, sessionId),
        eq(retakeGradesTable.teacherId, teacherId),
        eq(retakeGradesTable.subjectId, subjectId),
      ));

    // Notify admin
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    const subject = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);
    const subjectName = subject[0]?.name ?? "matière";
    const teacher = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, teacherId)).limit(1);
    const teacherName = teacher[0]?.name ?? "Enseignant";

    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map(a => ({
          userId: a.id,
          type: "retake_submitted",
          title: "Notes de rattrapage soumises",
          message: `${teacherName} a soumis ${draftGrades.length} note(s) de rattrapage pour ${subjectName}.`,
          read: false,
        }))
      );
    }

    res.json({ submitted: draftGrades.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /teacher/rattrapage/history — Past retake sessions with grades
router.get("/rattrapage/history", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;

    const sessions = await db
      .select({
        id: retakeSessionsTable.id,
        label: retakeSessionsTable.label,
        status: retakeSessionsTable.status,
        semesterId: retakeSessionsTable.semesterId,
        semesterName: semestersTable.name,
        openedAt: retakeSessionsTable.openedAt,
        closedAt: retakeSessionsTable.closedAt,
      })
      .from(retakeSessionsTable)
      .leftJoin(semestersTable, eq(retakeSessionsTable.semesterId, semestersTable.id))
      .orderBy(desc(retakeSessionsTable.openedAt));

    const result = [];
    for (const session of sessions) {
      const grades = await db
        .select({
          id: retakeGradesTable.id,
          studentId: retakeGradesTable.studentId,
          studentName: usersTable.name,
          subjectId: retakeGradesTable.subjectId,
          subjectName: subjectsTable.name,
          value: retakeGradesTable.value,
          observation: retakeGradesTable.observation,
          submissionStatus: retakeGradesTable.submissionStatus,
          submittedAt: retakeGradesTable.submittedAt,
          validatedAt: retakeGradesTable.validatedAt,
        })
        .from(retakeGradesTable)
        .leftJoin(usersTable, eq(retakeGradesTable.studentId, usersTable.id))
        .leftJoin(subjectsTable, eq(retakeGradesTable.subjectId, subjectsTable.id))
        .where(and(
          eq(retakeGradesTable.sessionId, session.id),
          eq(retakeGradesTable.teacherId, teacherId),
        ))
        .orderBy(asc(usersTable.name));

      if (grades.length > 0) {
        result.push({ ...session, grades });
      }
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
