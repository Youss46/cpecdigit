import { Router } from "express";
import { db } from "@workspace/db";
import {
  studentFeesTable,
  classFeesTable,
  paymentsTable,
  paymentInstallmentsTable,
  paymentSchedulesTable,
  paymentScheduleInstallmentsTable,
  usersTable,
  classEnrollmentsTable,
  classesTable,
  activityLogTable,
} from "@workspace/db";
import { eq, and, or, isNull, sql, inArray, asc } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { notifyParentsOfStudent } from "./parent.js";
import { sendPushToUser } from "./push.js";
import { parentStudentLinksTable } from "@workspace/db";

const router = Router();

function requireScolariteOrDirecteur(req: any, res: any, next: any) {
  const sub = req.session?.user?.adminSubRole;
  if (sub !== "scolarite" && sub !== "directeur") {
    res.status(403).json({ error: "Réservé à la Responsable Scolarité et au Directeur du Centre." });
    return;
  }
  next();
}

// ─── GET /api/scolarite/students ──────────────────────────────────────────────
router.get("/students", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const students = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
      })
      .from(usersTable)
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.studentId, usersTable.id))
      .leftJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(and(eq(usersTable.role, "student"), eq(usersTable.tenantId, req.tenantId!)));

    if (students.length === 0) { res.json([]); return; }

    const studentIds = students.map(s => s.id);
    const fees = await db.select().from(studentFeesTable).where(inArray(studentFeesTable.studentId, studentIds));
    const feeMap = new Map(fees.map(f => [f.studentId, f]));
    const paidRows = await db
      .select({
        studentId: paymentsTable.studentId,
        totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)`,
      })
      .from(paymentsTable)
      .where(inArray(paymentsTable.studentId, studentIds))
      .groupBy(paymentsTable.studentId);
    const paidMap = new Map(paidRows.map(r => [r.studentId, Number(r.totalPaid)]));

    const result = students.map(s => {
      const fee = feeMap.get(s.id);
      const totalAmount = fee?.totalAmount ?? 0;
      const totalPaid = paidMap.get(s.id) ?? 0;
      const remaining = Math.max(0, totalAmount - totalPaid);
      let status: "paid" | "partial" | "unpaid" = "unpaid";
      if (totalAmount > 0) {
        if (totalPaid >= totalAmount) status = "paid";
        else if (totalPaid > 0) status = "partial";
      }
      return { id: s.id, name: s.name, email: s.email, classId: s.classId, className: s.className, feeId: fee?.id ?? null, totalAmount, totalPaid, remaining, academicYear: fee?.academicYear ?? null, notes: fee?.notes ?? null, status };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/scolarite/stats ─────────────────────────────────────────────────
router.get("/stats", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const [totals] = await db.select({
      totalExpected: sql<number>`COALESCE(SUM(${studentFeesTable.totalAmount}), 0)`,
      studentCount: sql<number>`COUNT(${studentFeesTable.id})`,
    }).from(studentFeesTable);

    const [collected] = await db.select({
      totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)`,
    }).from(paymentsTable);

    const studentIds = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.role, "student"), eq(usersTable.tenantId, req.tenantId!)));
    const allIds = studentIds.map(s => s.id);
    const feeStudentIds = (await db.select({ studentId: studentFeesTable.studentId }).from(studentFeesTable)).map(f => f.studentId);
    const paidRows = allIds.length > 0
      ? await db.select({ studentId: paymentsTable.studentId, totalPaid: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
          .from(paymentsTable).where(inArray(paymentsTable.studentId, allIds)).groupBy(paymentsTable.studentId)
      : [];
    const paidMap = new Map(paidRows.map(r => [r.studentId, Number(r.totalPaid)]));
    const fees = await db.select().from(studentFeesTable);
    const feeMap = new Map(fees.map(f => [f.studentId, f.totalAmount]));

    let fullyPaid = 0, partial = 0, noPay = 0;
    for (const id of feeStudentIds) {
      const fee = feeMap.get(id) ?? 0;
      const paid = paidMap.get(id) ?? 0;
      if (fee > 0) {
        if (paid >= fee) fullyPaid++;
        else if (paid > 0) partial++;
        else noPay++;
      }
    }
    const totalExpected = Number(totals?.totalExpected ?? 0);
    const totalPaid = Number(collected?.totalPaid ?? 0);
    const recoveryRate = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 1000) / 10 : 0;
    res.json({ totalExpected, totalPaid, totalRemaining: Math.max(0, totalExpected - totalPaid), recoveryRate, studentCount: Number(totals?.studentCount ?? 0), fullyPaid, partial, noPay });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PUT /api/scolarite/fees/:studentId ───────────────────────────────────────
router.put("/fees/:studentId", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { totalAmount, academicYear, notes } = req.body;
    if (totalAmount === undefined || totalAmount < 0) { res.status(400).json({ error: "Montant invalide" }); return; }
    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId));
    const [row] = await db.insert(studentFeesTable).values({ studentId, totalAmount, academicYear: academicYear ?? null, notes: notes ?? null })
      .onConflictDoUpdate({ target: [studentFeesTable.studentId], set: { totalAmount, academicYear: academicYear ?? null, notes: notes ?? null, updatedAt: new Date() } })
      .returning();
    await db.insert(activityLogTable).values({ userId: req.session!.userId!, action: "modification_frais_scolarite", details: `Frais de scolarité de ${student?.name ?? `ID ${studentId}`} définis à ${totalAmount.toLocaleString("fr-FR")} FCFA${academicYear ? ` (${academicYear})` : ""}.` });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/scolarite/payments/:studentId ───────────────────────────────────
router.get("/payments/:studentId", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const rows = await db.select({ id: paymentsTable.id, studentId: paymentsTable.studentId, amount: paymentsTable.amount, description: paymentsTable.description, paymentDate: paymentsTable.paymentDate, createdAt: paymentsTable.createdAt, recordedByName: usersTable.name })
      .from(paymentsTable).leftJoin(usersTable, eq(usersTable.id, paymentsTable.recordedById)).where(eq(paymentsTable.studentId, studentId)).orderBy(paymentsTable.paymentDate);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST /api/scolarite/payments ─────────────────────────────────────────────
router.post("/payments", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { studentId, amount, description, paymentDate, paymentMethod, reference, status } = req.body;
    const recordedById = req.session!.userId!;
    if (!studentId || !amount || amount <= 0 || !paymentDate) { res.status(400).json({ error: "studentId, amount et paymentDate sont requis" }); return; }
    const year = paymentDate.slice(0, 4);
    const autoRef = reference || `REC-${year}-${String(Math.floor(Math.random() * 900000) + 100000)}`;
    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(and(eq(usersTable.id, studentId), eq(usersTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Étudiant introuvable" }); return; }
    const [row] = await db.insert(paymentsTable).values({ studentId, amount, description: description ?? null, paymentDate, recordedById, paymentMethod: paymentMethod ?? null, reference: autoRef, status: status ?? "validé" }).returning();
    await db.insert(activityLogTable).values({ userId: recordedById, action: "enregistrement_paiement", details: `Paiement de ${Number(amount).toLocaleString("fr-FR")} FCFA enregistré pour ${student?.name ?? `ID ${studentId}`}${description ? ` — ${description}` : ""} (date : ${paymentDate}).` });
    notifyParentsOfStudent(studentId, "payment_received", "Nouveau paiement enregistré", `Un versement de ${Number(amount).toLocaleString("fr-FR")} FCFA a été enregistré${description ? ` (${description})` : ""} le ${paymentDate}.`).catch(() => {});
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── DELETE /api/scolarite/payments/:id ──────────────────────────────────────
router.delete("/payments/:id", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = parseInt(req.params.id);
    const [payment] = await db.select({ amount: paymentsTable.amount, studentId: paymentsTable.studentId, description: paymentsTable.description })
      .from(paymentsTable)
      .innerJoin(usersTable, eq(usersTable.id, paymentsTable.studentId))
      .where(and(eq(paymentsTable.id, id), eq(usersTable.tenantId, tenantId)));
    if (!payment) { res.status(404).json({ error: "Not Found" }); return; }
    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, payment.studentId));
    await db.delete(paymentsTable).where(eq(paymentsTable.id, id));
    await db.insert(activityLogTable).values({ userId: req.session!.userId!, action: "suppression_paiement", details: `Paiement de ${Number(payment.amount).toLocaleString("fr-FR")} FCFA supprimé pour ${student?.name ?? `ID ${payment.studentId}`}${payment.description ? ` (${payment.description})` : ""}.` });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/scolarite/class-fees ───────────────────────────────────────────
router.get("/class-fees", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const classes = await db.select().from(classesTable).orderBy(classesTable.orderIndex);
    const fees = await db.select().from(classFeesTable);
    const feeMap = new Map(fees.map(f => [f.classId, f]));
    const enrollments = await db.select({ classId: classEnrollmentsTable.classId, count: sql<number>`COUNT(*)` }).from(classEnrollmentsTable).groupBy(classEnrollmentsTable.classId);
    const countMap = new Map(enrollments.map(e => [e.classId, Number(e.count)]));
    res.json(classes.map(c => ({ id: c.id, name: c.name, studentCount: countMap.get(c.id) ?? 0, fee: feeMap.get(c.id) ?? null })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PUT /api/scolarite/class-fees/:classId ──────────────────────────────────
router.put("/class-fees/:classId", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const { totalAmount, academicYear, notes } = req.body;
    if (isNaN(classId) || totalAmount == null) { res.status(400).json({ error: "classId et totalAmount requis" }); return; }
    const [classFee] = await db.insert(classFeesTable).values({ classId, totalAmount, academicYear: academicYear || null, notes: notes || null, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [classFeesTable.classId], set: { totalAmount, academicYear: academicYear || null, notes: notes || null, updatedAt: new Date() } }).returning();
    const enrollments = await db.select({ studentId: classEnrollmentsTable.studentId }).from(classEnrollmentsTable).where(eq(classEnrollmentsTable.classId, classId));
    for (const { studentId } of enrollments) {
      await db.insert(studentFeesTable).values({ studentId, totalAmount, academicYear: academicYear || null, notes: notes || null, updatedAt: new Date() })
        .onConflictDoUpdate({ target: [studentFeesTable.studentId], set: { totalAmount, academicYear: academicYear || null, notes: notes || null, updatedAt: new Date() } });
    }
    res.json({ classFee, appliedToStudents: enrollments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/scolarite/installments/:studentId ──────────────────────────────
router.get("/installments/:studentId", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const studentId = parseInt(req.params.studentId);
    const [student] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, studentId), eq(usersTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Not Found" }); return; }
    const rows = await db.select().from(paymentInstallmentsTable).where(eq(paymentInstallmentsTable.studentId, studentId)).orderBy(paymentInstallmentsTable.dueDate);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST /api/scolarite/installments ────────────────────────────────────────
router.post("/installments", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { studentId, label, dueDate, amount } = req.body;
    if (!studentId || !dueDate || !amount || amount <= 0) { res.status(400).json({ error: "studentId, dueDate et amount requis" }); return; }
    const [student] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, studentId), eq(usersTable.tenantId, tenantId)));
    if (!student) { res.status(404).json({ error: "Étudiant introuvable" }); return; }
    const [row] = await db.insert(paymentInstallmentsTable).values({ studentId, label: label ?? null, dueDate, amount }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PUT /api/scolarite/installments/:id ─────────────────────────────────────
router.put("/installments/:id", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = parseInt(req.params.id);
    const { label, dueDate, amount, paidAt } = req.body;
    const [existing] = await db.select({ installment: paymentInstallmentsTable, studentTenantId: usersTable.tenantId })
      .from(paymentInstallmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, paymentInstallmentsTable.studentId))
      .where(and(eq(paymentInstallmentsTable.id, id), eq(usersTable.tenantId, tenantId)))
      .limit(1)
      .then(rows => rows.map(r => r.installment));
    if (!existing) { res.status(404).json({ error: "Échéance introuvable" }); return; }
    const wasUnpaid = !existing.paidAt;
    const isNowPaid = !!paidAt;
    const [row] = await db.update(paymentInstallmentsTable)
      .set({ label: label ?? undefined, dueDate: dueDate ?? undefined, amount: amount ?? undefined, paidAt: paidAt ?? null, updatedAt: new Date() })
      .where(eq(paymentInstallmentsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Échéance introuvable" }); return; }
    if (wasUnpaid && isNowPaid) {
      const paidDateStr = new Date(paidAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
      const amountStr = new Intl.NumberFormat("fr-FR").format(row.amount);
      const title = "Paiement reçu ✓";
      const body = `🎉 Votre paiement de ${amountStr} FCFA a bien été reçu le ${paidDateStr}. Merci pour votre confiance !`;
      (async () => {
        await sendPushToUser(row.studentId, { title, body, type: "payment_confirmed" });
        const parentLinks = await db.select({ parentId: parentStudentLinksTable.parentId }).from(parentStudentLinksTable).where(eq(parentStudentLinksTable.studentId, row.studentId));
        for (const link of parentLinks) await sendPushToUser(link.parentId, { title, body, type: "payment_confirmed" });
      })().catch(err => console.error("[Scolarite] Erreur notification:", err));
    }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── DELETE /api/scolarite/installments/:id ───────────────────────────────────
router.delete("/installments/:id", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = parseInt(req.params.id);
    const [existing] = await db.select({ id: paymentInstallmentsTable.id })
      .from(paymentInstallmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, paymentInstallmentsTable.studentId))
      .where(and(eq(paymentInstallmentsTable.id, id), eq(usersTable.tenantId, tenantId)));
    if (!existing) { res.status(404).json({ error: "Échéance introuvable" }); return; }
    await db.delete(paymentInstallmentsTable).where(eq(paymentInstallmentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PAYMENT SCHEDULES (ÉCHÉANCIERS)
// ═══════════════════════════════════════════════════════════════════

// ─── GET /api/scolarite/schedules ─────────────────────────────────
router.get("/schedules", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { classId } = req.query;
    const tenantClassIds = (await db.select({ id: classesTable.id }).from(classesTable).where(eq(classesTable.tenantId, tenantId))).map(c => c.id);
    const scopeCondition = tenantClassIds.length > 0
      ? or(inArray(paymentSchedulesTable.classId, tenantClassIds), isNull(paymentSchedulesTable.classId))
      : isNull(paymentSchedulesTable.classId);
    const schedules = classId
      ? await db.select().from(paymentSchedulesTable).where(and(eq(paymentSchedulesTable.classId, parseInt(classId as string)), scopeCondition)).orderBy(asc(paymentSchedulesTable.createdAt))
      : await db.select().from(paymentSchedulesTable).where(scopeCondition).orderBy(asc(paymentSchedulesTable.createdAt));

    if (schedules.length === 0) { res.json([]); return; }

    const scheduleIds = schedules.map(s => s.id);
    const installments = await db.select().from(paymentScheduleInstallmentsTable)
      .where(inArray(paymentScheduleInstallmentsTable.scheduleId, scheduleIds))
      .orderBy(asc(paymentScheduleInstallmentsTable.order));

    const instBySchedule = new Map<number, any[]>();
    for (const inst of installments) {
      if (!instBySchedule.has(inst.scheduleId)) instBySchedule.set(inst.scheduleId, []);
      instBySchedule.get(inst.scheduleId)!.push(inst);
    }

    const classIds = [...new Set(schedules.map(s => s.classId).filter(Boolean))] as number[];
    const classRows = classIds.length > 0 ? await db.select({ id: classesTable.id, name: classesTable.name }).from(classesTable).where(inArray(classesTable.id, classIds)) : [];
    const classMap = new Map(classRows.map(c => [c.id, c.name]));

    res.json(schedules.map(s => ({
      ...s,
      className: s.classId ? (classMap.get(s.classId) ?? null) : null,
      installments: instBySchedule.get(s.id) ?? [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST /api/scolarite/schedules ────────────────────────────────
router.post("/schedules", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { classId, name, totalAmount, academicYear, installments } = req.body;

    if (!name || totalAmount == null || totalAmount <= 0) {
      res.status(400).json({ error: "name et totalAmount sont requis" }); return;
    }
    if (!installments || !Array.isArray(installments) || installments.length === 0) {
      res.status(400).json({ error: "Au moins une tranche est requise" }); return;
    }
    if (classId) {
      const [cls] = await db.select({ id: classesTable.id }).from(classesTable).where(and(eq(classesTable.id, parseInt(classId)), eq(classesTable.tenantId, tenantId))).limit(1);
      if (!cls) { res.status(404).json({ error: "Classe introuvable" }); return; }
    }

    const sum = installments.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0);
    if (Math.abs(sum - totalAmount) > 1) {
      res.status(400).json({ error: `La somme des tranches (${sum.toLocaleString("fr-FR")} FCFA) ne correspond pas au montant total (${totalAmount.toLocaleString("fr-FR")} FCFA)` }); return;
    }

    const [schedule] = await db.insert(paymentSchedulesTable).values({
      classId: classId ? parseInt(classId) : null,
      name,
      totalAmount,
      academicYear: academicYear || null,
    }).returning();

    const instRows = installments.map((t: any, idx: number) => ({
      scheduleId: schedule.id,
      label: t.label || `Tranche ${idx + 1}`,
      amount: Number(t.amount),
      dueDate: t.dueDate,
      order: idx + 1,
    }));

    const createdInst = await db.insert(paymentScheduleInstallmentsTable).values(instRows).returning();

    await db.insert(activityLogTable).values({
      userId: req.session!.userId!,
      action: "creation_echeancier",
      details: `Échéancier "${name}" créé — ${instRows.length} tranche(s), montant total ${totalAmount.toLocaleString("fr-FR")} FCFA.`,
    });

    res.status(201).json({ ...schedule, installments: createdInst });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── DELETE /api/scolarite/schedules/:id ──────────────────────────
router.delete("/schedules/:id", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = parseInt(req.params.id);
    const [schedule] = await db.select({ id: paymentSchedulesTable.id, classId: paymentSchedulesTable.classId }).from(paymentSchedulesTable).where(eq(paymentSchedulesTable.id, id)).limit(1);
    if (!schedule) { res.status(404).json({ error: "Échéancier introuvable" }); return; }
    if (schedule.classId !== null) {
      const [cls] = await db.select({ id: classesTable.id }).from(classesTable).where(and(eq(classesTable.id, schedule.classId), eq(classesTable.tenantId, tenantId))).limit(1);
      if (!cls) { res.status(404).json({ error: "Échéancier introuvable" }); return; }
    }
    await db.delete(paymentSchedulesTable).where(eq(paymentSchedulesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST /api/scolarite/schedules/:id/apply ──────────────────────
// Apply schedule to all students in its class (creates payment_installments per student)
router.post("/schedules/:id/apply", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [schedule] = await db.select().from(paymentSchedulesTable).where(eq(paymentSchedulesTable.id, id)).limit(1);
    if (!schedule) { res.status(404).json({ error: "Échéancier introuvable" }); return; }
    if (!schedule.classId) { res.status(400).json({ error: "Cet échéancier n'est pas associé à une classe" }); return; }

    const installments = await db.select().from(paymentScheduleInstallmentsTable)
      .where(eq(paymentScheduleInstallmentsTable.scheduleId, id))
      .orderBy(asc(paymentScheduleInstallmentsTable.order));

    if (installments.length === 0) { res.status(400).json({ error: "Aucune tranche définie dans cet échéancier" }); return; }

    const enrollments = await db.select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable).where(eq(classEnrollmentsTable.classId, schedule.classId));

    if (enrollments.length === 0) { res.json({ appliedToStudents: 0, createdInstallments: 0 }); return; }

    let createdCount = 0;
    for (const { studentId } of enrollments) {
      for (const inst of installments) {
        const [created] = await db.insert(paymentInstallmentsTable).values({
          studentId,
          scheduleInstallmentId: inst.id,
          label: inst.label,
          dueDate: inst.dueDate,
          amount: inst.amount,
        }).returning();
        if (created) createdCount++;
      }
    }

    await db.insert(activityLogTable).values({
      userId: req.session!.userId!,
      action: "application_echeancier",
      details: `Échéancier "${schedule.name}" appliqué à ${enrollments.length} étudiant(s) — ${createdCount} échéances créées.`,
    });

    res.json({ appliedToStudents: enrollments.length, createdInstallments: createdCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/scolarite/payment-tracking ──────────────────────────
// Matrix: per student, per schedule installment — what's their status
router.get("/payment-tracking", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const { scheduleId } = req.query;
    if (!scheduleId) { res.status(400).json({ error: "scheduleId requis" }); return; }

    const sid = parseInt(scheduleId as string);
    const [schedule] = await db.select().from(paymentSchedulesTable).where(eq(paymentSchedulesTable.id, sid)).limit(1);
    if (!schedule) { res.status(404).json({ error: "Échéancier introuvable" }); return; }

    const templateInstallments = await db.select().from(paymentScheduleInstallmentsTable)
      .where(eq(paymentScheduleInstallmentsTable.scheduleId, sid))
      .orderBy(asc(paymentScheduleInstallmentsTable.order));

    if (!schedule.classId) { res.json({ schedule, templateInstallments, students: [] }); return; }

    const enrollments = await db.select({
      studentId: classEnrollmentsTable.studentId,
      studentName: usersTable.name,
      studentEmail: usersTable.email,
    }).from(classEnrollmentsTable)
      .leftJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .where(eq(classEnrollmentsTable.classId, schedule.classId));

    const templateInstIds = templateInstallments.map(t => t.id);
    const studentInstallments = templateInstIds.length > 0
      ? await db.select().from(paymentInstallmentsTable)
          .where(inArray(paymentInstallmentsTable.scheduleInstallmentId, templateInstIds))
      : [];

    const instMap = new Map<string, any>();
    for (const inst of studentInstallments) {
      if (inst.scheduleInstallmentId) {
        instMap.set(`${inst.studentId}_${inst.scheduleInstallmentId}`, inst);
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    const students = enrollments.map(e => {
      const installmentStatuses = templateInstallments.map(ti => {
        const studentInst = instMap.get(`${e.studentId}_${ti.id}`);
        if (!studentInst) return { templateInstallmentId: ti.id, label: ti.label, dueDate: ti.dueDate, amount: ti.amount, status: "non_genere", paidAt: null, installmentId: null };
        let status = "en_attente";
        if (studentInst.paidAt) status = "paye";
        else if (studentInst.dueDate < today) status = "en_retard";
        return { templateInstallmentId: ti.id, installmentId: studentInst.id, label: ti.label, dueDate: ti.dueDate, amount: ti.amount, status, paidAt: studentInst.paidAt };
      });

      const totalDue = templateInstallments.reduce((s, t) => s + t.amount, 0);
      const totalPaid = installmentStatuses.filter(i => i.status === "paye").reduce((s, i) => s + i.amount, 0);
      const progress = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

      return { studentId: e.studentId, studentName: e.studentName, studentEmail: e.studentEmail, installments: installmentStatuses, totalDue, totalPaid, progress };
    });

    res.json({ schedule, templateInstallments, students });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── PUT /api/scolarite/payment-tracking/mark-paid ────────────────
router.put("/payment-tracking/mark-paid", requireRole("admin"), requireScolariteOrDirecteur, async (req, res) => {
  try {
    const { installmentId, paidAt } = req.body;
    if (!installmentId) { res.status(400).json({ error: "installmentId requis" }); return; }
    const date = paidAt || new Date().toISOString().slice(0, 10);
    const [row] = await db.update(paymentInstallmentsTable)
      .set({ paidAt: date, updatedAt: new Date() })
      .where(eq(paymentInstallmentsTable.id, parseInt(installmentId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Échéance introuvable" }); return; }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
