import { Router } from "express";
import { db } from "@workspace/db";
import {
  specialJurySessionsTable,
  specialJuryDecisionsTable,
  semestersTable,
  usersTable,
  classEnrollmentsTable,
  gradesTable,
  subjectsTable,
  notificationsTable,
  retakeGradesTable,
  teachingUnitsTable,
} from "@workspace/db";
import { eq, and, inArray, isNull, or } from "drizzle-orm";
import { sendPushToUser } from "./push.js";

const router = Router();

function requireScolariteOrDirecteur(req: any, res: any, next: any) {
  const user = req.session?.user;
  if (!user || user.role !== "admin") {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }
  if (user.adminSubRole !== "scolarite" && user.adminSubRole !== "directeur") {
    res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
    return;
  }
  next();
}

// ── Compute semester average for a student (simple weighted average across grades + retake) ──
async function computeRawAverage(
  studentId: number,
  semesterId: number
): Promise<number | null> {
  const grades = await db
    .select({ value: gradesTable.value, coefficient: subjectsTable.coefficient })
    .from(gradesTable)
    .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
    .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, semesterId)));

  const retakeGrades = await db
    .select({ value: retakeGradesTable.grade, coefficient: subjectsTable.coefficient })
    .from(retakeGradesTable)
    .innerJoin(subjectsTable, eq(subjectsTable.id, retakeGradesTable.subjectId))
    .where(and(
      eq(retakeGradesTable.studentId, studentId),
      eq(retakeGradesTable.semesterId, semesterId),
      eq(retakeGradesTable.submissionStatus, "validated")
    ));

  const allGrades = [...grades, ...retakeGrades];
  if (allGrades.length === 0) return null;

  let totalPoints = 0;
  let totalCoef = 0;
  for (const g of allGrades) {
    totalPoints += (g.value ?? 0) * (g.coefficient ?? 1);
    totalCoef += g.coefficient ?? 1;
  }
  if (totalCoef === 0) return null;
  return Math.round((totalPoints / totalCoef) * 100) / 100;
}

// ── GET /admin/jury-special/sessions — list sessions ──────────────────────────
router.get("/jury-special/sessions", requireScolariteOrDirecteur, async (req, res) => {
  try {
    const sessions = await db
      .select({
        id: specialJurySessionsTable.id,
        academicYear: specialJurySessionsTable.academicYear,
        status: specialJurySessionsTable.status,
        activatedBy: specialJurySessionsTable.activatedBy,
        closedAt: specialJurySessionsTable.closedAt,
        notes: specialJurySessionsTable.notes,
        createdAt: specialJurySessionsTable.createdAt,
      })
      .from(specialJurySessionsTable)
      .orderBy(specialJurySessionsTable.createdAt);
    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /admin/jury-special/sessions — activate a jury session ────────────────
router.post("/jury-special/sessions", requireScolariteOrDirecteur, async (req, res) => {
  try {
    const { academicYear, notes } = req.body as { academicYear: string; notes?: string };
    if (!academicYear) {
      res.status(400).json({ error: "academicYear est requis." });
      return;
    }

    const existing = await db
      .select({ id: specialJurySessionsTable.id, status: specialJurySessionsTable.status })
      .from(specialJurySessionsTable)
      .where(and(
        eq(specialJurySessionsTable.academicYear, academicYear),
        eq(specialJurySessionsTable.status, "active")
      ))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Un jury spécial est déjà actif pour cette année académique." });
      return;
    }

    const userId = req.session.user!.id;
    const [session] = await db
      .insert(specialJurySessionsTable)
      .values({ academicYear, notes: notes ?? null, activatedBy: userId })
      .returning();

    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /admin/jury-special/sessions/:id/eligible — list eligible students ────
router.get("/jury-special/sessions/:id/eligible", requireScolariteOrDirecteur, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [session] = await db
      .select()
      .from(specialJurySessionsTable)
      .where(eq(specialJurySessionsTable.id, sessionId))
      .limit(1);
    if (!session) { res.status(404).json({ error: "Session introuvable." }); return; }

    const academicYear = session.academicYear;

    const semesters = await db
      .select()
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear))
      .orderBy(semestersTable.id);

    if (semesters.length === 0) {
      res.json([]);
      return;
    }

    const semesterIds = semesters.map((s) => s.id);

    const students = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.role, "student"));

    const existingDecisions = await db
      .select()
      .from(specialJuryDecisionsTable)
      .where(eq(specialJuryDecisionsTable.sessionId, sessionId));

    const decisionMap = new Map<string, typeof existingDecisions[0]>();
    for (const d of existingDecisions) {
      decisionMap.set(`${d.studentId}-${d.semesterId}`, d);
    }

    const VALIDATION_THRESHOLD = 12;
    const eligible: any[] = [];

    for (const student of students) {
      const semResults: {
        semesterId: number;
        semesterName: string;
        average: number | null;
        validated: boolean;
        decision: any;
      }[] = [];

      for (const sem of semesters) {
        const avg = await computeRawAverage(student.id, sem.id);
        const juryDecision = decisionMap.get(`${student.id}-${sem.id}`) ?? null;
        const effectiveAvg = juryDecision?.newAverage ?? avg;
        const validated = effectiveAvg !== null && effectiveAvg >= VALIDATION_THRESHOLD;

        semResults.push({
          semesterId: sem.id,
          semesterName: sem.name,
          average: avg,
          validated: avg !== null && avg >= VALIDATION_THRESHOLD,
          decision: juryDecision,
        });
      }

      const hasFailedSemester = semResults.some(
        (s) => s.average !== null && !s.validated
      );
      if (!hasFailedSemester) continue;

      const annualAvg =
        semResults.filter((s) => s.average !== null).length > 0
          ? Math.round(
              (semResults
                .filter((s) => s.average !== null)
                .reduce((acc, s) => acc + s.average!, 0) /
                semResults.filter((s) => s.average !== null).length) *
                100
            ) / 100
          : null;

      const failedSemesters = semResults
        .filter((s) => s.average !== null && !s.validated)
        .map((s) => s.semesterName);

      eligible.push({
        studentId: student.id,
        studentName: student.name,
        email: student.email,
        semesters: semResults,
        annualAverage: annualAvg,
        failedSemesters,
      });
    }

    res.json(eligible);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /admin/jury-special/sessions/:id/decisions — record a jury decision ──
router.post("/jury-special/sessions/:id/decisions", requireScolariteOrDirecteur, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [session] = await db
      .select()
      .from(specialJurySessionsTable)
      .where(eq(specialJurySessionsTable.id, sessionId))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session introuvable." }); return; }
    if (session.status !== "active") {
      res.status(400).json({ error: "Le jury est clôturé — aucune modification possible." });
      return;
    }

    const { studentId, semesterId, decision, newAverage, justification } = req.body as {
      studentId: number;
      semesterId: number;
      decision: "validated" | "failed" | "conditional";
      newAverage?: number;
      justification: string;
    };

    if (!studentId || !semesterId || !decision || !justification) {
      res.status(400).json({ error: "studentId, semesterId, decision et justification sont requis." });
      return;
    }
    if (decision === "validated" && (newAverage === undefined || newAverage === null)) {
      res.status(400).json({ error: "newAverage est requis pour une validation jury." });
      return;
    }

    const previousAverage = await computeRawAverage(studentId, semesterId);
    const userId = req.session.user!.id;
    const now = new Date();

    const existing = await db
      .select({ id: specialJuryDecisionsTable.id })
      .from(specialJuryDecisionsTable)
      .where(and(
        eq(specialJuryDecisionsTable.sessionId, sessionId),
        eq(specialJuryDecisionsTable.studentId, studentId),
        eq(specialJuryDecisionsTable.semesterId, semesterId)
      ))
      .limit(1);

    let juryDecision;
    if (existing.length > 0) {
      [juryDecision] = await db
        .update(specialJuryDecisionsTable)
        .set({
          decision,
          newAverage: decision === "validated" || decision === "conditional" ? (newAverage ?? null) : null,
          previousAverage,
          justification,
          decidedBy: userId,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(specialJuryDecisionsTable.id, existing[0].id))
        .returning();
    } else {
      [juryDecision] = await db
        .insert(specialJuryDecisionsTable)
        .values({
          sessionId,
          studentId,
          semesterId,
          decision,
          newAverage: decision === "validated" || decision === "conditional" ? (newAverage ?? null) : null,
          previousAverage,
          justification,
          source: "jury_special",
          decidedBy: userId,
          decidedAt: now,
        })
        .returning();
    }

    res.status(201).json(juryDecision);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /admin/jury-special/sessions/:id/close — close jury & send notifications ──
router.post("/jury-special/sessions/:id/close", requireScolariteOrDirecteur, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [session] = await db
      .select()
      .from(specialJurySessionsTable)
      .where(eq(specialJurySessionsTable.id, sessionId))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session introuvable." }); return; }
    if (session.status !== "active") {
      res.status(400).json({ error: "Ce jury est déjà clôturé." });
      return;
    }

    const userId = req.session.user!.id;
    const now = new Date();

    const [updated] = await db
      .update(specialJurySessionsTable)
      .set({ status: "closed", closedBy: userId, closedAt: now })
      .where(eq(specialJurySessionsTable.id, sessionId))
      .returning();

    const decisions = await db
      .select()
      .from(specialJuryDecisionsTable)
      .where(and(
        eq(specialJuryDecisionsTable.sessionId, sessionId),
        eq(specialJuryDecisionsTable.notified, false)
      ));

    const notifiedStudents = new Set<number>();
    for (const d of decisions) {
      if (notifiedStudents.has(d.studentId)) continue;
      notifiedStudents.add(d.studentId);

      let message = "";
      if (d.decision === "validated") {
        message = `Le Jury Spécial a statué en votre faveur. Votre semestre a été validé avec une moyenne de ${d.newAverage?.toFixed(2)}/20.`;
      } else if (d.decision === "conditional") {
        message = `Le Jury Spécial a rendu sa décision : passage conditionnel en année supérieure. Motif : ${d.justification}.`;
      } else {
        message = `Le Jury Spécial a maintenu votre résultat d'ajournement. Veuillez contacter la scolarité pour la suite.`;
      }

      await db.insert(notificationsTable).values({
        userId: d.studentId,
        type: "jury_special_decision",
        title: "Décision du Jury Spécial",
        message,
        read: false,
      });

      await sendPushToUser(d.studentId, "Décision du Jury Spécial", message);
    }

    if (decisions.length > 0) {
      await db
        .update(specialJuryDecisionsTable)
        .set({ notified: true })
        .where(eq(specialJuryDecisionsTable.sessionId, sessionId));
    }

    res.json({ ...updated, notifiedCount: notifiedStudents.size });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /admin/jury-special/sessions/:id/pv — generate PV data for PDF ────────
router.get("/jury-special/sessions/:id/pv", requireScolariteOrDirecteur, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [session] = await db
      .select()
      .from(specialJurySessionsTable)
      .where(eq(specialJurySessionsTable.id, sessionId))
      .limit(1);
    if (!session) { res.status(404).json({ error: "Session introuvable." }); return; }

    const decisions = await db
      .select()
      .from(specialJuryDecisionsTable)
      .where(eq(specialJuryDecisionsTable.sessionId, sessionId))
      .orderBy(specialJuryDecisionsTable.decidedAt);

    const studentIds = [...new Set(decisions.map((d) => d.studentId))];
    const semesterIds = [...new Set(decisions.map((d) => d.semesterId))];

    const students = studentIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, studentIds))
      : [];
    const semesters = semesterIds.length > 0
      ? await db.select().from(semestersTable).where(inArray(semestersTable.id, semesterIds))
      : [];
    const deciders = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable);

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const semesterMap = new Map(semesters.map((s) => [s.id, s]));
    const deciderMap = new Map(deciders.map((u) => [u.id, u.name]));

    const rows = decisions.map((d) => ({
      studentName: studentMap.get(d.studentId)?.name ?? "—",
      studentEmail: studentMap.get(d.studentId)?.email ?? "—",
      semesterName: semesterMap.get(d.semesterId)?.name ?? "—",
      decision: d.decision,
      previousAverage: d.previousAverage,
      newAverage: d.newAverage,
      justification: d.justification,
      decidedBy: d.decidedBy ? (deciderMap.get(d.decidedBy) ?? "—") : "—",
      decidedAt: d.decidedAt,
    }));

    res.json({
      session,
      academicYear: session.academicYear,
      decisions: rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
