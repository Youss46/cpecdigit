import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendPushToUser } from "../routes/push.js";

const INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

async function insertNotification(userId: number, title: string, body: string, type = "bibliotheque") {
  await db.execute(sql`
    INSERT INTO notifications (user_id, title, body, type, read, created_at)
    VALUES (${userId}, ${title}, ${body}, ${type}, false, NOW())
  `);
}

async function alreadySentToday(etudiantId: number, semestreId: number | null, type: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT id FROM library_recommendations
    WHERE etudiant_id = ${etudiantId}
      AND (${semestreId}::int IS NULL OR semestre_id = ${semestreId})
      AND type = ${type}
      AND cree_le >= NOW() - INTERVAL '20 hours'
    LIMIT 1
  `) as any).rows ?? [];
  return rows.length > 0;
}

async function runRecommendationJob() {
  console.log("[reco-scheduler] Running recommendation job…");
  try {
    await runExamProximityReco();
    await runInactivityReco();
  } catch (err) {
    console.error("[reco-scheduler] Error:", err);
  }
}

// ── J-15, J-7, J-3 avant fin de semestre ─────────────────────────────────────
async function runExamProximityReco() {
  const semesters = (await db.execute(sql`
    SELECT id, name, end_date, class_id
    FROM semesters
    WHERE end_date IS NOT NULL
      AND end_date >= CURRENT_DATE
      AND end_date <= CURRENT_DATE + INTERVAL '16 days'
  `) as any).rows ?? [];

  for (const sem of semesters) {
    const endDate = new Date(sem.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((endDate.getTime() - today.getTime()) / 86400000);

    const triggerDays = [15, 7, 3];
    if (!triggerDays.includes(daysLeft)) continue;

    const triggerType = `examen_j${daysLeft}`;

    const students = (await db.execute(sql`
      SELECT DISTINCT ce.student_id as id
      FROM class_enrollments ce
      WHERE ce.class_id = ${sem.class_id}
    `) as any).rows ?? [];

    for (const student of students) {
      const etudiantId = student.id;

      if (await alreadySentToday(etudiantId, sem.id, triggerType)) continue;

      const unconsultedResources = (await db.execute(sql`
        SELECT lr.id, lr.title, lr.subject_id
        FROM library_resources lr
        WHERE lr.semester_id = ${sem.id}
          AND lr.suspended = false
          AND lr.id NOT IN (
            SELECT resource_id FROM library_downloads WHERE student_id = ${etudiantId}
          )
        LIMIT 10
      `) as any).rows ?? [];

      const failedQuizzes = (await db.execute(sql`
        SELECT lq.id, lq.titre, lr.subject_id
        FROM library_quiz_resultats qr
        JOIN library_quiz lq ON lq.id = qr.quiz_id
        JOIN library_resources lr ON lr.id = lq.resource_id
        WHERE qr.etudiant_id = ${etudiantId}
          AND lr.semester_id = ${sem.id}
          AND qr.max_score > 0
          AND (qr.score / qr.max_score) < 0.5
        ORDER BY qr.termine_le DESC
        LIMIT 5
      `) as any).rows ?? [];

      const hasUnconsulted = unconsultedResources.length > 0;
      const hasFailedQuiz = failedQuizzes.length > 0;

      if (!hasUnconsulted && !hasFailedQuiz) continue;

      const priorite = daysLeft <= 3 ? "haute" : daysLeft <= 7 ? "moyenne" : "faible";

      const supportIds = unconsultedResources.map((r: any) => r.id);
      const quizIds = failedQuizzes.map((q: any) => q.id);

      const firstSubjectId = unconsultedResources[0]?.subject_id ?? failedQuizzes[0]?.subject_id ?? null;

      await db.execute(sql`
        INSERT INTO library_recommendations
          (etudiant_id, matiere_id, semestre_id, priorite, type, support_ids, quiz_ids, jours_avant_examen, cree_le, envoyee_le)
        VALUES
          (${etudiantId}, ${firstSubjectId}, ${sem.id}, ${priorite}, ${triggerType},
           ${JSON.stringify(supportIds)}, ${JSON.stringify(quizIds)}, ${daysLeft}, NOW(), NOW())
      `);

      const msgMap: Record<number, string> = {
        15: `Commencez vos révisions — ${unconsultedResources.length} support(s) non consulté(s) pour ${sem.name}`,
        7: `⚠️ Examen dans 7 jours — Vous n'avez pas encore consulté ${unconsultedResources.length} support(s)`,
        3: `🔴 Urgent — Révisez avant votre examen de ${sem.name}`,
      };

      const pushMsg = msgMap[daysLeft] ?? `Révisez pour votre examen de ${sem.name}`;

      try {
        await sendPushToUser(etudiantId, {
          title: "📚 Révision recommandée",
          body: pushMsg,
          type: "bibliotheque",
          url: "/bibliotheque",
        });
      } catch (_) {}

      await insertNotification(etudiantId, "📚 Révision recommandée", pushMsg);
    }
  }
}

// ── Inactivité : 7 jours sans consultation ────────────────────────────────────
async function runInactivityReco() {
  const inactiveStudents = (await db.execute(sql`
    SELECT DISTINCT ce.student_id as id
    FROM class_enrollments ce
    WHERE ce.student_id IN (
      SELECT DISTINCT student_id FROM library_downloads
    )
    AND ce.student_id NOT IN (
      SELECT DISTINCT student_id
      FROM library_time_tracking
      WHERE tracked_at >= NOW() - INTERVAL '7 days'
    )
    AND ce.student_id NOT IN (
      SELECT DISTINCT student_id
      FROM library_downloads
      WHERE downloaded_at >= NOW() - INTERVAL '7 days'
    )
  `) as any).rows ?? [];

  for (const student of inactiveStudents) {
    const etudiantId = student.id;
    if (await alreadySentToday(etudiantId, null, "inactivite_7j")) continue;

    const recentResources = (await db.execute(sql`
      SELECT lr.id, lr.title
      FROM library_resources lr
      WHERE lr.suspended = false
        AND lr.id NOT IN (
          SELECT resource_id FROM library_downloads WHERE student_id = ${etudiantId}
        )
      ORDER BY lr.created_at DESC
      LIMIT 5
    `) as any).rows ?? [];

    if (recentResources.length === 0) continue;

    const supportIds = recentResources.map((r: any) => r.id);

    await db.execute(sql`
      INSERT INTO library_recommendations
        (etudiant_id, matiere_id, semestre_id, priorite, type, support_ids, quiz_ids, cree_le, envoyee_le)
      VALUES
        (${etudiantId}, null, null, 'moyenne', 'inactivite_7j',
         ${JSON.stringify(supportIds)}, '[]', NOW(), NOW())
    `);

    const msg = `N'oubliez pas vos cours — des supports vous attendent dans la bibliothèque`;

    try {
      await sendPushToUser(etudiantId, {
        title: "📖 Vous n'avez pas révisé depuis 7 jours",
        body: msg,
        type: "bibliotheque",
        url: "/bibliotheque",
      });
    } catch (_) {}

    await insertNotification(etudiantId, "📖 Révision — 7 jours sans activité", msg);
  }
}

export function startRecommendationScheduler() {
  console.log("[reco-scheduler] Started (interval: 6h)");
  runRecommendationJob();
  setInterval(runRecommendationJob, INTERVAL_MS);
}
