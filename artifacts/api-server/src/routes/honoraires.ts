import { Router } from "express";
import { db } from "@workspace/db";
import {
  teacherHonorariaTable,
  teacherPaymentsTable,
  teacherAssignmentsTable,
  usersTable,
  activityLogTable,
} from "@workspace/db";
import { eq, sql, inArray, and } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

function requirePlanificateurOrDirecteur(req: any, res: any, next: any) {
  const sub = req.session?.user?.adminSubRole;
  if (sub !== "planificateur" && sub !== "directeur") {
    res.status(403).json({ error: "Réservé au Responsable pédagogique et au Directeur du Centre." });
    return;
  }
  next();
}

// ─── GET /api/honoraires/teachers ─────────────────────────────────────────────
router.get("/teachers", requireRole("admin"), requirePlanificateurOrDirecteur, async (req, res) => {
  try {
    const teachers = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(and(eq(usersTable.role, "teacher"), eq(usersTable.tenantId, req.tenantId!)));

    if (teachers.length === 0) { res.json([]); return; }

    const teacherIds = teachers.map(t => t.id);

    const [honoraria, paidRows, plannedHoursRows] = await Promise.all([
      db.select().from(teacherHonorariaTable).where(inArray(teacherHonorariaTable.teacherId, teacherIds)),
      db.select({
        teacherId: teacherPaymentsTable.teacherId,
        totalPaid: sql<number>`COALESCE(SUM(${teacherPaymentsTable.amount}), 0)`,
      }).from(teacherPaymentsTable)
        .where(inArray(teacherPaymentsTable.teacherId, teacherIds))
        .groupBy(teacherPaymentsTable.teacherId),
      db.select({
        teacherId: teacherAssignmentsTable.teacherId,
        totalPlannedHours: sql<number>`COALESCE(SUM(${teacherAssignmentsTable.plannedHours}), 0)`,
      }).from(teacherAssignmentsTable)
        .where(inArray(teacherAssignmentsTable.teacherId, teacherIds))
        .groupBy(teacherAssignmentsTable.teacherId),
    ]);

    const honorariaMap = new Map(honoraria.map(h => [h.teacherId, h]));
    const paidMap = new Map(paidRows.map(r => [r.teacherId, Number(r.totalPaid)]));
    const hoursMap = new Map(plannedHoursRows.map(r => [r.teacherId, Number(r.totalPlannedHours)]));

    const result = teachers.map(t => {
      const h = honorariaMap.get(t.id);
      const totalPlannedHours = hoursMap.get(t.id) ?? 0;
      const hourlyRate = h?.hourlyRate ?? null;
      const autoCalculatedAmount = hourlyRate != null ? hourlyRate * totalPlannedHours : null;
      const totalAmount = h?.totalAmount ?? 0;
      const totalPaid = paidMap.get(t.id) ?? 0;
      const remaining = Math.max(0, totalAmount - totalPaid);
      let status: "paid" | "partial" | "unpaid" = "unpaid";
      if (totalAmount > 0) {
        if (totalPaid >= totalAmount) status = "paid";
        else if (totalPaid > 0) status = "partial";
      }
      return {
        id: t.id, name: t.name, email: t.email,
        honorariumId: h?.id ?? null,
        totalAmount, totalPaid, remaining,
        hourlyRate, totalPlannedHours, autoCalculatedAmount,
        periodLabel: h?.periodLabel ?? null, notes: h?.notes ?? null, status,
      };
    });

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// ─── GET /api/honoraires/assignments/:teacherId ───────────────────────────────
// Per-assignment breakdown for the auto-calculation preview
router.get("/assignments/:teacherId", requireRole("admin"), requirePlanificateurOrDirecteur, async (req, res) => {
  try {
    const teacherId = parseInt(req.params.teacherId);
    const rows = await db.execute(sql`
      SELECT
        ta.id,
        ta.planned_hours,
        s.name AS subject_name,
        c.name AS class_name,
        sem.name AS semester_name,
        sem.academic_year
      FROM teacher_assignments ta
      JOIN subjects s ON s.id = ta.subject_id
      JOIN classes c ON c.id = ta.class_id
      JOIN semesters sem ON sem.id = ta.semester_id
      WHERE ta.teacher_id = ${teacherId}
      ORDER BY sem.academic_year DESC, sem.name, c.name, s.name
    `);
    res.json((rows as any).rows ?? []);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// ─── GET /api/honoraires/stats ────────────────────────────────────────────────
router.get("/stats", requireRole("admin"), requirePlanificateurOrDirecteur, async (req, res) => {
  try {
    const [totals] = await db.select({
      totalExpected: sql<number>`COALESCE(SUM(${teacherHonorariaTable.totalAmount}), 0)`,
      teacherCount: sql<number>`COUNT(${teacherHonorariaTable.id})`,
    }).from(teacherHonorariaTable);

    const [collected] = await db.select({
      totalPaid: sql<number>`COALESCE(SUM(${teacherPaymentsTable.amount}), 0)`,
    }).from(teacherPaymentsTable);

    const honoraria = await db.select({ teacherId: teacherHonorariaTable.teacherId, total: teacherHonorariaTable.totalAmount }).from(teacherHonorariaTable);
    const teacherIds = honoraria.map(h => h.teacherId);
    const honorariaMap = new Map(honoraria.map(h => [h.teacherId, h.total]));

    const paidRows = teacherIds.length > 0
      ? await db.select({ teacherId: teacherPaymentsTable.teacherId, totalPaid: sql<number>`COALESCE(SUM(${teacherPaymentsTable.amount}), 0)` })
          .from(teacherPaymentsTable).where(inArray(teacherPaymentsTable.teacherId, teacherIds)).groupBy(teacherPaymentsTable.teacherId)
      : [];
    const paidMap = new Map(paidRows.map(r => [r.teacherId, Number(r.totalPaid)]));

    let fullyPaid = 0, partial = 0, noPay = 0;
    for (const id of teacherIds) {
      const fee = honorariaMap.get(id) ?? 0;
      const paid = paidMap.get(id) ?? 0;
      if (fee > 0) {
        if (paid >= fee) fullyPaid++;
        else if (paid > 0) partial++;
        else noPay++;
      }
    }

    const totalExpected = Number(totals?.totalExpected ?? 0);
    const totalPaid = Number(collected?.totalPaid ?? 0);
    const recoveryRate = totalExpected > 0 ? Math.min(100, Math.round((totalPaid / totalExpected) * 1000) / 10) : 0;

    res.json({ totalExpected, totalPaid, totalRemaining: Math.max(0, totalExpected - totalPaid), recoveryRate, teacherCount: Number(totals?.teacherCount ?? 0), fullyPaid, partial, noPay });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// ─── PUT /api/honoraires/fees/:teacherId ──────────────────────────────────────
router.put("/fees/:teacherId", requireRole("admin"), requirePlanificateurOrDirecteur, async (req, res) => {
  try {
    const teacherId = parseInt(req.params.teacherId);
    const { hourlyRate, totalAmount, periodLabel, notes } = req.body;

    let finalAmount: number;
    let logDetail: string;

    if (hourlyRate != null && hourlyRate > 0) {
      // Auto-calculate from hourly rate × planned hours
      const [hoursResult] = await db
        .select({ totalHours: sql<number>`COALESCE(SUM(${teacherAssignmentsTable.plannedHours}), 0)` })
        .from(teacherAssignmentsTable)
        .where(eq(teacherAssignmentsTable.teacherId, teacherId));
      const totalHours = Number(hoursResult?.totalHours ?? 0);
      finalAmount = hourlyRate * totalHours;
      logDetail = `Honoraires calculés automatiquement : ${hourlyRate.toLocaleString("fr-FR")} FCFA/h × ${totalHours}h = ${finalAmount.toLocaleString("fr-FR")} FCFA`;
    } else if (totalAmount !== undefined && totalAmount >= 0) {
      finalAmount = totalAmount;
      logDetail = `Honoraires définis manuellement à ${Number(totalAmount).toLocaleString("fr-FR")} FCFA`;
    } else {
      res.status(400).json({ error: "Fournir un taux horaire ou un montant total valide." });
      return;
    }

    const [teacher] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, teacherId));

    const [row] = await db.insert(teacherHonorariaTable)
      .values({
        teacherId,
        totalAmount: finalAmount,
        hourlyRate: hourlyRate ?? null,
        periodLabel: periodLabel ?? null,
        notes: notes ?? null,
      })
      .onConflictDoUpdate({
        target: [teacherHonorariaTable.teacherId],
        set: {
          totalAmount: finalAmount,
          hourlyRate: hourlyRate ?? null,
          periodLabel: periodLabel ?? null,
          notes: notes ?? null,
          updatedAt: new Date(),
        },
      }).returning();

    await db.insert(activityLogTable).values({
      userId: req.session!.userId!,
      action: "modification_honoraires",
      details: `${teacher?.name ?? `ID ${teacherId}`} — ${logDetail}${periodLabel ? ` (${periodLabel})` : ""}.`,
    });

    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// ─── GET /api/honoraires/payments/:teacherId ──────────────────────────────────
router.get("/payments/:teacherId", requireRole("admin"), requirePlanificateurOrDirecteur, async (req, res) => {
  try {
    const teacherId = parseInt(req.params.teacherId);
    const rows = await db.select({
      id: teacherPaymentsTable.id,
      teacherId: teacherPaymentsTable.teacherId,
      amount: teacherPaymentsTable.amount,
      description: teacherPaymentsTable.description,
      paymentDate: teacherPaymentsTable.paymentDate,
      paymentMethod: teacherPaymentsTable.paymentMethod,
      createdAt: teacherPaymentsTable.createdAt,
      recordedByName: usersTable.name,
    }).from(teacherPaymentsTable)
      .leftJoin(usersTable, eq(usersTable.id, teacherPaymentsTable.recordedById))
      .where(eq(teacherPaymentsTable.teacherId, teacherId))
      .orderBy(teacherPaymentsTable.paymentDate);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// ─── POST /api/honoraires/payments ───────────────────────────────────────────
router.post("/payments", requireRole("admin"), requirePlanificateurOrDirecteur, async (req, res) => {
  try {
    const { teacherId, amount, description, paymentDate, paymentMethod } = req.body;
    const recordedById = req.session!.userId!;
    if (!teacherId || !amount || amount <= 0 || !paymentDate) {
      res.status(400).json({ error: "teacherId, amount et paymentDate sont requis" });
      return;
    }
    const [teacher] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, teacherId));
    const [row] = await db.insert(teacherPaymentsTable)
      .values({ teacherId, amount, description: description ?? null, paymentDate, paymentMethod: paymentMethod ?? "especes", recordedById })
      .returning();

    await db.insert(activityLogTable).values({
      userId: recordedById,
      action: "paiement_honoraires",
      details: `Paiement de ${Number(amount).toLocaleString("fr-FR")} FCFA versé à ${teacher?.name ?? `ID ${teacherId}`}${description ? ` — ${description}` : ""} (date : ${paymentDate}).`,
    });

    res.status(201).json(row);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// ─── DELETE /api/honoraires/payments/:id ─────────────────────────────────────
router.delete("/payments/:id", requireRole("admin"), requirePlanificateurOrDirecteur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [payment] = await db.select({ amount: teacherPaymentsTable.amount, teacherId: teacherPaymentsTable.teacherId, description: teacherPaymentsTable.description })
      .from(teacherPaymentsTable).where(eq(teacherPaymentsTable.id, id));

    if (payment) {
      const [teacher] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, payment.teacherId));
      await db.delete(teacherPaymentsTable).where(eq(teacherPaymentsTable.id, id));
      await db.insert(activityLogTable).values({
        userId: req.session!.userId!,
        action: "suppression_paiement_honoraires",
        details: `Paiement de ${Number(payment.amount).toLocaleString("fr-FR")} FCFA supprimé pour ${teacher?.name ?? `ID ${payment.teacherId}`}${payment.description ? ` (${payment.description})` : ""}.`,
      });
    } else {
      await db.delete(teacherPaymentsTable).where(eq(teacherPaymentsTable.id, id));
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

export default router;
