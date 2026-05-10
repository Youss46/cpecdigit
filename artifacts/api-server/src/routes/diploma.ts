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

// ─── Admin: list available classes for master continuation (all non-terminal, non-current) ──
router.get("/admin/diploma/student/:studentId/master-classes", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const tenantId = req.session!.tenantId!;

    const { rows: currentClass } = await pool.query(
      `SELECT ce.class_id FROM class_enrollments ce
       JOIN users u ON u.id = ce.student_id
       WHERE ce.student_id = $1 AND u.tenant_id = $2 LIMIT 1`,
      [studentId, tenantId]
    );
    const currentClassId = currentClass[0]?.class_id ?? null;

    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.filiere, c.is_terminal,
              COALESCE(
                (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id), 0
              ) as student_count,
              cf.total_amount as default_fees
       FROM classes c
       LEFT JOIN class_fees cf ON cf.class_id = c.id
       WHERE c.tenant_id = $1
         AND ($2::int IS NULL OR c.id != $2)
       ORDER BY c.order_index ASC, c.name ASC`,
      [tenantId, currentClassId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: re-enroll diplomed student into a new Master class ────────────────
router.post("/admin/diploma/student/:studentId/reinscrit-master", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const tenantId = req.session!.tenantId!;
    const adminId = req.session!.userId!;
    const { new_class_id, academic_year, frais_scolarite } = req.body as {
      new_class_id: number;
      academic_year: string;
      frais_scolarite?: number;
    };

    if (!new_class_id || !academic_year) {
      res.status(400).json({ error: "new_class_id et academic_year sont requis." });
      return;
    }

    // Verify student exists, belongs to tenant and is diplomed
    const { rows: studentRows } = await pool.query(
      `SELECT u.id, u.name, u.email, COALESCE(u.student_status, 'actif') as student_status,
              c.id as old_class_id, c.name as old_class_name
       FROM users u
       LEFT JOIN class_enrollments ce ON ce.student_id = u.id
       LEFT JOIN classes c ON c.id = ce.class_id
       WHERE u.id = $1 AND u.tenant_id = $2 AND u.role = 'student'`,
      [studentId, tenantId]
    );
    if (!studentRows[0]) {
      res.status(404).json({ error: "Étudiant introuvable." });
      return;
    }
    const student = studentRows[0];
    if (student.student_status !== "diplome") {
      res.status(400).json({ error: "L'étudiant n'est pas diplômé. L'inscription en Master n'est possible qu'après obtention du diplôme." });
      return;
    }

    // Verify new class exists and belongs to this tenant
    const { rows: newClassRows } = await pool.query(
      `SELECT id, name, filiere FROM classes WHERE id = $1 AND tenant_id = $2`,
      [new_class_id, tenantId]
    );
    if (!newClassRows[0]) {
      res.status(404).json({ error: "Classe introuvable." });
      return;
    }
    const newClass = newClassRows[0];

    // ── DB transaction ────────────────────────────────────────────────────────
    const client = await (await import("@workspace/db")).pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Remove old enrollment (history stays in grades/attendance by class/semester IDs)
      await client.query(
        `DELETE FROM class_enrollments WHERE student_id = $1`,
        [studentId]
      );

      // 2. Insert new enrollment in Master class
      await client.query(
        `INSERT INTO class_enrollments (student_id, class_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [studentId, new_class_id]
      );

      // 3. Reset student status to actif
      await client.query(
        `UPDATE users SET student_status = 'actif' WHERE id = $1`,
        [studentId]
      );

      // 4. Update student fees for new cycle (upsert)
      if (frais_scolarite !== undefined && frais_scolarite !== null) {
        await client.query(
          `INSERT INTO student_fees (student_id, total_amount, academic_year, notes, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (student_id) DO UPDATE
             SET total_amount = $2, academic_year = $3, updated_at = NOW()`,
          [studentId, frais_scolarite, academic_year, `Inscription Master — ${newClass.name} — ${academic_year}`]
        );
      }

      // 5. Archive pending payment installments from previous cycle
      // (mark them as paid with zero amount to clear the dashboard, keeping history)
      await client.query(
        `UPDATE payment_installments
         SET paid_at = CURRENT_DATE
         WHERE student_id = $1 AND paid_at IS NULL`,
        [studentId]
      );

      // 6. Log in activity log if table exists
      await client.query(
        `INSERT INTO activity_log (tenant_id, user_id, action, details, created_at)
         VALUES ($1, $2, 'reinscription_master', $3, NOW())
         ON CONFLICT DO NOTHING`,
        [tenantId, adminId, JSON.stringify({
          studentId,
          studentName: student.name,
          oldClassId: student.old_class_id,
          oldClassName: student.old_class_name,
          newClassId: new_class_id,
          newClassName: newClass.name,
          academicYear: academic_year,
          fraisScolarite: frais_scolarite ?? null,
        })]
      ).catch(() => {/* activity log may not exist - non-blocking */});

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // 7. In-app notification
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, read)
       VALUES ($1, 'reinscription_master', $2, $3, false)`,
      [
        studentId,
        "🎓 Inscription en Master validée",
        `Votre inscription en ${newClass.name} (${academic_year}) a été validée. Bienvenue dans votre nouveau cycle !`,
      ]
    );

    // 8. Push notification
    await sendPushToUser(
      studentId,
      "🎓 Inscription en Master validée",
      `Votre inscription en ${newClass.name} a été validée. Bienvenue dans votre nouveau cycle !`
    );

    res.json({
      success: true,
      studentName: student.name,
      newClassName: newClass.name,
      academicYear: academic_year,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student: check if master continuation is available ──────────────────────
router.get("/student/diploma/continuation", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const tenantId = req.session!.tenantId!;

    const { rows: statusRows } = await pool.query(
      `SELECT COALESCE(student_status, 'actif') as student_status FROM users WHERE id = $1`,
      [studentId]
    );
    if (statusRows[0]?.student_status !== "diplome") {
      res.json({ available: false, classes: [] });
      return;
    }

    const { rows: currentClass } = await pool.query(
      `SELECT ce.class_id, c.filiere FROM class_enrollments ce
       JOIN classes c ON c.id = ce.class_id
       WHERE ce.student_id = $1 LIMIT 1`,
      [studentId]
    );
    const filiere = currentClass[0]?.filiere ?? null;
    const currentClassId = currentClass[0]?.class_id ?? null;

    // Find non-terminal classes in the same filière (if filière set) or all
    const { rows: classes } = await pool.query(
      `SELECT id, name, filiere, is_terminal
       FROM classes
       WHERE tenant_id = $1
         AND ($2::int IS NULL OR id != $2)
         AND is_terminal = false
         AND ($3::text IS NULL OR filiere ILIKE '%' || split_part($3, ' ', 1) || '%')
       ORDER BY order_index ASC, name ASC
       LIMIT 10`,
      [tenantId, currentClassId, filiere]
    );

    res.json({ available: classes.length > 0, classes });
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
