import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import {
  usersTable,
  gradesTable,
  subjectsTable,
  semestersTable,
  classEnrollmentsTable,
  classesTable,
  studentProfilesTable,
  attendanceTable,
  absenceJustificationsTable,
  studentFeesTable,
  paymentsTable,
  scheduleEntriesTable,
  schedulePublicationsTable,
  roomsTable,
  reclamationPeriodsTable,
  teachingUnitsTable,
  specialJuryDecisionsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const unique = `just-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Seuls les fichiers PDF sont acceptés."));
  },
});

const router = Router();

router.get("/me", requireRole("student", "admin"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    const [enroll] = await db
      .select({
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
        filiere: classesTable.filiere,
        isTerminal: classesTable.isTerminal,
      })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, studentId)).limit(1);

    const activeSemester = await db
      .select({ id: semestersTable.id, name: semestersTable.name, startDate: semestersTable.startDate, endDate: semestersTable.endDate })
      .from(semestersTable)
      .orderBy(semestersTable.id)
      .then(rows => {
        const now = new Date();
        const active = rows.find(s => {
          if (!s.startDate || !s.endDate) return false;
          return new Date(s.startDate) <= now && now <= new Date(s.endDate);
        });
        return active ?? null;
      });

    res.json({
      id: user.id, name: user.name, email: user.email,
      classId: enroll?.classId ?? null,
      className: enroll?.className ?? null,
      filiere: enroll?.filiere ?? null,
      isTerminal: enroll?.isTerminal ?? false,
      photoUrl: profile?.photoUrl ?? null,
      matricule: profile?.matricule ?? null,
      dateNaissance: profile?.dateNaissance ?? null,
      lieuNaissance: profile?.lieuNaissance ?? null,
      phone: profile?.phone ?? null,
      address: profile?.address ?? null,
      parentName: profile?.parentName ?? null,
      parentPhone: profile?.parentPhone ?? null,
      parentEmail: profile?.parentEmail ?? null,
      parentAddress: profile?.parentAddress ?? null,
      activeSemester: activeSemester,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/photo", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { photoUrl } = req.body;
    if (!photoUrl || typeof photoUrl !== "string") {
      res.status(400).json({ error: "Bad Request", message: "photoUrl is required" });
      return;
    }
    if (photoUrl.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: "Bad Request", message: "Image trop grande (max 7MB)" });
      return;
    }
    const [existing] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, studentId)).limit(1);
    if (existing) {
      await db.update(studentProfilesTable).set({ photoUrl, updatedAt: new Date() }).where(eq(studentProfilesTable.studentId, studentId));
    } else {
      await db.insert(studentProfilesTable).values({ studentId, photoUrl, updatedAt: new Date() });
    }
    res.json({ photoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /student/grades/evaluations?subjectId=X&semesterId=Y — individual eval rows for a subject
router.get("/grades/evaluations", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const subjectId = parseInt(req.query.subjectId as string);
    const semesterId = parseInt(req.query.semesterId as string);
    if (!subjectId || !semesterId) {
      res.status(400).json({ error: "subjectId and semesterId are required" });
      return;
    }
    const rows = await db
      .select({ evaluationNumber: gradesTable.evaluationNumber, value: gradesTable.value })
      .from(gradesTable)
      .where(and(
        eq(gradesTable.studentId, studentId),
        eq(gradesTable.subjectId, subjectId),
        eq(gradesTable.semesterId, semesterId),
      ))
      .orderBy(gradesTable.evaluationNumber);
    res.json({ evaluations: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/grades", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { semesterId } = req.query;

    if (!semesterId) {
      res.status(400).json({ error: "Bad Request", message: "semesterId is required" });
      return;
    }

    const semId = parseInt(semesterId as string);
    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semId)).limit(1);
    if (!semester) { res.status(404).json({ error: "Not Found" }); return; }

    const [enroll] = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    const classId = enroll?.classId;
    const subjects = classId
      ? await db.select().from(subjectsTable).where(eq(subjectsTable.classId, classId))
      : [];

    const studentGrades = await db
      .select()
      .from(gradesTable)
      .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, semId)));

    const gradeMap = new Map<number, number[]>();
    for (const g of studentGrades) {
      const arr = gradeMap.get(g.subjectId) ?? [];
      arr.push(g.value);
      gradeMap.set(g.subjectId, arr);
    }

    const now = new Date();
    let hasActiveReclamationPeriod = false;
    if (!semester.published) {
      const [activePeriod] = await db
        .select({ id: reclamationPeriodsTable.id })
        .from(reclamationPeriodsTable)
        .where(and(
          eq(reclamationPeriodsTable.semesterId, semId),
          eq(reclamationPeriodsTable.isActive, true),
          sql`${reclamationPeriodsTable.openDate} <= ${now}`,
          sql`${reclamationPeriodsTable.closeDate} >= ${now}`,
        ))
        .limit(1);
      hasActiveReclamationPeriod = !!activePeriod;
    }

    const gradesVisible = semester.published || hasActiveReclamationPeriod;

    const grades = subjects.map((s) => {
      const values = gradeMap.get(s.id);
      let value: number | null = null;
      if (gradesVisible && values && values.length > 0) {
        value = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
      }
      return {
        subjectId: s.id,
        subjectName: s.name,
        coefficient: s.coefficient,
        value,
      };
    });

    let average: number | null = null;
    let decision: "Admis" | "Ajourné" | "En attente" | null = null;

    if (gradesVisible) {
      const gradedSubjects = grades.filter((g) => g.value !== null);
      if (gradedSubjects.length > 0) {
        const totalCoeff = gradedSubjects.reduce((sum, g) => sum + g.coefficient, 0);
        const totalPoints = gradedSubjects.reduce((sum, g) => sum + (g.value! * g.coefficient), 0);
        average = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
        if (average !== null) {
          decision = average >= 12 ? "Admis" : "Ajourné";
        }
      } else {
        decision = "En attente";
      }
    }

    res.json({
      semesterId: semester.id,
      semesterName: semester.name,
      published: semester.published,
      grades,
      average,
      decision,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/results", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { semesterId } = req.query;

    if (!semesterId) {
      res.status(400).json({ error: "Bad Request", message: "semesterId is required" });
      return;
    }

    const semId = parseInt(semesterId as string);
    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semId)).limit(1);
    if (!semester || !semester.published) {
      res.status(403).json({ error: "Forbidden", message: "Results are not published yet" });
      return;
    }

    const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    if (!student) { res.status(404).json({ error: "Not Found" }); return; }

    const [enroll] = await db
      .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    const classId = enroll?.classId ?? null;
    const subjects = classId
      ? await db.select().from(subjectsTable).where(eq(subjectsTable.classId, classId))
      : [];

    const studentGrades = await db
      .select()
      .from(gradesTable)
      .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, semId)));

    const gradeMap = new Map<number, number[]>();
    for (const g of studentGrades) {
      const arr = gradeMap.get(g.subjectId) ?? [];
      arr.push(g.value);
      gradeMap.set(g.subjectId, arr);
    }
    const grades = subjects.map((s) => {
      const values = gradeMap.get(s.id);
      let value: number | null = null;
      if (values && values.length > 0) {
        value = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
      }
      return {
        subjectId: s.id,
        subjectName: s.name,
        coefficient: s.coefficient,
        value,
      };
    });

    let average: number | null = null;
    let decision: "Admis" | "Ajourné" | "En attente" = "En attente";
    const gradedSubjects = grades.filter((g) => g.value !== null);
    if (gradedSubjects.length > 0) {
      const totalCoeff = gradedSubjects.reduce((sum, g) => sum + g.coefficient, 0);
      const totalPoints = gradedSubjects.reduce((sum, g) => sum + (g.value! * g.coefficient), 0);
      average = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
      if (average !== null) {
        decision = average >= 12 ? "Admis" : "Ajourné";
      }
    }

    // Compute rank among classmates
    let rank: number | null = null;
    let totalStudents: number | null = null;

    if (classId && average !== null) {
      const classmates = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, classId));

      const classmateAverages: { studentId: number; average: number }[] = [];
      for (const cm of classmates) {
        const cmGrades = await db
          .select({ value: gradesTable.value, coefficient: subjectsTable.coefficient })
          .from(gradesTable)
          .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
          .where(and(eq(gradesTable.studentId, cm.studentId), eq(gradesTable.semesterId, semId)));

        if (cmGrades.length > 0) {
          const totalC = cmGrades.reduce((s, g) => s + g.coefficient, 0);
          const totalP = cmGrades.reduce((s, g) => s + (g.value * g.coefficient), 0);
          if (totalC > 0) {
            classmateAverages.push({ studentId: cm.studentId, average: totalP / totalC });
          }
        }
      }

      totalStudents = classmateAverages.length;
      classmateAverages.sort((a, b) => b.average - a.average);
      const idx = classmateAverages.findIndex((c) => c.studentId === studentId);
      rank = idx >= 0 ? idx + 1 : null;
    }

    res.json({
      studentId, studentName: student.name,
      classId, className: enroll?.className ?? "",
      semesterId: semester.id, semesterName: semester.name,
      average, rank, totalStudents, decision, grades,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Absence Justifications (student) ────────────────────────────────────────

// Upload justification PDF
router.post("/justifications/upload", requireRole("student"), (req, res) => {
  pdfUpload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message ?? "Erreur upload fichier." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier reçu." });
    }
    const fileUrl = `/api/uploads/${req.file.filename}`;
    return res.json({ fileUrl });
  });
});

router.post("/justifications", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { attendanceId, reason, fileUrl } = req.body;
    if (!attendanceId || !reason?.trim()) {
      res.status(400).json({ error: "Bad Request", message: "attendanceId et raison sont obligatoires." });
      return;
    }
    // Verify the attendance record belongs to this student and is an absence/late
    const [record] = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.id, attendanceId), eq(attendanceTable.studentId, studentId)))
      .limit(1);
    if (!record) { res.status(404).json({ error: "Absence introuvable." }); return; }
    if (record.status === "present") {
      res.status(400).json({ error: "Impossible de justifier une présence." }); return;
    }
    // Upsert: if a justification already exists, update; else insert
    const [existing] = await db.select().from(absenceJustificationsTable)
      .where(eq(absenceJustificationsTable.attendanceId, attendanceId)).limit(1);
    if (existing) {
      if (existing.status !== "pending") {
        res.status(409).json({ error: "Cette absence a déjà été traitée.", status: existing.status }); return;
      }
      const [updated] = await db.update(absenceJustificationsTable)
        .set({ reason: reason.trim(), fileUrl: fileUrl ?? existing.fileUrl, updatedAt: new Date() })
        .where(eq(absenceJustificationsTable.id, existing.id))
        .returning();
      res.json(updated); return;
    }
    const [created] = await db.insert(absenceJustificationsTable)
      .values({ attendanceId, studentId, reason: reason.trim(), fileUrl: fileUrl ?? null })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/justifications", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const justifications = await db.select()
      .from(absenceJustificationsTable)
      .where(eq(absenceJustificationsTable.studentId, studentId));
    res.json(justifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /student/balance — solde de scolarité de l'étudiant connecté ─────────
// ─── Cahier de texte étudiant (T002) ─────────────────────────────────────────

router.get("/cahier-de-texte", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;

    const enrollment = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .orderBy(sql`enrolled_at DESC`)
      .limit(1);

    if (!enrollment.length) {
      res.json([]);
      return;
    }

    const classId = enrollment[0].classId;

    const entries = await db.execute(sql`
      SELECT
        c.id,
        c.session_date AS "sessionDate",
        c.title,
        c.contenu,
        c.devoirs,
        c.heures_effectuees AS "heuresEffectuees",
        s.name AS "subjectName",
        sem.name AS "semesterName",
        u.name AS "teacherName"
      FROM cahier_de_texte c
      INNER JOIN subjects s ON s.id = c.subject_id
      INNER JOIN semesters sem ON sem.id = c.semester_id
      INNER JOIN users u ON u.id = c.teacher_id
      WHERE c.class_id = ${classId}
      ORDER BY c.session_date DESC, s.name ASC
    `);

    res.json(entries.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/balance", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;

    const [fee] = await db
      .select()
      .from(studentFeesTable)
      .where(eq(studentFeesTable.studentId, studentId))
      .limit(1);

    const [paidRow] = await db
      .select({ totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
      .from(paymentsTable)
      .where(eq(paymentsTable.studentId, studentId));

    const totalDue = fee ? Number(fee.totalAmount) : 0;
    const totalPaid = Number(paidRow?.totalPaid ?? 0);
    const remaining = Math.max(0, totalDue - totalPaid);

    const payments = await db
      .select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        description: paymentsTable.description,
        paymentDate: paymentsTable.paymentDate,
        recordedByName: usersTable.name,
      })
      .from(paymentsTable)
      .leftJoin(usersTable, eq(usersTable.id, paymentsTable.recordedById))
      .where(eq(paymentsTable.studentId, studentId))
      .orderBy(paymentsTable.paymentDate);

    res.json({
      totalDue,
      totalPaid,
      remaining,
      academicYear: fee?.academicYear ?? null,
      status: totalDue === 0 ? "non_configure" : totalPaid >= totalDue ? "solde" : totalPaid > 0 ? "partiel" : "impaye",
      payments,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student Schedule (secured, server-side class resolution) ─────────────────
router.get("/schedule", requireRole("student"), async (req, res) => {
  try {
    const userId = (req as any).session?.user?.id;
    if (!userId) return res.status(401).json({ error: "Non authentifié" });

    // Resolve student's class from enrollment — never trust the client
    const [enrollment] = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, userId))
      .limit(1);

    if (!enrollment) {
      return res.json({ entries: [], publication: null, classId: null });
    }

    const { classId } = enrollment;

    // Find active publications for this class
    const now = new Date();
    const allPubs = await db
      .select()
      .from(schedulePublicationsTable)
      .where(eq(schedulePublicationsTable.classId, classId));

    const activePubs = allPubs.filter(
      (p) => new Date(p.publishedFrom) <= now && new Date(p.publishedUntil) >= now
    );

    if (activePubs.length === 0) {
      return res.json({ entries: [], publication: null, classId });
    }

    // Return all published entries for this class matching any active publication semester
    const activeSemesterIds = activePubs.map((p) => p.semesterId);

    const entries = await db
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
        teamsLink: scheduleEntriesTable.teamsLink,
        published: scheduleEntriesTable.published,
      })
      .from(scheduleEntriesTable)
      .innerJoin(usersTable, eq(usersTable.id, scheduleEntriesTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, scheduleEntriesTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, scheduleEntriesTable.classId))
      .innerJoin(roomsTable, eq(roomsTable.id, scheduleEntriesTable.roomId))
      .innerJoin(semestersTable, eq(semestersTable.id, scheduleEntriesTable.semesterId))
      .where(
        and(
          eq(scheduleEntriesTable.classId, classId),
          eq(scheduleEntriesTable.published, true)
        )
      );

    const visible = entries
      .filter((e) => activeSemesterIds.includes(e.semesterId))
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.startTime.localeCompare(b.startTime));

    // Return the most recent active publication for display
    const latestPub = activePubs.sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )[0];

    res.json({ entries: visible, publication: latestPub, classId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function computeUeCreditsStudent(studentId: number, semesterId: number, subjectsWithGrades: any[]): Promise<{ earned: number; total: number }> {
  const juryRow = await db
    .select({ decision: specialJuryDecisionsTable.decision })
    .from(specialJuryDecisionsTable)
    .where(and(eq(specialJuryDecisionsTable.studentId, studentId), eq(specialJuryDecisionsTable.semesterId, semesterId)))
    .limit(1);

  const ues = await db
    .select({ id: teachingUnitsTable.id, credits: teachingUnitsTable.credits })
    .from(teachingUnitsTable)
    .where(eq(teachingUnitsTable.semesterId, semesterId));

  if (ues.length === 0) {
    const total = subjectsWithGrades.reduce((t: number, s: any) => t + (s.credits ?? 0), 0);
    if (juryRow.length > 0 && juryRow[0].decision === "validated") {
      return { earned: total, total };
    }
    const earned = subjectsWithGrades.filter((s: any) => {
      const g = s.retakeGrade !== null && s.retakeGrade !== undefined ? Math.max(s.grade ?? 0, s.retakeGrade) : s.grade;
      return g !== null && g >= 10;
    }).reduce((t: number, s: any) => t + (s.credits ?? 0), 0);
    return { earned, total };
  }

  const total = ues.reduce((t, ue) => t + ue.credits, 0);

  if (juryRow.length > 0 && juryRow[0].decision === "validated") {
    return { earned: total, total };
  }

  const allSubjects = await db
    .select({ id: subjectsTable.id, ueId: subjectsTable.ueId, coefficient: subjectsTable.coefficient })
    .from(subjectsTable)
    .where(eq(subjectsTable.semesterId, semesterId));

  const gradeBySubject = new Map<number, number | null>();
  for (const s of subjectsWithGrades) {
    const g = s.retakeGrade !== null && s.retakeGrade !== undefined ? Math.max(s.grade ?? 0, s.retakeGrade) : s.grade;
    gradeBySubject.set(s.subjectId, g !== null ? Number(g) : null);
  }

  let earned = 0;
  for (const ue of ues) {
    const ueSubs = allSubjects.filter(s => s.ueId === ue.id);
    if (ueSubs.length === 0) continue;

    const allGraded = ueSubs.every(s => gradeBySubject.has(s.id) && gradeBySubject.get(s.id) !== null);
    if (!allGraded) continue;

    const totalCoeff = ueSubs.reduce((t, s) => t + (s.coefficient ?? 1), 0);
    const weightedSum = ueSubs.reduce((t, s) => t + (gradeBySubject.get(s.id) ?? 0) * (s.coefficient ?? 1), 0);
    const ueAvg = totalCoeff > 0 ? weightedSum / totalCoeff : 0;

    const hasEliminatoryGrade = ueSubs.some(s => {
      const g = gradeBySubject.get(s.id);
      return g !== null && g !== undefined && g <= 6;
    });

    if (ueAvg >= 10 && !hasEliminatoryGrade) {
      earned += ue.credits;
    }
  }

  return { earned, total };
}

// ─── GET /student/academic-tracking — Personal academic progression ───────────
router.get("/academic-tracking", requireRole("student"), async (req, res) => {
  try {
    const studentId = (req as any).user?.id;
    if (!studentId) { res.status(401).json({ error: "Non authentifié" }); return; }

    // Semester grades + subjects
    const semesterGrades = (await db.execute(sql`
      SELECT s.id AS semester_id, s.name AS semester_name, s.academic_year,
        sub.id AS subject_id, sub.name AS subject_name,
        COALESCE(sub.coefficient, 1)::numeric AS coefficient,
        COALESCE(sub.credits, 1)::numeric AS credits, g.value AS grade
      FROM grades g
      JOIN semesters s  ON s.id  = g.semester_id
      JOIN subjects sub ON sub.id = g.subject_id
      WHERE g.student_id = ${studentId}
      ORDER BY s.academic_year, s.name, sub.name
    `)).rows as any[];

    // Retake grades
    const retakeRows = (await db.execute(sql`
      SELECT rs.semester_id, sub.name AS subject_name, rg.value AS retake_grade
      FROM retake_grades rg
      JOIN retake_sessions rs ON rs.id = rg.session_id
      JOIN subjects sub ON sub.id = rg.subject_id
      WHERE rg.student_id = ${studentId}
    `)).rows as any[];

    // Class averages
    const studentClass = ((await db.execute(sql`
      SELECT class_id FROM class_enrollments WHERE student_id = ${studentId} ORDER BY id DESC LIMIT 1
    `)).rows as any[])[0];

    const classAvgRows = studentClass?.class_id ? (await db.execute(sql`
      WITH class_sem_avgs AS (
        SELECT g.student_id, g.semester_id,
          SUM(g.value * COALESCE(sub.coefficient, 1)) / NULLIF(SUM(COALESCE(sub.coefficient, 1)), 0) AS avg
        FROM grades g
        JOIN subjects sub ON sub.id = g.subject_id
        JOIN class_enrollments ce ON ce.student_id = g.student_id AND ce.class_id = ${studentClass.class_id}
        GROUP BY g.student_id, g.semester_id
      )
      SELECT semester_id, COUNT(DISTINCT student_id)::int AS total_students,
        ROUND(AVG(avg)::numeric, 2) AS class_avg
      FROM class_sem_avgs GROUP BY semester_id
    `)).rows as any[] : [];

    // Ranks
    const rankRows = studentClass?.class_id ? (await db.execute(sql`
      WITH class_sem_avgs AS (
        SELECT g.student_id, g.semester_id,
          SUM(g.value * COALESCE(sub.coefficient, 1)) / NULLIF(SUM(COALESCE(sub.coefficient, 1)), 0) AS avg
        FROM grades g
        JOIN subjects sub ON sub.id = g.subject_id
        JOIN class_enrollments ce ON ce.student_id = g.student_id AND ce.class_id = ${studentClass.class_id}
        GROUP BY g.student_id, g.semester_id
      ),
      ranked AS (
        SELECT student_id, semester_id, RANK() OVER (PARTITION BY semester_id ORDER BY avg DESC) AS rank
        FROM class_sem_avgs
      )
      SELECT semester_id, rank::int FROM ranked WHERE student_id = ${studentId}
    `)).rows as any[] : [];

    // Absence by subject
    const absenceRows = (await db.execute(sql`
      SELECT a.semester_id, sub.name AS subject_name,
        COUNT(*)::int AS total,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absent,
        SUM(CASE WHEN a.status = 'absent' AND a.justified THEN 1 ELSE 0 END)::int AS justified
      FROM attendance a
      JOIN subjects sub ON sub.id = a.subject_id
      WHERE a.student_id = ${studentId}
      GROUP BY a.semester_id, sub.id, sub.name ORDER BY a.semester_id, sub.name
    `)).rows as any[];

    // Build response
    const semMap = new Map<number, any>();
    for (const r of semesterGrades) {
      const sid = Number(r.semester_id);
      if (!semMap.has(sid)) semMap.set(sid, { semesterId: sid, semesterName: r.semester_name, academicYear: r.academic_year, subjects: [] });
      semMap.get(sid).subjects.push({ subjectId: Number(r.subject_id), subjectName: r.subject_name, coefficient: Number(r.coefficient), credits: Number(r.credits), grade: r.grade !== null ? Number(r.grade) : null });
    }

    const classAvgMap = new Map(classAvgRows.map((r: any) => [Number(r.semester_id), { classAvg: Number(r.class_avg), totalStudents: Number(r.total_students) }]));
    const rankMap = new Map(rankRows.map((r: any) => [Number(r.semester_id), Number(r.rank)]));
    const retakeMap = new Map<string, number>();
    for (const r of retakeRows) retakeMap.set(`${r.semester_id}_${r.subject_name}`, Number(r.retake_grade));

    const absencesBySem = new Map<number, any[]>();
    for (const r of absenceRows) {
      const sid = Number(r.semester_id);
      if (!absencesBySem.has(sid)) absencesBySem.set(sid, []);
      absencesBySem.get(sid)!.push({ subjectName: r.subject_name, total: Number(r.total), absent: Number(r.absent), justified: Number(r.justified), absenceRate: Number(r.total) > 0 ? Math.round((Number(r.absent) / Number(r.total)) * 1000) / 10 : 0 });
    }

    const semestersRaw = await Promise.all(Array.from(semMap.values()).map(async (sem) => {
      const subjects = sem.subjects;
      const totalCoef = subjects.reduce((s: number, g: any) => s + (g.grade !== null ? g.coefficient : 0), 0);
      const weightedSum = subjects.reduce((s: number, g: any) => s + (g.grade !== null ? g.grade * g.coefficient : 0), 0);
      const average = totalCoef > 0 ? Math.round((weightedSum / totalCoef) * 100) / 100 : null;
      const { classAvg, totalStudents } = classAvgMap.get(sem.semesterId) ?? { classAvg: null, totalStudents: 0 };
      const subjectsWithRetake = subjects.map((s: any) => ({ ...s, retakeGrade: retakeMap.get(`${sem.semesterId}_${s.subjectName}`) ?? null }));
      const ueCredits = await computeUeCreditsStudent(studentId, sem.semesterId, subjectsWithRetake);
      return {
        ...sem,
        average, classAverage: classAvg, totalStudents, rank: rankMap.get(sem.semesterId) ?? null,
        creditsEarned: ueCredits.earned, creditsTotal: ueCredits.total,
        absences: absencesBySem.get(sem.semesterId) ?? [],
        subjects: subjectsWithRetake,
      };
    }));
    const semesters = semestersRaw.sort((a, b) => a.academicYear < b.academicYear ? -1 : a.academicYear > b.academicYear ? 1 : a.semesterName < b.semesterName ? -1 : 1);

    const totalCreditsEarned = semesters.reduce((t, s) => t + (s.creditsEarned ?? 0), 0);
    const totalCreditsAttempted = semesters.reduce((t, s) => t + (s.creditsTotal ?? 0), 0);
    const latestSem = semesters[semesters.length - 1];
    const prevSem   = semesters.length >= 2 ? semesters[semesters.length - 2] : null;
    let trend: "up"|"down"|"stable" = "stable";
    if (latestSem?.average !== null && prevSem?.average !== null) {
      const diff = (latestSem?.average ?? 0) - (prevSem?.average ?? 0);
      if (diff >= 1) trend = "up"; else if (diff <= -1) trend = "down";
    }

    const alerts: any[] = [];
    if (latestSem?.average !== null && latestSem.average < 8)
      alerts.push({ type: "avg_critical", severity: "critical", message: `Moyenne actuelle ${latestSem.average.toFixed(2)}/20 — En dessous du seuil critique de 8/20.` });
    else if (latestSem?.average !== null && latestSem.average < 10)
      alerts.push({ type: "avg_low", severity: "high", message: `Moyenne actuelle ${latestSem.average.toFixed(2)}/20 — Validation du semestre en danger.` });
    for (const sub of (latestSem?.subjects ?? []))
      if (sub.grade !== null && sub.grade <= 6)
        alerts.push({ type: "eliminatoire", severity: "high", message: `Note éliminatoire en ${sub.subjectName} : ${sub.grade.toFixed(2)}/20` });
    const latestAbs = absencesBySem.get(latestSem?.semesterId ?? -1) ?? [];
    for (const abs of latestAbs)
      if (abs.absenceRate > 20)
        alerts.push({ type: "absence", severity: "moderate", message: `Taux d'absence de ${abs.absenceRate}% en ${abs.subjectName} — Seuil critique dépassé.` });
    if (trend === "down" && prevSem?.average !== null && latestSem?.average !== null)
      alerts.push({ type: "trend_down", severity: "moderate", message: `Baisse de moyenne : ${prevSem.average.toFixed(2)} → ${latestSem.average?.toFixed(2)}/20` });

    const totalSessions = absenceRows.reduce((t, r: any) => t + Number(r.total), 0);
    const totalAbsent   = absenceRows.reduce((t, r: any) => t + Number(r.absent), 0);
    const attendanceRate = totalSessions > 0 ? Math.round((1 - totalAbsent / totalSessions) * 1000) / 10 : null;

    res.json({
      semesters,
      indicators: { creditsEarned: totalCreditsEarned, creditsAttempted: totalCreditsAttempted, passRate: totalCreditsAttempted > 0 ? Math.round((totalCreditsEarned / totalCreditsAttempted) * 1000) / 10 : null, attendanceRate, currentRank: latestSem?.rank ?? null, totalStudents: latestSem?.totalStudents ?? null, currentAverage: latestSem?.average ?? null, trend },
      alerts,
    });
  } catch (err) {
    console.error("GET /student/academic-tracking error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
