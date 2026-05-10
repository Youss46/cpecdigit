import { pool } from "@workspace/db";
import { sendPushToUser } from "../routes/push.js";
import { sendMemoireSessionEmail } from "./resend.js";

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

async function alreadySent(sessionId: number, studentId: number, type: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM memoire_session_reminders_log
     WHERE session_id = $1 AND student_id = $2 AND reminder_type = $3
     LIMIT 1`,
    [sessionId, studentId, type]
  );
  return rows.length > 0;
}

async function logSent(sessionId: number, studentId: number, type: string): Promise<void> {
  await pool.query(
    `INSERT INTO memoire_session_reminders_log (session_id, student_id, reminder_type)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [sessionId, studentId, type]
  );
}

export async function runMemoireSessionReminderJob(): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  console.log(`[MemoireSession] Reminder job démarré pour ${todayStr}`);

  try {
    // Fetch all open sessions across all tenants
    const { rows: sessions } = await pool.query(
      `SELECT ms.*, t.name AS school_name
       FROM memoire_sessions ms
       JOIN tenants t ON t.id = ms.tenant_id
       WHERE ms.statut = 'OUVERTE'
         AND ms.date_ouverture <= NOW()
         AND ms.date_cloture >= NOW()`
    );

    for (const session of sessions) {
      const cloture = new Date(session.date_cloture);
      cloture.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.round((cloture.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (![7, 3, 1, 0].includes(diffDays)) continue;

      const reminderType = diffDays === 0 ? "J0" : `J-${diffDays}`;
      const dateLabel = fmtDate(session.date_cloture);
      const sessionTitle = session.titre || "Période de soumission de mémoires";

      // Find eligible students who haven't submitted yet
      const { rows: students } = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email
         FROM users u
         JOIN class_enrollments ce ON ce.student_id = u.id
         WHERE u.tenant_id = $1
           AND u.role = 'student'
           AND ce.class_id = ANY($2::int[])
           AND NOT EXISTS (
             SELECT 1 FROM memoires m
             WHERE m.student_id = u.id
               AND m.tenant_id = $1
               AND m.statut NOT IN ('REJETE')
           )`,
        [session.tenant_id, session.class_ids]
      );

      for (const student of students) {
        if (await alreadySent(session.id, student.id, reminderType)) continue;

        let pushBody: string;
        let emailSubject: string;
        if (diffDays === 0) {
          pushBody = `📅 Dernier jour ! La période de soumission de mémoires se clôture aujourd'hui. Déposez votre dossier dès maintenant.`;
          emailSubject = `Clôture aujourd'hui — ${sessionTitle}`;
        } else {
          pushBody = `⏰ Il vous reste ${diffDays} jour${diffDays > 1 ? "s" : ""} pour déposer votre mémoire. Date limite : ${dateLabel}.`;
          emailSubject = `Rappel J-${diffDays} — ${sessionTitle}`;
        }

        await sendPushToUser(student.id, {
          title: "Rappel dépôt de mémoire",
          body: pushBody,
          url: "/student/memoires",
          tag: `memoire-session-${session.id}-${reminderType}`,
        }).catch(() => {});

        await sendMemoireSessionEmail({
          to: student.email,
          studentName: student.name,
          sessionTitle,
          dateCloture: session.date_cloture,
          schoolName: session.school_name,
          type: diffDays === 0 ? "J0" : "rappel",
          joursRestants: diffDays,
        }).catch((e) => console.error("[MemoireSession email]", e));

        await logSent(session.id, student.id, reminderType);
      }

      console.log(`[MemoireSession] Session ${session.id} (${reminderType}): ${students.length} étudiant(s) traité(s)`);
    }
  } catch (err) {
    console.error("[MemoireSession] Erreur reminder job:", err);
  }
}

export function startMemoireSessionScheduler(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const next8h = new Date();
  next8h.setHours(8, 0, 0, 0);
  if (next8h <= now) next8h.setDate(next8h.getDate() + 1);
  const msUntilFirst = next8h.getTime() - now.getTime();

  console.log(`[MemoireSession] Scheduler démarré — prochain run à 08h00 (dans ${Math.round(msUntilFirst / 60000)} min)`);

  setTimeout(() => {
    runMemoireSessionReminderJob();
    setInterval(runMemoireSessionReminderJob, INTERVAL_MS);
  }, msUntilFirst);
}
