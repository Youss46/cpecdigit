import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { pool } from "@workspace/db";
import { requireRole } from "../lib/auth.js";
import { sendConvocationEmail } from "../lib/resend.js";
import { sendPushToUser, sendPushToUsers } from "./push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Store files in memory then persist to DB (avoids ephemeral disk loss on Railway restarts)
const memoireUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const router = Router();

// ─── Student: submit a memoire ────────────────────────────────────────────────
router.post(
  "/student/memoires",
  requireRole("student"),
  memoireUpload.single("fichier"),
  async (req, res) => {
    try {
      const studentId = req.session!.userId!;
      const tenantId  = req.session!.tenantId!;
      const { titre, resume, filiere, annee_academique } = req.body as Record<string, string>;

      if (!titre || !annee_academique) {
        res.status(400).json({ error: "titre et annee_academique sont requis" });
        return;
      }

      // Step 1: insert row (no file path yet)
      const { rows } = await pool.query(
        `INSERT INTO memoires
           (tenant_id, student_id, titre, resume, filiere, annee_academique,
            fichier_nom, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'SOUMIS')
         RETURNING id`,
        [tenantId, studentId, titre, resume ?? null, filiere ?? null,
         annee_academique,
         req.file ? req.file.originalname : null]
      );
      const memoireId = rows[0].id;

      // Step 2: if file provided, store binary in DB (survives Railway restarts)
      if (req.file) {
        await pool.query(
          `UPDATE memoires
           SET fichier_path    = $1,
               fichier_contenu = $2,
               fichier_mime    = $3
           WHERE id = $4`,
          [
            `/api/memoires/${memoireId}/fichier`,
            req.file.buffer,
            req.file.mimetype,
            memoireId,
          ]
        );
      }

      // Notify all admins of the tenant
      const { rows: adminRows } = await pool.query(
        `SELECT id FROM users
         WHERE tenant_id = $1 AND role = 'admin'
           AND admin_sub_role IN ('planificateur', 'directeur')`,
        [tenantId]
      );
      const adminIds = adminRows.map((r: { id: number }) => r.id);
      const studentName = req.session!.name ?? "Un étudiant";
      sendPushToUsers(adminIds, {
        title: "Nouveau mémoire soumis",
        body: `${studentName} a soumis un mémoire : "${titre}"`,
        type: "memoire_soumis",
        url: "/admin/memoires",
        tag: `memoire-soumis-${memoireId}`,
      }).catch(() => {});

      res.status(201).json({ id: memoireId, message: "Mémoire soumis avec succès." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// ─── Student: list own memoires ───────────────────────────────────────────────
router.get("/student/memoires", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const tenantId  = req.session!.tenantId!;

    const { rows } = await pool.query(
      `SELECT m.*,
              s.date_soutenance, s.heure_debut, s.duree_minutes, s.salle,
              s.id AS soutenance_id
       FROM memoires m
       LEFT JOIN soutenances s ON s.memoire_id = m.id
       WHERE m.student_id = $1 AND m.tenant_id = $2
       ORDER BY m.created_at DESC`,
      [studentId, tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student: get memoire detail + jury ───────────────────────────────────────
router.get("/student/memoires/:id", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const id = parseInt(req.params.id);

    const { rows: [memoire] } = await pool.query(
      `SELECT m.*,
              s.id AS soutenance_id, s.date_soutenance, s.heure_debut,
              s.duree_minutes, s.salle
       FROM memoires m
       LEFT JOIN soutenances s ON s.memoire_id = m.id
       WHERE m.id = $1 AND m.student_id = $2`,
      [id, studentId]
    );
    if (!memoire) { res.status(404).json({ error: "Introuvable" }); return; }

    const { rows: jury } = await pool.query(
      `SELECT jm.*, u.name AS user_name
       FROM jury_membres jm
       LEFT JOIN users u ON u.id = jm.user_id
       WHERE jm.soutenance_id = $1`,
      [memoire.soutenance_id]
    );
    res.json({ ...memoire, jury });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Shared: serve file binary (admin = all; student = own only) ─────────────
router.get("/memoires/:id/fichier", requireRole("admin", "student"), async (req, res) => {
  try {
    const id      = parseInt(req.params.id);
    const role    = req.session!.role!;
    const userId  = req.session!.userId!;
    const tenantId = req.session!.tenantId!;

    const params: unknown[] = [id, tenantId];
    let sql = `SELECT fichier_contenu, fichier_mime, fichier_nom, fichier_path
               FROM memoires WHERE id = $1 AND tenant_id = $2`;
    if (role !== "admin") {
      sql += ` AND student_id = $3`;
      params.push(userId);
    }

    const { rows: [row] } = await pool.query(sql, params);
    if (!row) { res.status(404).json({ error: "Introuvable" }); return; }

    const mime = row.fichier_mime || "application/octet-stream";
    const nom  = row.fichier_nom  || "document";
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(nom)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");

    // New records: binary stored in DB
    if (row.fichier_contenu) {
      res.setHeader("Content-Type", mime);
      res.send(row.fichier_contenu);
      return;
    }

    // Legacy records: fall back to disk (may not exist after Railway restart)
    if (row.fichier_path?.startsWith("/api/uploads/")) {
      const filename = row.fichier_path.slice("/api/uploads/".length);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        return;
      }
    }

    res.status(404).json({ error: "Fichier non disponible — veuillez le soumettre à nouveau." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: list all memoires (with filters) ──────────────────────────────────
router.get("/admin/memoires", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { statut, filiere, annee, q } = req.query as Record<string, string>;

    let sql = `
      SELECT m.*, u.name AS student_name, u.email AS student_email,
             s.date_soutenance, s.heure_debut, s.salle, s.id AS soutenance_id
      FROM memoires m
      JOIN users u ON u.id = m.student_id
      LEFT JOIN soutenances s ON s.memoire_id = m.id
      WHERE m.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (statut)  { sql += ` AND m.statut = $${idx++}`;  params.push(statut); }
    if (filiere) { sql += ` AND m.filiere = $${idx++}`; params.push(filiere); }
    if (annee)   { sql += ` AND m.annee_academique = $${idx++}`; params.push(annee); }
    if (q)       { sql += ` AND (m.titre ILIKE $${idx} OR u.name ILIKE $${idx})`; params.push(`%${q}%`); idx++; }

    sql += " ORDER BY m.created_at DESC";

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: get memoire detail ────────────────────────────────────────────────
router.get("/admin/memoires/:id", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const id = parseInt(req.params.id);

    const { rows: [memoire] } = await pool.query(
      `SELECT m.*, u.name AS student_name, u.email AS student_email,
              sp.class_name,
              s.id AS soutenance_id, s.date_soutenance, s.heure_debut,
              s.duree_minutes, s.salle
       FROM memoires m
       JOIN users u ON u.id = m.student_id
       LEFT JOIN (
         SELECT DISTINCT ON (ce.student_id) ce.student_id, c.name AS class_name
         FROM class_enrollments ce JOIN classes c ON c.id = ce.class_id
         ORDER BY ce.student_id, ce.enrolled_at DESC
       ) sp ON sp.student_id = m.student_id
       LEFT JOIN soutenances s ON s.memoire_id = m.id
       WHERE m.id = $1 AND m.tenant_id = $2`,
      [id, tenantId]
    );
    if (!memoire) { res.status(404).json({ error: "Introuvable" }); return; }

    const { rows: jury } = memoire.soutenance_id
      ? await pool.query(
          `SELECT jm.*, u.name AS user_name
           FROM jury_membres jm
           LEFT JOIN users u ON u.id = jm.user_id
           WHERE jm.soutenance_id = $1
           ORDER BY CASE jm.role WHEN 'PRESIDENT' THEN 1 WHEN 'RAPPORTEUR' THEN 2 ELSE 3 END`,
          [memoire.soutenance_id]
        )
      : { rows: [] };

    res.json({ ...memoire, jury });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: validate / archive a memoire ─────────────────────────────────────
router.put("/admin/memoires/:id/statut", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const id = parseInt(req.params.id);
    const { statut } = req.body as { statut: string };

    const allowed = ["VALIDE", "ARCHIVE", "REJETE"];
    if (!allowed.includes(statut)) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }

    const { rows: [m] } = await pool.query(
      `UPDATE memoires SET statut = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING student_id, titre`,
      [statut, id, tenantId]
    );

    if (m) {
      if (statut === "VALIDE") {
        sendPushToUser(m.student_id, {
          title: "✅ Mémoire validé",
          body: `Votre mémoire « ${m.titre} » a été validé. La planification de la soutenance va débuter.`,
          url: "/student/memoires",
          tag: `memoire-${id}-valide`,
        }).catch(() => {});
      } else if (statut === "ARCHIVE") {
        sendPushToUser(m.student_id, {
          title: "📁 Mémoire archivé",
          body: `Votre mémoire « ${m.titre} » a été archivé dans la bibliothèque numérique.`,
          url: "/student/memoires",
          tag: `memoire-${id}-archive`,
        }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: reject a memoire (any statut → REJETE) ────────────────────────────
router.post("/admin/memoires/:id/rejeter", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const id = parseInt(req.params.id);
    const { raison } = req.body as { raison?: string };

    const { rows: [m] } = await pool.query(
      `UPDATE memoires
       SET statut = 'REJETE', raison_rejet = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING student_id, titre`,
      [raison ?? null, id, tenantId]
    );

    if (!m) { res.status(404).json({ error: "Mémoire introuvable" }); return; }

    sendPushToUser(m.student_id, {
      title: "❌ Mémoire refusé",
      body: raison
        ? `Votre mémoire « ${m.titre} » a été refusé : ${raison}`
        : `Votre mémoire « ${m.titre} » a été refusé par l'administration.`,
      url: "/student/memoires",
      tag: `memoire-${id}-rejete`,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: schedule a soutenance + compose jury (VALIDE → PLANIFIE) ─────────
router.post("/admin/memoires/:id/soutenance", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const memoireId = parseInt(req.params.id);
    const {
      date_soutenance, heure_debut, duree_minutes, salle, jury,
    } = req.body as {
      date_soutenance: string;
      heure_debut: string;
      duree_minutes?: number;
      salle?: string;
      jury: Array<{
        user_id?: number;
        nom_externe?: string;
        email_externe?: string;
        role: string;
      }>;
    };

    if (!date_soutenance || !heure_debut) {
      res.status(400).json({ error: "date_soutenance et heure_debut sont requis" });
      return;
    }

    // Récupérer les infos de l'étudiant pour la notification
    const { rows: [memInfo] } = await pool.query(
      `SELECT m.titre, m.filiere, m.student_id,
              u.name AS student_name, u.email AS student_email,
              t.name AS school_name
       FROM memoires m
       JOIN users u ON u.id = m.student_id
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1 AND m.tenant_id = $2`,
      [memoireId, tenantId]
    );
    if (!memInfo) { res.status(404).json({ error: "Mémoire introuvable" }); return; }

    // Upsert soutenance
    const { rows: [sout] } = await pool.query(
      `INSERT INTO soutenances (tenant_id, memoire_id, date_soutenance, heure_debut, duree_minutes, salle)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (memoire_id) DO UPDATE
         SET date_soutenance=$3, heure_debut=$4, duree_minutes=$5, salle=$6
       RETURNING id`,
      [tenantId, memoireId, date_soutenance, heure_debut, duree_minutes ?? 60, salle ?? null]
    );
    const soutenanceId = sout.id;

    // Replace jury members
    await pool.query(`DELETE FROM jury_membres WHERE soutenance_id = $1`, [soutenanceId]);
    for (const m of (jury ?? [])) {
      await pool.query(
        `INSERT INTO jury_membres (soutenance_id, tenant_id, user_id, nom_externe, email_externe, role)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [soutenanceId, tenantId, m.user_id ?? null, m.nom_externe ?? null, m.email_externe ?? null, m.role]
      );
    }

    // Move memoire status to PLANIFIE
    await pool.query(
      `UPDATE memoires SET statut='PLANIFIE', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
      [memoireId, tenantId]
    );

    // Push notification to student
    const dateFormatted = new Date(date_soutenance).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    sendPushToUser(memInfo.student_id ?? 0, {
      title: "📅 Soutenance planifiée",
      body: `Votre soutenance est prévue le ${dateFormatted} à ${heure_debut}${salle ? ` — Salle ${salle}` : ""}.`,
      url: "/student/memoires",
      tag: `memoire-${memoireId}-planifie`,
    }).catch(() => {});

    // Send convocation email to student
    const juryNames = (jury ?? []).map((j) => ({
      nom: j.nom_externe ?? "",
      role: j.role,
    }));
    sendConvocationEmail({
      to: memInfo.student_email,
      studentName: memInfo.student_name,
      titre: memInfo.titre,
      dateSoutenance: date_soutenance,
      heureDebut: heure_debut,
      salle: salle ?? "Non précisée",
      dureeMinutes: duree_minutes ?? 60,
      jury: juryNames,
      schoolName: memInfo.school_name,
    }).catch((e) => console.error("[sendConvocationEmail]", e));

    // Send email to external jury members
    for (const m of (jury ?? [])) {
      if (m.email_externe) {
        sendConvocationEmail({
          to: m.email_externe,
          studentName: memInfo.student_name,
          titre: memInfo.titre,
          dateSoutenance: date_soutenance,
          heureDebut: heure_debut,
          salle: salle ?? "Non précisée",
          dureeMinutes: duree_minutes ?? 60,
          jury: juryNames,
          schoolName: memInfo.school_name,
          isJuryMember: true,
          juryRole: m.role,
        }).catch((e) => console.error("[sendConvocationEmail jury]", e));
      }
    }

    res.json({ ok: true, soutenanceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Ensure UNIQUE constraint on soutenances.memoire_id
// (handled in migration)

// ─── Admin: record result after defense (PLANIFIE → SOUTENU) ─────────────────
router.post("/admin/memoires/:id/note", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const id = parseInt(req.params.id);
    const { note, mention, observations } = req.body as {
      note?: number; mention?: string; observations?: string;
    };

    const { rows: [m] } = await pool.query(
      `UPDATE memoires
       SET note=$1, mention=$2, observations=$3, statut='SOUTENU', updated_at=NOW()
       WHERE id=$4 AND tenant_id=$5
       RETURNING student_id, titre`,
      [note ?? null, mention ?? null, observations ?? null, id, tenantId]
    );

    if (m) {
      const mentionLabel: Record<string, string> = {
        EXCELLENT: "Excellent", TRES_BIEN: "Très Bien", BIEN: "Bien",
        ASSEZ_BIEN: "Assez Bien", PASSABLE: "Passable",
      };
      const mentionText = mention ? ` — Mention : ${mentionLabel[mention] ?? mention}` : "";
      const noteText = note != null ? ` · ${Number(note).toFixed(2)}/20` : "";
      sendPushToUser(m.student_id, {
        title: "🎓 Résultat de soutenance disponible",
        body: `Félicitations ! Votre soutenance « ${m.titre} » a été enregistrée.${mentionText}${noteText}`,
        url: "/student/memoires",
        tag: `memoire-${id}-soutenu`,
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: delete a jury member ─────────────────────────────────────────────
router.delete("/admin/memoires/:id/jury/:membreId", requireRole("admin"), async (req, res) => {
  try {
    const membreId = parseInt(req.params.membreId);
    await pool.query(`DELETE FROM jury_membres WHERE id = $1`, [membreId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: list teachers (for jury member picker) ────────────────────────────
// ─── Admin: export all scheduled soutenances with jury ────────────────────────
router.get("/admin/soutenances-programmees", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { rows } = await pool.query(
      `SELECT m.id, m.titre, m.filiere, m.annee_academique, m.statut, m.resume,
              u.name AS student_name,
              sp.class_name,
              s.date_soutenance, s.heure_debut, s.duree_minutes, s.salle,
              COALESCE(
                json_agg(
                  json_build_object(
                    'nom',  COALESCE(u2.name, jm.nom_externe),
                    'role', jm.role
                  ) ORDER BY CASE jm.role WHEN 'PRESIDENT' THEN 1 WHEN 'RAPPORTEUR' THEN 2 ELSE 3 END
                ) FILTER (WHERE jm.id IS NOT NULL),
                '[]'::json
              ) AS jury
       FROM memoires m
       JOIN users u ON u.id = m.student_id
       LEFT JOIN (
         SELECT DISTINCT ON (ce.student_id) ce.student_id, c.name AS class_name
         FROM class_enrollments ce JOIN classes c ON c.id = ce.class_id
         ORDER BY ce.student_id, ce.enrolled_at DESC
       ) sp ON sp.student_id = m.student_id
       JOIN soutenances s ON s.memoire_id = m.id
       LEFT JOIN jury_membres jm ON jm.soutenance_id = s.id
       LEFT JOIN users u2 ON u2.id = jm.user_id
       WHERE m.tenant_id = $1 AND m.statut IN ('PLANIFIE', 'SOUTENU')
       GROUP BY m.id, u.name, sp.class_name,
                s.date_soutenance, s.heure_debut, s.duree_minutes, s.salle
       ORDER BY s.date_soutenance, s.heure_debut`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/admin/memoires-teachers", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { rows } = await pool.query(
      `SELECT id, name, email FROM users
       WHERE tenant_id = $1 AND role = 'teacher'
       ORDER BY name`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
