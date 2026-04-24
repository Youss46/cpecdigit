import { Router } from "express";
import { db } from "@workspace/db";
import {
  evaluationPeriodsTable,
  teacherEvaluationsTable,
  evaluationSubmissionsTable,
  classEnrollmentsTable,
  teacherAssignmentsTable,
  usersTable,
  semestersTable,
  subjectsTable,
  classesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, inArray, count, avg, sql } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();

const MIN_EVALUATIONS_FOR_DISPLAY = 5;

const SECTION_A_COLS = ["a1", "a2", "a3", "a4", "a5"] as const;
const SECTION_B_COLS = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9"] as const;
const SECTION_C_COLS = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;
const ALL_SCORE_COLS = [...SECTION_A_COLS, ...SECTION_B_COLS, ...SECTION_C_COLS] as const;

function getMention(avg: number): string {
  if (avg < 2) return "Mauvais";
  if (avg < 4) return "Insuffisant";
  if (avg < 6) return "Moyen";
  if (avg < 8) return "Bien";
  return "Excellent";
}

function round2(val: string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  return Math.round(Number(val) * 100) / 100;
}

function sectionAvg(vals: (string | null)[]): number | null {
  const nums = vals.map((v) => (v !== null ? Number(v) : null)).filter((n) => n !== null) as number[];
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function weightedGlobal(avgA: number | null, avgB: number | null, avgC: number | null): number | null {
  if (avgA === null || avgB === null || avgC === null) return null;
  return Math.round((avgA * 0.3 + avgB * 0.5 + avgC * 0.2) * 100) / 100;
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

router.get("/admin/evaluations/periods", requireRole("admin"), async (req, res) => {
  try {
    const periods = await db
      .select({
        id: evaluationPeriodsTable.id,
        semesterId: evaluationPeriodsTable.semesterId,
        semesterName: semestersTable.name,
        deadline: evaluationPeriodsTable.deadline,
        isActive: evaluationPeriodsTable.isActive,
        resultsVisible: evaluationPeriodsTable.resultsVisible,
        createdAt: evaluationPeriodsTable.createdAt,
      })
      .from(evaluationPeriodsTable)
      .leftJoin(semestersTable, eq(evaluationPeriodsTable.semesterId, semestersTable.id))
      .orderBy(sql`${evaluationPeriodsTable.createdAt} DESC`);

    const result = await Promise.all(periods.map(async (p) => {
      const [{ total }] = await db
        .select({ total: count() })
        .from(teacherEvaluationsTable)
        .where(eq(teacherEvaluationsTable.periodId, p.id));
      const [{ submitters }] = await db
        .select({ submitters: sql<number>`count(distinct ${evaluationSubmissionsTable.studentId})` })
        .from(evaluationSubmissionsTable)
        .where(eq(evaluationSubmissionsTable.periodId, p.id));
      return { ...p, evaluationCount: Number(total), submitterCount: Number(submitters) };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/admin/evaluations/periods", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, deadline, isActive } = req.body;
    if (!semesterId || !deadline) {
      return res.status(400).json({ error: "semesterId et deadline sont requis" });
    }

    if (isActive) {
      await db
        .update(evaluationPeriodsTable)
        .set({ isActive: false })
        .where(and(
          eq(evaluationPeriodsTable.semesterId, parseInt(semesterId)),
          eq(evaluationPeriodsTable.isActive, true)
        ));
    }

    const [period] = await db
      .insert(evaluationPeriodsTable)
      .values({
        semesterId: parseInt(semesterId),
        deadline: new Date(deadline),
        isActive: isActive ?? false,
        resultsVisible: false,
        createdBy: req.session.userId ?? null,
      })
      .returning();

    if (isActive) {
      await notifyStudentsOfSemester(period.id, period.semesterId);
    }

    res.json(period);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/admin/evaluations/periods/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { deadline, isActive, resultsVisible } = req.body;

    const existing = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Période introuvable" });

    if (isActive === true) {
      await db
        .update(evaluationPeriodsTable)
        .set({ isActive: false })
        .where(and(
          eq(evaluationPeriodsTable.semesterId, existing[0].semesterId),
          eq(evaluationPeriodsTable.isActive, true)
        ));
    }

    const updates: Partial<typeof evaluationPeriodsTable.$inferSelect> = {};
    if (deadline !== undefined) updates.deadline = new Date(deadline);
    if (isActive !== undefined) updates.isActive = isActive;
    if (resultsVisible !== undefined) updates.resultsVisible = resultsVisible;

    const [updated] = await db
      .update(evaluationPeriodsTable)
      .set(updates)
      .where(eq(evaluationPeriodsTable.id, id))
      .returning();

    if (isActive === true && !existing[0].isActive) {
      await notifyStudentsOfSemester(id, existing[0].semesterId);
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/admin/evaluations/periods/:id/results", requireRole("admin"), async (req, res) => {
  try {
    const periodId = parseInt(req.params.id);
    const [period] = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, periodId)).limit(1);
    if (!period) return res.status(404).json({ error: "Période introuvable" });

    const rows = await db
      .select({
        teacherId: teacherEvaluationsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherEvaluationsTable.subjectId,
        subjectName: subjectsTable.name,
        classId: teacherEvaluationsTable.classId,
        className: classesTable.name,
        totalCount: count(teacherEvaluationsTable.id),
        avgA1: avg(teacherEvaluationsTable.a1),
        avgA2: avg(teacherEvaluationsTable.a2),
        avgA3: avg(teacherEvaluationsTable.a3),
        avgA4: avg(teacherEvaluationsTable.a4),
        avgA5: avg(teacherEvaluationsTable.a5),
        avgB1: avg(teacherEvaluationsTable.b1),
        avgB2: avg(teacherEvaluationsTable.b2),
        avgB3: avg(teacherEvaluationsTable.b3),
        avgB4: avg(teacherEvaluationsTable.b4),
        avgB5: avg(teacherEvaluationsTable.b5),
        avgB6: avg(teacherEvaluationsTable.b6),
        avgB7: avg(teacherEvaluationsTable.b7),
        avgB8: avg(teacherEvaluationsTable.b8),
        avgB9: avg(teacherEvaluationsTable.b9),
        avgC1: avg(teacherEvaluationsTable.c1),
        avgC2: avg(teacherEvaluationsTable.c2),
        avgC3: avg(teacherEvaluationsTable.c3),
        avgC4: avg(teacherEvaluationsTable.c4),
        avgC5: avg(teacherEvaluationsTable.c5),
        avgC6: avg(teacherEvaluationsTable.c6),
      })
      .from(teacherEvaluationsTable)
      .leftJoin(usersTable, eq(teacherEvaluationsTable.teacherId, usersTable.id))
      .leftJoin(subjectsTable, eq(teacherEvaluationsTable.subjectId, subjectsTable.id))
      .leftJoin(classesTable, eq(teacherEvaluationsTable.classId, classesTable.id))
      .where(eq(teacherEvaluationsTable.periodId, periodId))
      .groupBy(
        teacherEvaluationsTable.teacherId,
        usersTable.name,
        teacherEvaluationsTable.subjectId,
        subjectsTable.name,
        teacherEvaluationsTable.classId,
        classesTable.name,
      );

    const filtered = rows.filter((r) => Number(r.totalCount) >= MIN_EVALUATIONS_FOR_DISPLAY);
    const qualifyingTeacherIds = [...new Set(filtered.map((r) => r.teacherId!))];

    const sectionDRows = qualifyingTeacherIds.length > 0
      ? await db
          .select({
            teacherId: teacherEvaluationsTable.teacherId,
            d1: teacherEvaluationsTable.d1,
            d2: teacherEvaluationsTable.d2,
            d3: teacherEvaluationsTable.d3,
            d4: teacherEvaluationsTable.d4,
            utilite: teacherEvaluationsTable.utilite,
          })
          .from(teacherEvaluationsTable)
          .where(and(
            eq(teacherEvaluationsTable.periodId, periodId),
            inArray(teacherEvaluationsTable.teacherId, qualifyingTeacherIds)
          ))
      : [];

    const sectionDByTeacher: Record<number, {
      d1: string[]; d2: string[]; d3: string[]; d4: string[];
      utilite: Record<string, number>;
    }> = {};
    for (const row of sectionDRows) {
      const tid = row.teacherId!;
      if (!sectionDByTeacher[tid]) sectionDByTeacher[tid] = { d1: [], d2: [], d3: [], d4: [], utilite: {} };
      if (row.d1?.trim()) sectionDByTeacher[tid].d1.push(row.d1);
      if (row.d2?.trim()) sectionDByTeacher[tid].d2.push(row.d2);
      if (row.d3?.trim()) sectionDByTeacher[tid].d3.push(row.d3);
      if (row.d4?.trim()) sectionDByTeacher[tid].d4.push(row.d4);
      if (row.utilite) {
        const key = String(row.utilite);
        sectionDByTeacher[tid].utilite[key] = (sectionDByTeacher[tid].utilite[key] || 0) + 1;
      }
    }

    const results = filtered.map((r) => {
      const avgA = sectionAvg([r.avgA1, r.avgA2, r.avgA3, r.avgA4, r.avgA5]);
      const avgB = sectionAvg([r.avgB1, r.avgB2, r.avgB3, r.avgB4, r.avgB5, r.avgB6, r.avgB7, r.avgB8, r.avgB9]);
      const avgC = sectionAvg([r.avgC1, r.avgC2, r.avgC3, r.avgC4, r.avgC5, r.avgC6]);
      const global = weightedGlobal(avgA, avgB, avgC);
      const tid = r.teacherId!;
      return {
        teacherId: tid,
        teacherName: r.teacherName,
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        classId: r.classId,
        className: r.className,
        evaluationCount: Number(r.totalCount),
        avgA,
        avgB,
        avgC,
        globalAvg: global,
        mention: global !== null ? getMention(global) : null,
        criteriaA: [r.avgA1, r.avgA2, r.avgA3, r.avgA4, r.avgA5].map((v) => round2(v) ?? 0),
        criteriaB: [r.avgB1, r.avgB2, r.avgB3, r.avgB4, r.avgB5, r.avgB6, r.avgB7, r.avgB8, r.avgB9].map((v) => round2(v) ?? 0),
        criteriaC: [r.avgC1, r.avgC2, r.avgC3, r.avgC4, r.avgC5, r.avgC6].map((v) => round2(v) ?? 0),
        sectionDComments: sectionDByTeacher[tid] ?? { d1: [], d2: [], d3: [], d4: [], utilite: {} },
      };
    });

    results.sort((a, b) => (b.globalAvg ?? 0) - (a.globalAvg ?? 0));

    res.json({ period, results, hiddenCount: rows.length - filtered.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/admin/evaluations/periods/:id/notify-reminder", requireRole("admin"), async (req, res) => {
  try {
    const periodId = parseInt(req.params.id);
    const [period] = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, periodId)).limit(1);
    if (!period) return res.status(404).json({ error: "Période introuvable" });

    const sent = await sendReminderNotifications(periodId, period.semesterId);
    res.json({ sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── STUDENT ──────────────────────────────────────────────────────────────────

router.get("/student/evaluations/current", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session.userId!;

    const [enrollment] = await db
      .select({ classId: classEnrollmentsTable.classId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .limit(1);

    if (!enrollment) return res.json({ period: null, teachers: [], submissions: [] });

    const classId = enrollment.classId;

    const periods = await db
      .select()
      .from(evaluationPeriodsTable)
      .where(eq(evaluationPeriodsTable.isActive, true))
      .limit(1);

    if (!periods.length) return res.json({ period: null, teachers: [], submissions: [] });

    const period = periods[0];

    const now = new Date();
    if (now > period.deadline) {
      return res.json({ period: { ...period, expired: true }, teachers: [], submissions: [] });
    }

    const assignments = await db
      .select({
        teacherId: teacherAssignmentsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
      })
      .from(teacherAssignmentsTable)
      .leftJoin(usersTable, eq(teacherAssignmentsTable.teacherId, usersTable.id))
      .leftJoin(subjectsTable, eq(teacherAssignmentsTable.subjectId, subjectsTable.id))
      .where(and(
        eq(teacherAssignmentsTable.classId, classId),
        eq(teacherAssignmentsTable.semesterId, period.semesterId)
      ));

    const mySubmissions = await db
      .select({ teacherId: evaluationSubmissionsTable.teacherId })
      .from(evaluationSubmissionsTable)
      .where(and(
        eq(evaluationSubmissionsTable.periodId, period.id),
        eq(evaluationSubmissionsTable.studentId, studentId)
      ));

    const submittedTeacherIds = new Set(mySubmissions.map((s) => s.teacherId));

    const teachers = assignments.map((a) => ({
      ...a,
      submitted: submittedTeacherIds.has(a.teacherId!),
    }));

    res.json({ period, teachers, classId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/student/evaluations/submit", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session.userId!;
    const { periodId, teacherId, subjectId, classId, d1, d2, d3, d4, utilite } = req.body;

    if (!periodId || !teacherId || !subjectId || !classId) {
      return res.status(400).json({ error: "periodId, teacherId, subjectId, classId sont requis" });
    }

    const scoreFields = ["a1","a2","a3","a4","a5","b1","b2","b3","b4","b5","b6","b7","b8","b9","c1","c2","c3","c4","c5","c6"];
    for (const field of scoreFields) {
      const val = parseInt(req.body[field]);
      if (!val || val < 1 || val > 10) {
        return res.status(400).json({ error: `Le critère "${field}" doit être noté de 1 à 10` });
      }
    }

    const [period] = await db.select().from(evaluationPeriodsTable).where(eq(evaluationPeriodsTable.id, parseInt(periodId))).limit(1);
    if (!period) return res.status(404).json({ error: "Période introuvable" });
    if (!period.isActive) return res.status(403).json({ error: "La période d'évaluation n'est pas active" });
    if (new Date() > period.deadline) return res.status(403).json({ error: "La date limite d'évaluation est dépassée" });

    const [enrollment] = await db
      .select()
      .from(classEnrollmentsTable)
      .where(and(
        eq(classEnrollmentsTable.studentId, studentId),
        eq(classEnrollmentsTable.classId, parseInt(classId))
      ))
      .limit(1);
    if (!enrollment) return res.status(403).json({ error: "Vous n'êtes pas inscrit dans cette classe" });

    const [assignment] = await db
      .select()
      .from(teacherAssignmentsTable)
      .where(and(
        eq(teacherAssignmentsTable.teacherId, parseInt(teacherId)),
        eq(teacherAssignmentsTable.subjectId, parseInt(subjectId)),
        eq(teacherAssignmentsTable.classId, parseInt(classId)),
        eq(teacherAssignmentsTable.semesterId, period.semesterId)
      ))
      .limit(1);
    if (!assignment) return res.status(403).json({ error: "Cet enseignant n'intervient pas dans votre classe pour ce semestre" });

    const [existing] = await db
      .select()
      .from(evaluationSubmissionsTable)
      .where(and(
        eq(evaluationSubmissionsTable.periodId, parseInt(periodId)),
        eq(evaluationSubmissionsTable.studentId, studentId),
        eq(evaluationSubmissionsTable.teacherId, parseInt(teacherId))
      ))
      .limit(1);
    if (existing) return res.status(409).json({ error: "Vous avez déjà soumis une évaluation pour cet enseignant" });

    const parse = (key: string) => parseInt(req.body[key]);

    await db.insert(teacherEvaluationsTable).values({
      periodId: parseInt(periodId),
      teacherId: parseInt(teacherId),
      subjectId: parseInt(subjectId),
      classId: parseInt(classId),
      a1: parse("a1"), a2: parse("a2"), a3: parse("a3"), a4: parse("a4"), a5: parse("a5"),
      b1: parse("b1"), b2: parse("b2"), b3: parse("b3"), b4: parse("b4"), b5: parse("b5"),
      b6: parse("b6"), b7: parse("b7"), b8: parse("b8"), b9: parse("b9"),
      c1: parse("c1"), c2: parse("c2"), c3: parse("c3"), c4: parse("c4"), c5: parse("c5"), c6: parse("c6"),
      d1: d1?.trim() || null,
      d2: d2?.trim() || null,
      d3: d3?.trim() || null,
      d4: d4?.trim() || null,
      utilite: utilite ? parseInt(utilite) : null,
    });

    await db.insert(evaluationSubmissionsTable).values({
      periodId: parseInt(periodId),
      studentId,
      teacherId: parseInt(teacherId),
    });

    res.json({ message: "Évaluation soumise avec succès" });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Évaluation déjà soumise" });
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── TEACHER ─────────────────────────────────────────────────────────────────

router.get("/teacher/evaluations/results", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session.userId!;

    const periods = await db
      .select()
      .from(evaluationPeriodsTable)
      .where(eq(evaluationPeriodsTable.resultsVisible, true))
      .orderBy(sql`${evaluationPeriodsTable.createdAt} DESC`);

    if (!periods.length) return res.json({ results: [], message: "Aucun résultat disponible pour le moment" });

    const allResults = await Promise.all(periods.map(async (period) => {
      const rows = await db
        .select({
          subjectId: teacherEvaluationsTable.subjectId,
          subjectName: subjectsTable.name,
          classId: teacherEvaluationsTable.classId,
          className: classesTable.name,
          totalCount: count(teacherEvaluationsTable.id),
          avgA1: avg(teacherEvaluationsTable.a1),
          avgA2: avg(teacherEvaluationsTable.a2),
          avgA3: avg(teacherEvaluationsTable.a3),
          avgA4: avg(teacherEvaluationsTable.a4),
          avgA5: avg(teacherEvaluationsTable.a5),
          avgB1: avg(teacherEvaluationsTable.b1),
          avgB2: avg(teacherEvaluationsTable.b2),
          avgB3: avg(teacherEvaluationsTable.b3),
          avgB4: avg(teacherEvaluationsTable.b4),
          avgB5: avg(teacherEvaluationsTable.b5),
          avgB6: avg(teacherEvaluationsTable.b6),
          avgB7: avg(teacherEvaluationsTable.b7),
          avgB8: avg(teacherEvaluationsTable.b8),
          avgB9: avg(teacherEvaluationsTable.b9),
          avgC1: avg(teacherEvaluationsTable.c1),
          avgC2: avg(teacherEvaluationsTable.c2),
          avgC3: avg(teacherEvaluationsTable.c3),
          avgC4: avg(teacherEvaluationsTable.c4),
          avgC5: avg(teacherEvaluationsTable.c5),
          avgC6: avg(teacherEvaluationsTable.c6),
        })
        .from(teacherEvaluationsTable)
        .leftJoin(subjectsTable, eq(teacherEvaluationsTable.subjectId, subjectsTable.id))
        .leftJoin(classesTable, eq(teacherEvaluationsTable.classId, classesTable.id))
        .where(and(
          eq(teacherEvaluationsTable.periodId, period.id),
          eq(teacherEvaluationsTable.teacherId, teacherId)
        ))
        .groupBy(
          teacherEvaluationsTable.subjectId,
          subjectsTable.name,
          teacherEvaluationsTable.classId,
          classesTable.name,
        );

      const qualified = rows.filter((r) => Number(r.totalCount) >= MIN_EVALUATIONS_FOR_DISPLAY);

      const sectionDRows = qualified.length > 0
        ? await db
            .select({
              d1: teacherEvaluationsTable.d1,
              d2: teacherEvaluationsTable.d2,
              d3: teacherEvaluationsTable.d3,
              d4: teacherEvaluationsTable.d4,
              utilite: teacherEvaluationsTable.utilite,
            })
            .from(teacherEvaluationsTable)
            .where(and(
              eq(teacherEvaluationsTable.periodId, period.id),
              eq(teacherEvaluationsTable.teacherId, teacherId)
            ))
        : [];

      const sectionDComments = { d1: [] as string[], d2: [] as string[], d3: [] as string[], d4: [] as string[] };
      const utiliteDistribution: Record<string, number> = {};
      for (const row of sectionDRows) {
        if (row.d1?.trim()) sectionDComments.d1.push(row.d1);
        if (row.d2?.trim()) sectionDComments.d2.push(row.d2);
        if (row.d3?.trim()) sectionDComments.d3.push(row.d3);
        if (row.d4?.trim()) sectionDComments.d4.push(row.d4);
        if (row.utilite) {
          const k = String(row.utilite);
          utiliteDistribution[k] = (utiliteDistribution[k] || 0) + 1;
        }
      }

      return {
        periodId: period.id,
        semesterId: period.semesterId,
        deadline: period.deadline,
        rows: qualified.map((r) => {
          const avgA = sectionAvg([r.avgA1, r.avgA2, r.avgA3, r.avgA4, r.avgA5]);
          const avgB = sectionAvg([r.avgB1, r.avgB2, r.avgB3, r.avgB4, r.avgB5, r.avgB6, r.avgB7, r.avgB8, r.avgB9]);
          const avgC = sectionAvg([r.avgC1, r.avgC2, r.avgC3, r.avgC4, r.avgC5, r.avgC6]);
          const global = weightedGlobal(avgA, avgB, avgC);
          return {
            subjectId: r.subjectId,
            subjectName: r.subjectName,
            classId: r.classId,
            className: r.className,
            evaluationCount: Number(r.totalCount),
            avgA,
            avgB,
            avgC,
            globalAvg: global,
            mention: global !== null ? getMention(global) : null,
            criteriaA: [r.avgA1, r.avgA2, r.avgA3, r.avgA4, r.avgA5].map((v) => round2(v) ?? 0),
            criteriaB: [r.avgB1, r.avgB2, r.avgB3, r.avgB4, r.avgB5, r.avgB6, r.avgB7, r.avgB8, r.avgB9].map((v) => round2(v) ?? 0),
            criteriaC: [r.avgC1, r.avgC2, r.avgC3, r.avgC4, r.avgC5, r.avgC6].map((v) => round2(v) ?? 0),
          };
        }),
        sectionDComments,
        utiliteDistribution,
        belowThreshold: rows.length - qualified.length > 0,
      };
    }));

    res.json({ results: allResults.filter((r) => r.rows.length > 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function notifyStudentsOfSemester(periodId: number, semesterId: number) {
  try {
    const assignedClassIds = await db
      .selectDistinct({ classId: teacherAssignmentsTable.classId })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.semesterId, semesterId));

    if (!assignedClassIds.length) return;

    const classIds = assignedClassIds.map((r) => r.classId);
    const enrolled = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(inArray(classEnrollmentsTable.classId, classIds));

    const studentIds = [...new Set(enrolled.map((e) => e.studentId))];
    if (!studentIds.length) return;

    const title = "Évaluation des enseignants ouverte";
    const message = "La période d'évaluation des enseignants est maintenant ouverte. Votre avis est anonyme et contribue à l'amélioration de la qualité pédagogique.";

    await db.insert(notificationsTable).values(
      studentIds.map((uid) => ({ userId: uid, type: "info" as any, title, message }))
    );
    studentIds.forEach((uid) =>
      sendPushToUser(uid, { title, body: message, type: "info" }).catch(() => {})
    );
  } catch (err) {
    console.error("notifyStudentsOfSemester error:", err);
  }
}

async function sendReminderNotifications(periodId: number, semesterId: number): Promise<number> {
  try {
    const assignedClassIds = await db
      .selectDistinct({ classId: teacherAssignmentsTable.classId })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.semesterId, semesterId));

    if (!assignedClassIds.length) return 0;
    const classIds = assignedClassIds.map((r) => r.classId);

    const enrolled = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(inArray(classEnrollmentsTable.classId, classIds));

    const allStudentIds = [...new Set(enrolled.map((e) => e.studentId))];

    const submitted = await db
      .select({ studentId: evaluationSubmissionsTable.studentId })
      .from(evaluationSubmissionsTable)
      .where(eq(evaluationSubmissionsTable.periodId, periodId));

    const submittedStudents = new Set(submitted.map((s) => s.studentId));
    const pending = allStudentIds.filter((id) => !submittedStudents.has(id));

    if (!pending.length) return 0;

    const title = "Rappel : Évaluation des enseignants";
    const message = "Vous n'avez pas encore soumis toutes vos évaluations. La date limite approche.";

    await db.insert(notificationsTable).values(
      pending.map((uid) => ({ userId: uid, type: "info" as any, title, message }))
    );
    pending.forEach((uid) =>
      sendPushToUser(uid, { title, body: message, type: "info" }).catch(() => {})
    );

    return pending.length;
  } catch (err) {
    console.error("sendReminderNotifications error:", err);
    return 0;
  }
}

export default router;
