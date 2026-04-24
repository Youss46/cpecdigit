import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import {
  reclamationPeriodsTable,
  reclamationsTable,
  reclamationHistoryTable,
  usersTable,
  subjectsTable,
  semestersTable,
  classEnrollmentsTable,
  gradesTable,
  teacherAssignmentsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, desc, sql, or, inArray, count, avg, lte, gte } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser, sendPushToUsers } from "./push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const unique = `recl-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Seuls les fichiers PDF, JPG et PNG sont acceptés."));
  },
});

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getActorName(userId: number): Promise<string> {
  const [u] = await db.select({ name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return u?.name ?? "Inconnu";
}

async function appendHistory(
  reclamationId: number,
  actorId: number,
  actorName: string,
  action: string,
  detail?: string,
  oldGrade?: number,
  newGrade?: number,
) {
  await db.insert(reclamationHistoryTable).values({
    reclamationId, actorId, actorName, action, detail: detail ?? null,
    oldGrade: oldGrade ?? null, newGrade: newGrade ?? null,
  });
}

async function notifyAndPush(userId: number, message: string, type: string, title: string, url?: string, tag?: string) {
  await db.insert(notificationsTable).values({
    userId,
    message,
    type,
    isRead: false,
  });
  await sendPushToUser(userId, { title, body: message, type, url, tag });
}

async function generateClaimNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  const [{ maxNum }] = await db.select({
    maxNum: sql<string>`COALESCE(MAX(CAST(SUBSTRING(${reclamationsTable.claimNumber} FROM '\\d+$') AS INTEGER)), 0)`,
  }).from(reclamationsTable)
    .where(sql`${reclamationsTable.claimNumber} LIKE ${prefix + '%'}`);
  const seq = String((Number(maxNum) || 0) + 1).padStart(4, "0");
  return `${prefix}${seq}`;
}

function getActivePeriodCondition(now: Date) {
  return and(
    eq(reclamationPeriodsTable.isActive, true),
    sql`${reclamationPeriodsTable.openDate} <= ${now}`,
    sql`${reclamationPeriodsTable.closeDate} >= ${now}`,
  );
}

// ─── STUDENT ENDPOINTS ────────────────────────────────────────────────────────

// GET /api/student/reclamations/period — active period for student's current semester
router.get("/student/reclamations/period", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const [enroll] = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    const now = new Date();
    const periods = await db
      .select({
        id: reclamationPeriodsTable.id,
        semesterId: reclamationPeriodsTable.semesterId,
        semesterName: semestersTable.name,
        openDate: reclamationPeriodsTable.openDate,
        closeDate: reclamationPeriodsTable.closeDate,
        teacherResponseDays: reclamationPeriodsTable.teacherResponseDays,
      })
      .from(reclamationPeriodsTable)
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationPeriodsTable.semesterId))
      .where(getActivePeriodCondition(now))
      .orderBy(desc(reclamationPeriodsTable.createdAt))
      .limit(1);

    if (periods.length === 0) {
      res.json({ period: null });
      return;
    }
    res.json({ period: periods[0] });
  } catch (err) {
    console.error("GET /student/reclamations/period error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/student/reclamations — list student's own reclamations
router.get("/student/reclamations", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const rows = await db
      .select({
        id: reclamationsTable.id,
        claimNumber: reclamationsTable.claimNumber,
        subjectId: reclamationsTable.subjectId,
        subjectName: subjectsTable.name,
        semesterId: reclamationsTable.semesterId,
        semesterName: semestersTable.name,
        contestedGrade: reclamationsTable.contestedGrade,
        type: reclamationsTable.type,
        status: reclamationsTable.status,
        finalGrade: reclamationsTable.finalGrade,
        createdAt: reclamationsTable.createdAt,
        updatedAt: reclamationsTable.updatedAt,
      })
      .from(reclamationsTable)
      .leftJoin(subjectsTable, eq(subjectsTable.id, reclamationsTable.subjectId))
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationsTable.semesterId))
      .where(eq(reclamationsTable.studentId, studentId))
      .orderBy(desc(reclamationsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("GET /student/reclamations error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/student/reclamations/:id — detail with history
router.get("/student/reclamations/:id", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const id = Number(req.params.id);
    const [rec] = await db
      .select({
        id: reclamationsTable.id,
        claimNumber: reclamationsTable.claimNumber,
        subjectId: reclamationsTable.subjectId,
        subjectName: subjectsTable.name,
        semesterName: semestersTable.name,
        contestedGrade: reclamationsTable.contestedGrade,
        contestedEvaluations: reclamationsTable.contestedEvaluations,
        proposedEvaluations: reclamationsTable.proposedEvaluations,
        type: reclamationsTable.type,
        motif: reclamationsTable.motif,
        attachmentPath: reclamationsTable.attachmentPath,
        status: reclamationsTable.status,
        teacherComment: reclamationsTable.teacherComment,
        proposedGrade: reclamationsTable.proposedGrade,
        adminComment: reclamationsTable.adminComment,
        finalGrade: reclamationsTable.finalGrade,
        createdAt: reclamationsTable.createdAt,
        updatedAt: reclamationsTable.updatedAt,
      })
      .from(reclamationsTable)
      .leftJoin(subjectsTable, eq(subjectsTable.id, reclamationsTable.subjectId))
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationsTable.semesterId))
      .where(and(eq(reclamationsTable.id, id), eq(reclamationsTable.studentId, studentId)))
      .limit(1);
    if (!rec) { res.status(404).json({ error: "Not found" }); return; }
    const history = await db
      .select()
      .from(reclamationHistoryTable)
      .where(eq(reclamationHistoryTable.reclamationId, id))
      .orderBy(reclamationHistoryTable.createdAt);
    res.json({ ...rec, history });
  } catch (err) {
    console.error("GET /student/reclamations/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/student/reclamations — submit new reclamation
router.post(
  "/student/reclamations",
  requireRole("student"),
  attachmentUpload.single("attachment"),
  async (req, res) => {
    try {
      const studentId = req.session!.userId!;
      const { subjectId, semesterId, type, motif, evaluationsContestees } = req.body;
      if (!subjectId || !semesterId || !type || !motif) {
        res.status(400).json({ error: "Champs obligatoires manquants" });
        return;
      }
      if (motif.length < 50) {
        res.status(400).json({ error: "Le motif doit contenir au moins 50 caractères" });
        return;
      }

      // Parse evaluations contested (JSON array from FormData)
      let contestedEvals: Array<{ evaluationNumber: number; currentGrade: number }> = [];
      if (evaluationsContestees) {
        try {
          contestedEvals = typeof evaluationsContestees === "string"
            ? JSON.parse(evaluationsContestees)
            : evaluationsContestees;
        } catch {
          res.status(400).json({ error: "Format des évaluations invalide" });
          return;
        }
      }
      if (contestedEvals.length === 0) {
        res.status(400).json({ error: "Sélectionnez au moins une évaluation à contester" });
        return;
      }

      // Check active period
      const now = new Date();
      const [period] = await db
        .select()
        .from(reclamationPeriodsTable)
        .where(and(
          getActivePeriodCondition(now),
          eq(reclamationPeriodsTable.semesterId, Number(semesterId)),
        ))
        .limit(1);
      if (!period) {
        res.status(403).json({ error: "Aucune période de réclamation active pour ce semestre" });
        return;
      }

      // Check duplicate
      const [existing] = await db
        .select({
          id: reclamationsTable.id,
          claimNumber: reclamationsTable.claimNumber,
          status: reclamationsTable.status,
        })
        .from(reclamationsTable)
        .where(and(
          eq(reclamationsTable.studentId, studentId),
          eq(reclamationsTable.subjectId, Number(subjectId)),
          eq(reclamationsTable.semesterId, Number(semesterId)),
        ))
        .limit(1);
      if (existing) {
        res.status(409).json({
          error: "Votre réclamation pour cette matière est déjà enregistrée.",
          alreadyExists: true,
          existingId: existing.id,
          claimNumber: existing.claimNumber,
          status: existing.status,
        });
        return;
      }

      // Verify each contested evaluation exists for this student/subject/semester
      const allGrades = await db
        .select({ evaluationNumber: gradesTable.evaluationNumber, value: gradesTable.value })
        .from(gradesTable)
        .where(and(
          eq(gradesTable.studentId, studentId),
          eq(gradesTable.subjectId, Number(subjectId)),
          eq(gradesTable.semesterId, Number(semesterId)),
        ));
      if (allGrades.length === 0) {
        res.status(404).json({ error: "Aucune note trouvée pour cette matière" });
        return;
      }
      const gradeByEval = new Map(allGrades.map(g => [g.evaluationNumber, g.value]));
      for (const ev of contestedEvals) {
        if (!gradeByEval.has(ev.evaluationNumber)) {
          res.status(400).json({ error: `L'évaluation ${ev.evaluationNumber} n'existe pas pour cette matière` });
          return;
        }
      }

      // contestedGrade = average of all evals in this subject (overall average)
      const overallAvg = Math.round(
        (allGrades.reduce((sum, g) => sum + g.value, 0) / allGrades.length) * 100
      ) / 100;

      // Resolve teacher for this subject/semester
      const [assignRow] = await db
        .select({ teacherId: teacherAssignmentsTable.teacherId })
        .from(teacherAssignmentsTable)
        .where(and(
          eq(teacherAssignmentsTable.subjectId, Number(subjectId)),
          eq(teacherAssignmentsTable.semesterId, Number(semesterId)),
        ))
        .limit(1);

      const claimNumber = await generateClaimNumber();
      const attachmentPath = req.file ? req.file.filename : null;

      const [inserted] = await db.insert(reclamationsTable).values({
        claimNumber,
        periodId: period.id,
        studentId,
        subjectId: Number(subjectId),
        semesterId: Number(semesterId),
        teacherId: assignRow?.teacherId ?? null,
        contestedGrade: overallAvg,
        contestedEvaluations: contestedEvals,
        type: type as any,
        motif,
        attachmentPath,
        status: "soumise",
      }).returning();

      // History
      const actorName = await getActorName(studentId);
      const evalDesc = contestedEvals.map(e => `Éval ${e.evaluationNumber} (${e.currentGrade}/20)`).join(", ");
      await appendHistory(inserted.id, studentId, actorName, "submitted",
        `Réclamation soumise — ${evalDesc}`);

      // Respond immediately — insertion succeeded
      res.status(201).json({ claimNumber, id: inserted.id });

      // Notifications in background (never block the response)
      (async () => {
        try {
          const [subj] = await db.select({ name: subjectsTable.name }).from(subjectsTable)
            .where(eq(subjectsTable.id, Number(subjectId))).limit(1);
          const subjName = subj?.name ?? "Matière inconnue";
          const recUrl = `/reclamations`;
          const evalDesc = contestedEvals.map(e => `Éval ${e.evaluationNumber}`).join(", ");

          // Confirm to student
          await notifyAndPush(
            studentId,
            `Votre réclamation sur ${evalDesc} en ${subjName} a été soumise avec succès. Numéro : #${claimNumber}`,
            "reclamation",
            "Réclamation soumise",
            `${recUrl}?id=${inserted.id}`,
            `rec-${inserted.id}-submitted`,
          );

          // Notify assigned teacher
          if (assignRow?.teacherId) {
            // Find response deadline from active period
            let deadlineInfo = "";
            try {
              const [period] = await db.select({
                closeDate: reclamationPeriodsTable.closeDate,
                teacherResponseDays: reclamationPeriodsTable.teacherResponseDays,
              }).from(reclamationPeriodsTable)
                .where(and(
                  lte(reclamationPeriodsTable.openDate, new Date()),
                  gte(reclamationPeriodsTable.closeDate, new Date()),
                )).limit(1);
              if (period?.teacherResponseDays) {
                const deadline = new Date();
                deadline.setDate(deadline.getDate() + period.teacherResponseDays);
                deadlineInfo = `. À traiter avant le ${deadline.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
              }
            } catch (_) {}

            await notifyAndPush(
              assignRow.teacherId,
              `Nouvelle réclamation de ${actorName} sur ${evalDesc} — ${subjName}${deadlineInfo}`,
              "reclamation",
              "Réclamation reçue",
              `/teacher/reclamations?id=${inserted.id}`,
              `rec-${inserted.id}-teacher-new`,
            );
          }

          // Notify admins
          const admins = await db.select({ id: usersTable.id }).from(usersTable)
            .where(eq(usersTable.role, "admin"));
          for (const admin of admins) {
            await notifyAndPush(
              admin.id,
              `Réclamation soumise par ${actorName} sur ${evalDesc} en ${subjName}`,
              "reclamation",
              "Réclamation soumise",
              `/admin/reclamations?id=${inserted.id}`,
              `rec-${inserted.id}-admin-submitted`,
            );
          }
        } catch (notifErr) {
          console.error("POST /student/reclamations notification error (non-blocking):", notifErr);
        }
      })();
    } catch (err: any) {
      if (err?.code === "23505") {
        const [existingRow] = await db
          .select({ id: reclamationsTable.id, claimNumber: reclamationsTable.claimNumber, status: reclamationsTable.status })
          .from(reclamationsTable)
          .where(and(
            eq(reclamationsTable.studentId, req.session!.userId!),
            eq(reclamationsTable.subjectId, Number(req.body.subjectId)),
            eq(reclamationsTable.semesterId, Number(req.body.semesterId)),
          ))
          .limit(1);
        if (existingRow) {
          res.status(409).json({
            error: "Votre réclamation pour cette matière est déjà enregistrée.",
            alreadyExists: true,
            existingId: existingRow.id,
            claimNumber: existingRow.claimNumber,
            status: existingRow.status,
          });
          return;
        }
      }
      console.error("POST /student/reclamations error:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
);

// GET /api/student/reclamations/attachment/:id — serve attachment for student
router.get("/student/reclamations/attachment/:id", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const id = Number(req.params.id);
    const [rec] = await db.select({ attachmentPath: reclamationsTable.attachmentPath })
      .from(reclamationsTable)
      .where(and(eq(reclamationsTable.id, id), eq(reclamationsTable.studentId, studentId)))
      .limit(1);
    if (!rec?.attachmentPath) { res.status(404).json({ error: "Not found" }); return; }
    const filePath = path.join(UPLOADS_DIR, rec.attachmentPath);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── TEACHER ENDPOINTS ────────────────────────────────────────────────────────

// GET /api/teacher/reclamations — reclamations addressed to this teacher
router.get("/teacher/reclamations", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const rows = await db
      .select({
        id: reclamationsTable.id,
        claimNumber: reclamationsTable.claimNumber,
        studentName: usersTable.name,
        subjectName: subjectsTable.name,
        semesterName: semestersTable.name,
        contestedGrade: reclamationsTable.contestedGrade,
        type: reclamationsTable.type,
        status: reclamationsTable.status,
        createdAt: reclamationsTable.createdAt,
        updatedAt: reclamationsTable.updatedAt,
      })
      .from(reclamationsTable)
      .leftJoin(usersTable, eq(usersTable.id, reclamationsTable.studentId))
      .leftJoin(subjectsTable, eq(subjectsTable.id, reclamationsTable.subjectId))
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationsTable.semesterId))
      .where(eq(reclamationsTable.teacherId, teacherId))
      .orderBy(desc(reclamationsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("GET /teacher/reclamations error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/teacher/reclamations/:id — full detail
router.get("/teacher/reclamations/:id", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const id = Number(req.params.id);
    const [rec] = await db
      .select({
        id: reclamationsTable.id,
        claimNumber: reclamationsTable.claimNumber,
        studentName: usersTable.name,
        
        subjectName: subjectsTable.name,
        semesterName: semestersTable.name,
        contestedGrade: reclamationsTable.contestedGrade,
        contestedEvaluations: reclamationsTable.contestedEvaluations,
        proposedEvaluations: reclamationsTable.proposedEvaluations,
        type: reclamationsTable.type,
        motif: reclamationsTable.motif,
        attachmentPath: reclamationsTable.attachmentPath,
        status: reclamationsTable.status,
        teacherComment: reclamationsTable.teacherComment,
        proposedGrade: reclamationsTable.proposedGrade,
        adminComment: reclamationsTable.adminComment,
        finalGrade: reclamationsTable.finalGrade,
        studentId: reclamationsTable.studentId,
        subjectId: reclamationsTable.subjectId,
        semesterId: reclamationsTable.semesterId,
        createdAt: reclamationsTable.createdAt,
      })
      .from(reclamationsTable)
      .leftJoin(usersTable, eq(usersTable.id, reclamationsTable.studentId))
      .leftJoin(subjectsTable, eq(subjectsTable.id, reclamationsTable.subjectId))
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationsTable.semesterId))
      .where(and(eq(reclamationsTable.id, id), eq(reclamationsTable.teacherId, teacherId)))
      .limit(1);
    if (!rec) { res.status(404).json({ error: "Not found" }); return; }
    const history = await db
      .select()
      .from(reclamationHistoryTable)
      .where(eq(reclamationHistoryTable.reclamationId, id))
      .orderBy(reclamationHistoryTable.createdAt);
    res.json({ ...rec, history });
  } catch (err) {
    console.error("GET /teacher/reclamations/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/teacher/reclamations/attachment/:id — serve attachment for teacher
router.get("/teacher/reclamations/attachment/:id", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const id = Number(req.params.id);
    const [rec] = await db.select({ attachmentPath: reclamationsTable.attachmentPath })
      .from(reclamationsTable)
      .where(and(eq(reclamationsTable.id, id), eq(reclamationsTable.teacherId, teacherId)))
      .limit(1);
    if (!rec?.attachmentPath) { res.status(404).json({ error: "Not found" }); return; }
    const filePath = path.join(UPLOADS_DIR, rec.attachmentPath);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/teacher/reclamations/:id — teacher responds
router.put("/teacher/reclamations/:id", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const id = Number(req.params.id);
    const { decision, teacherComment, proposedGrade, proposedEvaluations } = req.body;

    if (!["accept", "reject", "transmit"].includes(decision)) {
      res.status(400).json({ error: "Decision invalide" });
      return;
    }
    if (!teacherComment || teacherComment.trim().length < 10) {
      res.status(400).json({ error: "Un commentaire de l'enseignant est obligatoire (min 10 caractères)" });
      return;
    }

    // Parse proposed evaluations if provided
    let proposedEvals: Array<{ evaluationNumber: number; proposedGrade: number }> | null = null;
    if (decision === "accept" && proposedEvaluations) {
      try {
        proposedEvals = typeof proposedEvaluations === "string"
          ? JSON.parse(proposedEvaluations)
          : proposedEvaluations;
      } catch {
        res.status(400).json({ error: "Format des évaluations proposées invalide" });
        return;
      }
    }
    if (decision === "accept" && !proposedEvals?.length && (proposedGrade === undefined || proposedGrade === null)) {
      res.status(400).json({ error: "La note proposée est obligatoire en cas d'acceptation" });
      return;
    }

    const [rec] = await db.select().from(reclamationsTable)
      .where(and(eq(reclamationsTable.id, id), eq(reclamationsTable.teacherId, teacherId)))
      .limit(1);
    if (!rec) { res.status(404).json({ error: "Not found" }); return; }
    if (!["soumise", "en_cours"].includes(rec.status)) {
      res.status(409).json({ error: "Cette réclamation ne peut plus être traitée" });
      return;
    }

    const newStatus = decision === "accept" ? "en_arbitrage"
      : decision === "reject" ? "rejetee"
      : "en_arbitrage";

    // Compute overall proposed grade: average of proposed evals if provided, else use proposedGrade scalar
    let computedProposedGrade: number | null = null;
    if (decision === "accept") {
      if (proposedEvals && proposedEvals.length > 0) {
        computedProposedGrade = Math.round(
          (proposedEvals.reduce((sum, e) => sum + e.proposedGrade, 0) / proposedEvals.length) * 100
        ) / 100;
      } else if (proposedGrade !== undefined && proposedGrade !== null) {
        computedProposedGrade = Number(proposedGrade);
      }
    }

    await db.update(reclamationsTable).set({
      status: newStatus as any,
      teacherComment: teacherComment.trim(),
      proposedGrade: computedProposedGrade,
      proposedEvaluations: proposedEvals ?? undefined,
      updatedAt: new Date(),
    }).where(eq(reclamationsTable.id, id));

    const actorName = await getActorName(teacherId);
    const actionLabel = decision === "accept" ? "teacher_accepted"
      : decision === "reject" ? "teacher_rejected"
      : "teacher_transmitted";

    const evalDetail = proposedEvals
      ? `Modifications proposées : ${proposedEvals.map(e => `Éval ${e.evaluationNumber} → ${e.proposedGrade}/20`).join(", ")}`
      : teacherComment.trim();

    await appendHistory(id, teacherId, actorName, actionLabel, evalDetail,
      undefined, computedProposedGrade ?? undefined);

    // Respond immediately
    res.json({ ok: true });

    // Notifications in background
    (async () => {
      try {
        const [subj] = await db.select({ name: subjectsTable.name }).from(subjectsTable)
          .where(eq(subjectsTable.id, rec.subjectId)).limit(1);
        const subjName = subj?.name ?? "Matière";
        const teacherName = await getActorName(teacherId);
        const recUrl = `/reclamations`;

        let studentMsg: string;
        let studentTitle: string;
        if (decision === "accept") {
          const evalChanges = proposedEvals
            ? proposedEvals.map(e => `Éval ${e.evaluationNumber} → ${e.proposedGrade}/20`).join(", ")
            : "";
          studentMsg = `Bonne nouvelle ! Votre réclamation #${rec.claimNumber} a été acceptée par ${teacherName}. ${evalChanges ? `Nouvelles notes proposées : ${evalChanges}.` : ""} En attente de validation administrative.`;
          studentTitle = "Réclamation acceptée";
        } else if (decision === "reject") {
          studentMsg = `Votre réclamation #${rec.claimNumber} a été rejetée par ${teacherName}. Motif : ${teacherComment.trim().substring(0, 100)}`;
          studentTitle = "Réclamation rejetée";
        } else {
          studentMsg = `Votre réclamation #${rec.claimNumber} a été transmise à l'administration pour arbitrage`;
          studentTitle = "Réclamation transmise";
        }
        const teacherAction = decision === "accept" ? "teacher-accepted" : decision === "reject" ? "teacher-rejected" : "teacher-transmitted";
        await notifyAndPush(rec.studentId, studentMsg, "reclamation", studentTitle, `${recUrl}?id=${id}`, `rec-${id}-${teacherAction}`);

        if (decision !== "reject") {
          const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
          for (const admin of admins) {
            const adminMsg = decision === "accept"
              ? `${teacherName} a accepté la réclamation #${rec.claimNumber} (${subjName}) — validation requise`
              : `${teacherName} a transmis la réclamation #${rec.claimNumber} (${subjName}) pour arbitrage`;
            const adminTag = decision === "accept" ? `rec-${id}-admin-teacher-accepted` : `rec-${id}-admin-transmitted`;
            await notifyAndPush(
              admin.id,
              adminMsg,
              "reclamation",
              "Réclamation — arbitrage requis",
              `/admin/reclamations?id=${id}`,
              adminTag,
            );
          }
        }
      } catch (notifErr) {
        console.error("PUT /teacher/reclamations/:id notification error (non-blocking):", notifErr);
      }
    })();
  } catch (err) {
    console.error("PUT /teacher/reclamations/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── ADMIN ENDPOINTS ──────────────────────────────────────────────────────────

// GET /api/admin/reclamations/periods
router.get("/admin/reclamations/periods", requireRole("admin"), async (req, res) => {
  try {
    const rows = await db
      .select({
        id: reclamationPeriodsTable.id,
        semesterId: reclamationPeriodsTable.semesterId,
        semesterName: semestersTable.name,
        openDate: reclamationPeriodsTable.openDate,
        closeDate: reclamationPeriodsTable.closeDate,
        teacherResponseDays: reclamationPeriodsTable.teacherResponseDays,
        isActive: reclamationPeriodsTable.isActive,
        createdAt: reclamationPeriodsTable.createdAt,
      })
      .from(reclamationPeriodsTable)
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationPeriodsTable.semesterId))
      .orderBy(desc(reclamationPeriodsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("GET /admin/reclamations/periods error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/admin/reclamations/periods
router.post("/admin/reclamations/periods", requireRole("admin"), async (req, res) => {
  try {
    const adminId = req.session!.userId!;
    const { semesterId, openDate, closeDate, teacherResponseDays } = req.body;
    if (!semesterId || !openDate || !closeDate) {
      res.status(400).json({ error: "Champs obligatoires manquants" });
      return;
    }
    const [inserted] = await db.insert(reclamationPeriodsTable).values({
      semesterId: Number(semesterId),
      openDate: new Date(openDate),
      closeDate: new Date(closeDate),
      teacherResponseDays: teacherResponseDays ? Number(teacherResponseDays) : 5,
      isActive: true,
      createdBy: adminId,
    }).returning();
    res.status(201).json(inserted);
  } catch (err) {
    console.error("POST /admin/reclamations/periods error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/admin/reclamations/periods/:id
router.put("/admin/reclamations/periods/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { openDate, closeDate, teacherResponseDays, isActive } = req.body;
    await db.update(reclamationPeriodsTable).set({
      ...(openDate !== undefined && { openDate: new Date(openDate) }),
      ...(closeDate !== undefined && { closeDate: new Date(closeDate) }),
      ...(teacherResponseDays !== undefined && { teacherResponseDays: Number(teacherResponseDays) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    }).where(eq(reclamationPeriodsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /admin/reclamations/periods/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/admin/reclamations — list all, optional ?status=... &semesterId=...
router.get("/admin/reclamations", requireRole("admin"), async (req, res) => {
  try {
    const { status, semesterId } = req.query;
    const studentUser = usersTable;
    const teacherUser = { ...usersTable } as any;

    const conditions: any[] = [];
    if (status) conditions.push(eq(reclamationsTable.status, status as any));
    if (semesterId) conditions.push(eq(reclamationsTable.semesterId, Number(semesterId)));

    const rows = await db
      .select({
        id: reclamationsTable.id,
        claimNumber: reclamationsTable.claimNumber,
        studentId: reclamationsTable.studentId,
        studentName: usersTable.name,
        
        subjectName: subjectsTable.name,
        semesterName: semestersTable.name,
        contestedGrade: reclamationsTable.contestedGrade,
        type: reclamationsTable.type,
        status: reclamationsTable.status,
        teacherComment: reclamationsTable.teacherComment,
        proposedGrade: reclamationsTable.proposedGrade,
        finalGrade: reclamationsTable.finalGrade,
        createdAt: reclamationsTable.createdAt,
        updatedAt: reclamationsTable.updatedAt,
      })
      .from(reclamationsTable)
      .leftJoin(usersTable, eq(usersTable.id, reclamationsTable.studentId))
      .leftJoin(subjectsTable, eq(subjectsTable.id, reclamationsTable.subjectId))
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationsTable.semesterId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reclamationsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("GET /admin/reclamations error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/admin/reclamations/stats — dashboard stats
router.get("/admin/reclamations/stats", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId } = req.query;
    const cond = semesterId ? eq(reclamationsTable.semesterId, Number(semesterId)) : undefined;

    const all = await db.select({
      status: reclamationsTable.status,
      subjectName: subjectsTable.name,
      teacherName: usersTable.name,
      
      createdAt: reclamationsTable.createdAt,
      resolvedAt: reclamationsTable.resolvedAt,
    })
    .from(reclamationsTable)
    .leftJoin(subjectsTable, eq(subjectsTable.id, reclamationsTable.subjectId))
    .leftJoin(usersTable, eq(usersTable.id, reclamationsTable.teacherId))
    .where(cond);

    const total = all.length;
    const pending = all.filter(r => ["soumise","en_cours","en_arbitrage"].includes(r.status)).length;
    const accepted = all.filter(r => r.status === "acceptee").length;
    const rejected = all.filter(r => r.status === "rejetee").length;
    const acceptRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    const subjectCount: Record<string, number> = {};
    const teacherCount: Record<string, number> = {};
    for (const r of all) {
      if (r.subjectName) subjectCount[r.subjectName] = (subjectCount[r.subjectName] ?? 0) + 1;
      const tName = r.teacherName ?? null;
      if (tName) teacherCount[tName] = (teacherCount[tName] ?? 0) + 1;
    }
    const topSubjects = Object.entries(subjectCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topTeachers = Object.entries(teacherCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Average resolution time (days) for closed reclamations
    const resolved = all.filter(r => r.resolvedAt && r.createdAt);
    const avgDays = resolved.length > 0
      ? Math.round(resolved.reduce((acc, r) => {
          const diff = new Date(r.resolvedAt!).getTime() - new Date(r.createdAt).getTime();
          return acc + diff / (1000 * 60 * 60 * 24);
        }, 0) / resolved.length * 10) / 10
      : null;

    res.json({ total, pending, accepted, rejected, acceptRate, topSubjects, topTeachers, avgDays });
  } catch (err) {
    console.error("GET /admin/reclamations/stats error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/admin/reclamations/:id — full detail for admin
router.get("/admin/reclamations/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rec] = await db
      .select({
        id: reclamationsTable.id,
        claimNumber: reclamationsTable.claimNumber,
        studentId: reclamationsTable.studentId,
        studentName: usersTable.name,
        
        teacherId: reclamationsTable.teacherId,
        subjectId: reclamationsTable.subjectId,
        subjectName: subjectsTable.name,
        semesterId: reclamationsTable.semesterId,
        semesterName: semestersTable.name,
        contestedGrade: reclamationsTable.contestedGrade,
        contestedEvaluations: reclamationsTable.contestedEvaluations,
        proposedEvaluations: reclamationsTable.proposedEvaluations,
        type: reclamationsTable.type,
        motif: reclamationsTable.motif,
        attachmentPath: reclamationsTable.attachmentPath,
        status: reclamationsTable.status,
        teacherComment: reclamationsTable.teacherComment,
        proposedGrade: reclamationsTable.proposedGrade,
        adminComment: reclamationsTable.adminComment,
        finalGrade: reclamationsTable.finalGrade,
        createdAt: reclamationsTable.createdAt,
        updatedAt: reclamationsTable.updatedAt,
      })
      .from(reclamationsTable)
      .leftJoin(usersTable, eq(usersTable.id, reclamationsTable.studentId))
      .leftJoin(subjectsTable, eq(subjectsTable.id, reclamationsTable.subjectId))
      .leftJoin(semestersTable, eq(semestersTable.id, reclamationsTable.semesterId))
      .where(eq(reclamationsTable.id, id))
      .limit(1);
    if (!rec) { res.status(404).json({ error: "Not found" }); return; }
    const history = await db
      .select()
      .from(reclamationHistoryTable)
      .where(eq(reclamationHistoryTable.reclamationId, id))
      .orderBy(reclamationHistoryTable.createdAt);
    res.json({ ...rec, history });
  } catch (err) {
    console.error("GET /admin/reclamations/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/admin/reclamations/attachment/:id — admin attachment access
router.get("/admin/reclamations/attachment/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rec] = await db.select({ attachmentPath: reclamationsTable.attachmentPath })
      .from(reclamationsTable).where(eq(reclamationsTable.id, id)).limit(1);
    if (!rec?.attachmentPath) { res.status(404).json({ error: "Not found" }); return; }
    const filePath = path.join(UPLOADS_DIR, rec.attachmentPath);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/admin/reclamations/:id — admin arbitrate
router.put("/admin/reclamations/:id", requireRole("admin"), async (req, res) => {
  try {
    const adminId = req.session!.userId!;
    const id = Number(req.params.id);
    const { decision, adminComment, finalGrade } = req.body;

    if (!["validate_accept", "reject_accept", "override_reject", "close"].includes(decision)) {
      res.status(400).json({ error: "Decision invalide" });
      return;
    }
    if (!adminComment || adminComment.trim().length < 5) {
      res.status(400).json({ error: "Un commentaire de l'administration est obligatoire" });
      return;
    }

    const [rec] = await db.select().from(reclamationsTable).where(eq(reclamationsTable.id, id)).limit(1);
    if (!rec) { res.status(404).json({ error: "Not found" }); return; }

    let newStatus: string;
    let newFinalGrade: number | null = null;
    let actionLabel: string;
    let detail: string;

    if (decision === "validate_accept") {
      newStatus = "acceptee";
      newFinalGrade = rec.proposedGrade ?? (finalGrade ? Number(finalGrade) : rec.contestedGrade);
      actionLabel = "admin_validated_accept";
      detail = `Note modifiée : ${rec.contestedGrade}/20 → ${newFinalGrade}/20`;
    } else if (decision === "reject_accept") {
      newStatus = "rejetee";
      newFinalGrade = null;
      actionLabel = "admin_rejected_accept";
      detail = "L'administration a refusé la modification proposée par l'enseignant";
    } else if (decision === "override_reject") {
      newStatus = "acceptee";
      newFinalGrade = finalGrade ? Number(finalGrade) : null;
      if (!newFinalGrade) {
        res.status(400).json({ error: "La nouvelle note est requise" });
        return;
      }
      actionLabel = "admin_overrode_rejection";
      detail = `Note modifiée par l'administration : ${rec.contestedGrade}/20 → ${newFinalGrade}/20`;
    } else {
      newStatus = "cloturee";
      actionLabel = "admin_closed";
      detail = "Réclamation clôturée par l'administration";
    }

    await db.update(reclamationsTable).set({
      status: newStatus as any,
      adminComment: adminComment.trim(),
      finalGrade: newFinalGrade,
      resolvedBy: adminId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reclamationsTable.id, id));

    // Update actual grades in grades table if note modified
    if (newFinalGrade && (decision === "validate_accept" || decision === "override_reject")) {
      const proposedEvals = rec.proposedEvaluations as Array<{ evaluationNumber: number; proposedGrade: number }> | null;
      if (proposedEvals && proposedEvals.length > 0) {
        // Apply per-evaluation corrections
        for (const ev of proposedEvals) {
          await db.update(gradesTable).set({
            value: ev.proposedGrade,
            updatedAt: new Date(),
          }).where(and(
            eq(gradesTable.studentId, rec.studentId),
            eq(gradesTable.subjectId, rec.subjectId),
            eq(gradesTable.semesterId, rec.semesterId),
            eq(gradesTable.evaluationNumber, ev.evaluationNumber),
          ));
        }
        // Recalculate final grade as new average of all evaluations
        const updatedGrades = await db
          .select({ value: gradesTable.value })
          .from(gradesTable)
          .where(and(
            eq(gradesTable.studentId, rec.studentId),
            eq(gradesTable.subjectId, rec.subjectId),
            eq(gradesTable.semesterId, rec.semesterId),
          ));
        if (updatedGrades.length > 0) {
          const newAvg = Math.round(
            (updatedGrades.reduce((sum, g) => sum + g.value, 0) / updatedGrades.length) * 100
          ) / 100;
          // Update the reclamation finalGrade to the new accurate average
          await db.update(reclamationsTable).set({ finalGrade: newAvg })
            .where(eq(reclamationsTable.id, id));
          newFinalGrade = newAvg;
        }
      } else {
        // Fallback: update all eval rows with the proposed grade (legacy behavior)
        await db.update(gradesTable).set({
          value: newFinalGrade,
          updatedAt: new Date(),
        }).where(and(
          eq(gradesTable.studentId, rec.studentId),
          eq(gradesTable.subjectId, rec.subjectId),
          eq(gradesTable.semesterId, rec.semesterId),
        ));
      }
    }

    const actorName = await getActorName(adminId);
    await appendHistory(id, adminId, actorName, actionLabel, detail,
      rec.contestedGrade, newFinalGrade ?? undefined);

    // Respond immediately
    res.json({ ok: true });

    // Notifications in background
    (async () => {
      try {
        const [subj] = await db.select({ name: subjectsTable.name }).from(subjectsTable)
          .where(eq(subjectsTable.id, rec.subjectId)).limit(1);
        const subjName = subj?.name ?? "Matière";
        const recUrl = `/reclamations`;

        let studentMsg: string;
        let studentTitle: string;
        if (decision === "validate_accept" || decision === "override_reject") {
          studentMsg = `L'administration a validé la modification de votre note en ${subjName} : ${rec.contestedGrade}/20 → ${newFinalGrade}/20. Votre bulletin a été mis à jour.`;
          studentTitle = "Note modifiée — Bulletin mis à jour";
        } else if (decision === "reject_accept") {
          studentMsg = `L'administration a maintenu la décision. Votre note en ${subjName} reste ${rec.contestedGrade}/20. Motif : ${adminComment.trim().substring(0, 100)}`;
          studentTitle = "Réclamation rejetée — Décision finale";
        } else {
          studentMsg = `Votre réclamation #${rec.claimNumber} en ${subjName} a été clôturée par l'administration`;
          studentTitle = "Réclamation clôturée";
        }
        const adminAction = (decision === "validate_accept" || decision === "override_reject")
          ? "admin-accepted" : decision === "reject_accept" ? "admin-rejected" : "admin-closed";
        await notifyAndPush(rec.studentId, studentMsg, "reclamation", studentTitle, `${recUrl}?id=${id}`, `rec-${id}-${adminAction}`);
      } catch (notifErr) {
        console.error("PUT /admin/reclamations/:id notification error (non-blocking):", notifErr);
      }
    })();
  } catch (err) {
    console.error("PUT /admin/reclamations/:id error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Mark reclamation as "en_cours" when teacher opens it
router.post("/teacher/reclamations/:id/open", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const id = Number(req.params.id);
    const [rec] = await db.select({ status: reclamationsTable.status })
      .from(reclamationsTable)
      .where(and(eq(reclamationsTable.id, id), eq(reclamationsTable.teacherId, teacherId)))
      .limit(1);
    if (!rec) { res.status(404).json({ error: "Not found" }); return; }
    if (rec.status === "soumise") {
      await db.update(reclamationsTable).set({ status: "en_cours", updatedAt: new Date() })
        .where(eq(reclamationsTable.id, id));
      const actorName = await getActorName(teacherId);
      await appendHistory(id, teacherId, actorName, "teacher_opened", "L'enseignant a ouvert la réclamation");

      // Notify student that teacher is examining their reclamation (non-blocking)
      (async () => {
        try {
          const [fullRec] = await db.select({ studentId: reclamationsTable.studentId, claimNumber: reclamationsTable.claimNumber })
            .from(reclamationsTable).where(eq(reclamationsTable.id, id)).limit(1);
          if (fullRec) {
            await notifyAndPush(
              fullRec.studentId,
              `Votre réclamation #${fullRec.claimNumber} est en cours d'examen par ${actorName}`,
              "reclamation",
              "Réclamation en cours d'examen",
              `/reclamations?id=${id}`,
              `rec-${id}-teacher-opened`,
            );
          }
        } catch (_) {}
      })();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
