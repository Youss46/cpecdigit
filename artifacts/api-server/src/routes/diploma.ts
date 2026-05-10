import { Router } from "express";
import crypto from "crypto";
import { pool } from "@workspace/db";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser } from "./push.js";
import { sendDiplomaEmail } from "../lib/resend.js";

const router = Router();

// ─── Helper: compute student's global average across all semesters of a class cycle ──
async function computeCycleAverage(
  studentId: number,
  tenantId: number,
  classId: number
): Promise<{ average: number | null; mention: string }> {
  const { rows } = await pool.query<{ avg: string | null }>(
    `SELECT ROUND(AVG(g.value)::numeric, 2) as avg
     FROM grades g
     JOIN semesters s ON g.semester_id = s.id
     JOIN classes c ON s.class_id = c.id
     WHERE g.student_id = $1
       AND c.tenant_id = $2
       AND s.class_id = $3
       AND g.value IS NOT NULL`,
    [studentId, tenantId, classId]
  );
  const raw = rows[0]?.avg ? parseFloat(rows[0].avg) : null;
  let mention = "Passable";
  if (raw !== null) {
    if (raw >= 16) mention = "Très Bien";
    else if (raw >= 14) mention = "Bien";
    else if (raw >= 12) mention = "Assez Bien";
    else mention = "Passable";
  }
  return { average: raw, mention };
}

// ─── Helper: get open memoir session for a class ──────────────────────────────
async function getOpenMemoireSession(tenantId: number, classId: number): Promise<any | null> {
  const now = new Date().toISOString();
  const { rows } = await pool.query(
    `SELECT id, titre, date_cloture
     FROM memoire_sessions
     WHERE tenant_id = $1
       AND statut = 'OUVERTE'
       AND date_ouverture <= $2
       AND date_cloture >= $2
       AND $3 = ANY(class_ids)
     LIMIT 1`,
    [tenantId, now, classId]
  );
  return rows[0] ?? null;
}

// ─── Admin: get diploma stats for a class ────────────────────────────────────
router.get("/admin/diploma/class/:classId/stats", requireRole("admin"), async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const tenantId = req.session!.tenantId!;

    const { rows } = await pool.query<{
      total: string;
      diplome: string;
      ajourne_fin_cycle: string;
      actif: string;
    }>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE u.student_status = 'diplome') as diplome,
         COUNT(*) FILTER (WHERE u.student_status = 'ajourne_fin_cycle') as ajourne_fin_cycle,
         COUNT(*) FILTER (WHERE u.student_status IS NULL OR u.student_status = 'actif') as actif
       FROM class_enrollments ce
       JOIN users u ON u.id = ce.student_id
       WHERE ce.class_id = $1 AND u.tenant_id = $2`,
      [classId, tenantId]
    );

    res.json({
      total: parseInt(rows[0]?.total ?? "0"),
      diplome: parseInt(rows[0]?.diplome ?? "0"),
      ajourne: parseInt(rows[0]?.ajourne_fin_cycle ?? "0"),
      actif: parseInt(rows[0]?.actif ?? "0"),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: list terminal class students with diploma status ─────────────────
router.get("/admin/diploma/class/:classId/students", requireRole("admin"), async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const tenantId = req.session!.tenantId!;

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, COALESCE(u.student_status, 'actif') as student_status,
              da.id as attestation_id, da.token, da.average, da.mention, da.academic_year, da.created_at as diplome_date
       FROM class_enrollments ce
       JOIN users u ON u.id = ce.student_id
       LEFT JOIN diploma_attestations da ON da.student_id = u.id AND da.tenant_id = $2 AND da.class_id = $1 AND da.invalidated_at IS NULL
       WHERE ce.class_id = $1 AND u.tenant_id = $2
       ORDER BY u.name ASC`,
      [classId, tenantId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: manually trigger diploma for a student ───────────────────────────
router.post("/admin/diploma/student/:studentId/validate", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const tenantId = req.session!.tenantId!;
    const { academic_year, class_id } = req.body as { academic_year: string; class_id: number };

    if (!academic_year || !class_id) {
      res.status(400).json({ error: "academic_year et class_id sont requis." });
      return;
    }

    // Check student exists and is in a terminal class
    const { rows: studentRows } = await pool.query(
      `SELECT u.id, u.name, u.email, c.name as class_name, c.is_terminal
       FROM users u
       JOIN class_enrollments ce ON ce.student_id = u.id
       JOIN classes c ON c.id = ce.class_id
       WHERE u.id = $1 AND u.tenant_id = $2 AND ce.class_id = $3`,
      [studentId, tenantId, class_id]
    );

    if (!studentRows[0]) {
      res.status(404).json({ error: "Étudiant introuvable dans cette classe." });
      return;
    }

    const student = studentRows[0];

    // Compute cycle average + mention
    const { average, mention } = await computeCycleAverage(studentId, tenantId, class_id);

    // Generate unique token
    const token = crypto.randomBytes(48).toString("hex");

    // Invalidate any previous attestation
    await pool.query(
      `UPDATE diploma_attestations SET invalidated_at = NOW()
       WHERE student_id = $1 AND tenant_id = $2 AND class_id = $3 AND invalidated_at IS NULL`,
      [studentId, tenantId, class_id]
    );

    // Insert new attestation
    const { rows: attRows } = await pool.query(
      `INSERT INTO diploma_attestations (tenant_id, student_id, class_id, academic_year, token, mention, average, class_name, student_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tenantId, studentId, class_id, academic_year, token, mention, average, student.class_name, student.name]
    );

    // Mark student as diplômé
    await pool.query(
      `UPDATE users SET student_status = 'diplome' WHERE id = $1`,
      [studentId]
    );

    // Insert in-app notification
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, read)
       VALUES ($1, 'diplome', $2, $3, false)`,
      [
        studentId,
        "🎓 Félicitations — Diplôme obtenu !",
        `Félicitations ! Vous avez validé votre ${student.class_name}. Vos documents de diplôme sont disponibles dans votre Espace Diplômé.`,
      ]
    );

    // Push notification
    await sendPushToUser(
      studentId,
      "🎓 Félicitations — Diplôme obtenu !",
      `Vous avez validé votre ${student.class_name}. Vos documents sont disponibles dans votre Espace Diplômé.`
    );

    // Email notification (non-blocking)
    sendDiplomaEmail({
      studentName: student.name,
      studentEmail: student.email,
      className: student.class_name,
      academicYear: academic_year,
      mention,
      average: average ?? undefined,
    }).catch((e) => console.error("[DiplomaEmail]", e));

    // Check if memoir session open → notify to submit
    const memoireSession = await getOpenMemoireSession(tenantId, class_id);
    if (memoireSession) {
      const closingDate = new Date(memoireSession.date_cloture).toLocaleDateString("fr-FR");
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, read)
         VALUES ($1, 'memoire_invite', $2, $3, false)`,
        [
          studentId,
          "📝 Période de dépôt de mémoire ouverte",
          `Une période de soumission de mémoire est ouverte pour votre classe jusqu'au ${closingDate}. Connectez-vous pour déposer votre travail.`,
        ]
      );
      await sendPushToUser(
        studentId,
        "📝 Dépôt de mémoire — Période ouverte",
        `La période de soumission de mémoire est ouverte jusqu'au ${closingDate}.`
      );
    }

    res.json({ success: true, attestation: attRows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: mark student as ajourné fin de cycle ─────────────────────────────
router.post("/admin/diploma/student/:studentId/ajourne", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const tenantId = req.session!.tenantId!;

    const { rows } = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'student'`,
      [studentId, tenantId]
    );
    if (!rows[0]) { res.status(404).json({ error: "Étudiant introuvable." }); return; }

    await pool.query(
      `UPDATE users SET student_status = 'ajourne_fin_cycle' WHERE id = $1`,
      [studentId]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, read)
       VALUES ($1, 'ajournement', $2, $3, false)`,
      [
        studentId,
        "Résultat de délibération",
        "Suite aux délibérations de fin d'année, vous êtes ajourné(e). Vous resterez dans votre classe pour l'année suivante et reprisserez uniquement les semestres non validés (capitalisation LMD). Contactez la scolarité pour plus d'informations.",
      ]
    );

    await sendPushToUser(
      studentId,
      "Résultat de délibération",
      "Vous êtes ajourné(e) en fin de cycle. Contactez la scolarité pour les modalités de l'année suivante."
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: reset student status to actif (e.g. correct a mistake) ───────────
router.post("/admin/diploma/student/:studentId/reset", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const tenantId = req.session!.tenantId!;

    await pool.query(
      `UPDATE users SET student_status = 'actif' WHERE id = $1 AND tenant_id = $2`,
      [studentId, tenantId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student: get diploma info ────────────────────────────────────────────────
router.get("/student/diploma", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const tenantId = req.session!.tenantId!;

    const { rows: userRows } = await pool.query(
      `SELECT u.id, u.name, u.email, COALESCE(u.student_status, 'actif') as student_status,
              c.id as class_id, c.name as class_name, c.is_terminal
       FROM users u
       LEFT JOIN class_enrollments ce ON ce.student_id = u.id
       LEFT JOIN classes c ON c.id = ce.class_id
       WHERE u.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [studentId, tenantId]
    );

    const user = userRows[0];
    if (!user) { res.status(404).json({ error: "Étudiant introuvable." }); return; }

    if (user.student_status !== "diplome") {
      res.json({ status: user.student_status ?? "actif", attestation: null, bulletins: [] });
      return;
    }

    // Get attestation
    const { rows: attRows } = await pool.query(
      `SELECT * FROM diploma_attestations
       WHERE student_id = $1 AND tenant_id = $2 AND invalidated_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, tenantId]
    );

    // Get all bulletins (semesters with grades)
    const { rows: bulletinRows } = await pool.query(
      `SELECT DISTINCT s.id as semester_id, s.name as semester_name, s.academic_year,
              s.class_id, c.name as class_name
       FROM semesters s
       JOIN classes c ON c.id = s.class_id
       JOIN grades g ON g.semester_id = s.id AND g.student_id = $1
       WHERE c.tenant_id = $2
       ORDER BY s.academic_year ASC, s.id ASC`,
      [studentId, tenantId]
    );

    res.json({
      status: "diplome",
      studentName: user.name,
      className: user.class_name,
      attestation: attRows[0] ?? null,
      bulletins: bulletinRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student: generate bulletin HTML for diplomed student ────────────────────
router.get("/student/diploma/bulletin/:semesterId", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const tenantId = req.session!.tenantId!;
    const semesterId = parseInt(req.params.semesterId);

    // Verify student is diplomed and owns this semester
    const { rows: statusRows } = await pool.query(
      `SELECT COALESCE(student_status, 'actif') as student_status FROM users WHERE id = $1 AND tenant_id = $2`,
      [studentId, tenantId]
    );
    if (!statusRows[0] || statusRows[0].student_status !== "diplome") {
      res.status(403).json({ error: "Accès réservé aux diplômés." });
      return;
    }

    // Verify the semester belongs to this student
    const { rows: semRows } = await pool.query(
      `SELECT g.id FROM grades g
       JOIN semesters s ON g.semester_id = s.id
       JOIN classes c ON c.id = s.class_id
       WHERE g.student_id = $1 AND g.semester_id = $2 AND c.tenant_id = $3 LIMIT 1`,
      [studentId, semesterId, tenantId]
    );
    if (semRows.length === 0) {
      res.status(403).json({ error: "Bulletin introuvable pour cet étudiant." });
      return;
    }

    // Redirect to admin bulletin generation (runs server-side with same session scoping)
    res.redirect(`/api/admin/bulletin/${studentId}/${semesterId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Public: verify diploma attestation via QR code ──────────────────────────
router.get("/public/verify-diploma/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      `SELECT da.*, u.name as student_name, u.email as student_email,
              c.name as class_name, t.name as institution_name
       FROM diploma_attestations da
       JOIN users u ON u.id = da.student_id
       JOIN classes c ON c.id = da.class_id
       JOIN tenants t ON t.id = da.tenant_id
       WHERE da.token = $1`,
      [token]
    );

    const record = rows[0];
    if (!record) {
      res.json({ valid: false, reason: "Cette attestation est introuvable ou n'existe pas dans notre système." });
      return;
    }

    if (record.invalidated_at) {
      res.json({ valid: false, reason: "Cette attestation a été invalidée. Veuillez contacter l'établissement." });
      return;
    }

    res.json({
      valid: true,
      studentName: record.student_name,
      className: record.class_name,
      academicYear: record.academic_year,
      mention: record.mention,
      average: record.average,
      institution: record.institution_name,
      issuedAt: record.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
