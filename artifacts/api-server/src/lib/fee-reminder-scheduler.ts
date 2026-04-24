import { db } from "@workspace/db";
import {
  paymentInstallmentsTable,
  feeRemindersLogTable,
  usersTable,
  parentStudentLinksTable,
  classEnrollmentsTable,
  classesTable,
} from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";
import { sendPushToUser } from "../routes/push.js";

function fmtAmount(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function getParentIds(studentId: number): Promise<number[]> {
  const rows = await db
    .select({ parentId: parentStudentLinksTable.parentId })
    .from(parentStudentLinksTable)
    .where(eq(parentStudentLinksTable.studentId, studentId));
  return rows.map(r => r.parentId);
}

async function getAdminUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));
  return rows.map(r => r.id);
}

async function alreadySent(installmentId: number, reminderType: string): Promise<boolean> {
  const rows = await db
    .select({ id: feeRemindersLogTable.id })
    .from(feeRemindersLogTable)
    .where(and(
      eq(feeRemindersLogTable.installmentId, installmentId),
      eq(feeRemindersLogTable.reminderType, reminderType),
    ))
    .limit(1);
  return rows.length > 0;
}

async function logSent(installmentId: number, reminderType: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(feeRemindersLogTable)
    .values({ installmentId, reminderType, sentAt: today })
    .onConflictDoNothing();
}

async function notifyStudentAndParents(
  studentId: number,
  parentIds: number[],
  title: string,
  body: string,
  type: string,
): Promise<void> {
  await sendPushToUser(studentId, { title, body, type });
  for (const pid of parentIds) {
    await sendPushToUser(pid, { title, body, type });
  }
}

export async function runFeeReminderJob(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  console.log(`[FeeReminder] Job démarré pour ${todayStr}`);

  try {
    const installments = await db
      .select()
      .from(paymentInstallmentsTable)
      .where(isNull(paymentInstallmentsTable.paidAt));

    for (const inst of installments) {
      const due = new Date(inst.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const amount = fmtAmount(inst.amount);
      const dateLabel = fmtDate(inst.dueDate);
      const studentId = inst.studentId;
      const parentIds = await getParentIds(studentId);

      if (diffDays === 7) {
        const type = "J-7";
        if (!await alreadySent(inst.id, type)) {
          const body = `😊 Bonjour ! Votre prochaine échéance de ${amount} FCFA est prévue le ${dateLabel}. Nous vous en informons à l'avance pour que tout se passe sereinement.`;
          await notifyStudentAndParents(studentId, parentIds, "Rappel d'échéance", body, "payment_reminder");
          await logSent(inst.id, type);
        }
      }

      if (diffDays === 3) {
        const type = "J-3";
        if (!await alreadySent(inst.id, type)) {
          const body = `🌸 Bonjour ! Dans quelques jours, le ${dateLabel}, une tranche de ${amount} FCFA est prévue. Nous restons disponibles si vous avez la moindre question.`;
          await notifyStudentAndParents(studentId, parentIds, "Rappel d'échéance", body, "payment_reminder");
          await logSent(inst.id, type);
        }
      }

      if (diffDays === 0) {
        const type = "J0";
        if (!await alreadySent(inst.id, type)) {
          const body = `☀️ Bonjour et bonne journée ! Votre échéance de ${amount} FCFA est prévue aujourd'hui. Le service de scolarité est à votre disposition.`;
          await notifyStudentAndParents(studentId, parentIds, "Échéance aujourd'hui", body, "payment_reminder");
          await logSent(inst.id, type);
        }
      }

      if (diffDays === -7) {
        const typeStudent = "J+7_student";
        if (!await alreadySent(inst.id, typeStudent)) {
          const body = `🤝 Bonjour. Nous n'avons pas encore reçu votre règlement de ${amount} FCFA du ${dateLabel}. Si vous rencontrez une difficulté, l'administration est là pour vous accompagner.`;
          await notifyStudentAndParents(studentId, parentIds, "Règlement en attente", body, "payment_overdue");
          await logSent(inst.id, typeStudent);
        }

        const typeAdmin = "J+7_admin";
        if (!await alreadySent(inst.id, typeAdmin)) {
          const [student] = await db
            .select({ name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.id, studentId))
            .limit(1);

          const [enrollment] = await db
            .select({ className: classesTable.name })
            .from(classEnrollmentsTable)
            .leftJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
            .where(eq(classEnrollmentsTable.studentId, studentId))
            .limit(1);

          const studentName = student?.name ?? "Étudiant";
          const className = enrollment?.className ?? "—";
          const adminBody = `📋 ${studentName} — ${className} : règlement de ${amount} FCFA non reçu à ce jour (échéance du ${dateLabel}).`;

          const adminIds = await getAdminUserIds();
          for (const adminId of adminIds) {
            await sendPushToUser(adminId, { title: "Suivi scolarité", body: adminBody, type: "payment_overdue_admin" });
          }
          await logSent(inst.id, typeAdmin);
        }
      }
    }

    console.log(`[FeeReminder] Job terminé — ${installments.length} échéance(s) vérifiée(s)`);
  } catch (err) {
    console.error("[FeeReminder] Erreur dans le job de rappel :", err);
  }
}

export function startFeeReminderScheduler(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;

  const now = new Date();
  const next8h = new Date();
  next8h.setHours(8, 0, 0, 0);
  if (next8h <= now) {
    next8h.setDate(next8h.getDate() + 1);
  }
  const msUntilFirst = next8h.getTime() - now.getTime();

  console.log(`[FeeReminder] Scheduler démarré — prochain run à 08h00 (dans ${Math.round(msUntilFirst / 60000)} min)`);

  setTimeout(() => {
    runFeeReminderJob();
    setInterval(runFeeReminderJob, INTERVAL_MS);
  }, msUntilFirst);
}
