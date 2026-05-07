import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  usersTable,
  notificationsTable,
  classEnrollmentsTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser } from "./push.js";

// ─── Synchronisation notes devoir → table grades ────────────────────────────
async function synchroniserNotesDevoir(devoirId: number) {
  try {
    const devoir = await getDevoir(devoirId);
    if (!devoir || devoir.type_devoir !== "note_officiel") return;

    const { rows: classes } = await pool.query(
      `SELECT classe_id FROM devoir_classes WHERE devoir_id = $1`,
      [devoirId]
    );

    for (const cls of classes) {
      const classeId = cls.classe_id;

      // Trouver le semestre via les affectations enseignant
      const { rows: aff } = await pool.query(
        `SELECT semester_id FROM teacher_assignments
         WHERE teacher_id = $1 AND subject_id = $2 AND class_id = $3
         LIMIT 1`,
        [devoir.enseignant_id, devoir.matiere_id, classeId]
      );
      if (!aff.length) continue;
      const semesterId = aff[0].semester_id;

      // Résultats des étudiants inscrits dans cette classe pour ce devoir
      const { rows: resultats } = await pool.query(
        `SELECT DISTINCT ON (dr.etudiant_id) dr.etudiant_id, dr.note_sur_20
         FROM devoir_resultats dr
         JOIN devoir_sessions ds ON ds.id = dr.session_id
         JOIN class_enrollments ce ON ce.student_id = dr.etudiant_id AND ce.class_id = $1
         WHERE ds.devoir_id = $2 AND ds.statut IN ('soumis', 'expire', 'tricherie')
         ORDER BY dr.etudiant_id, ds.soumis_le DESC`,
        [classeId, devoirId]
      );

      for (const r of resultats) {
        const etudiantId = r.etudiant_id;
        const note = Math.round(r.note_sur_20 * 100) / 100;

        // Vérifier si une note existe déjà pour ce devoir
        const { rows: existing } = await pool.query(
          `SELECT id, evaluation_number FROM grades
           WHERE student_id = $1 AND subject_id = $2 AND semester_id = $3 AND devoir_id = $4`,
          [etudiantId, devoir.matiere_id, semesterId, devoirId]
        );

        if (existing.length > 0) {
          await pool.query(
            `UPDATE grades SET value = $1, source = 'devoir_en_ligne', updated_at = NOW() WHERE id = $2`,
            [note, existing[0].id]
          );
        } else {
          // Trouver le premier slot vraiment vide (1-4) sans toucher aux slots déjà occupés
          const { rows: usedSlots } = await pool.query(
            `SELECT evaluation_number FROM grades
             WHERE student_id = $1 AND subject_id = $2 AND semester_id = $3`,
            [etudiantId, devoir.matiere_id, semesterId]
          );
          const used = new Set(usedSlots.map((s: any) => s.evaluation_number as number));

          let evalNum: number | null = null;
          for (let n = 1; n <= 4; n++) {
            if (!used.has(n)) { evalNum = n; break; }
          }

          // Tous les slots sont occupés : ne rien écraser
          if (evalNum === null) continue;

          // Insertion stricte — n'écrase jamais une note existante
          await pool.query(
            `INSERT INTO grades (student_id, subject_id, semester_id, evaluation_number, value, source, devoir_id)
             VALUES ($1, $2, $3, $4, $5, 'devoir_en_ligne', $6)
             ON CONFLICT (student_id, subject_id, semester_id, evaluation_number)
             DO NOTHING`,
            [etudiantId, devoir.matiere_id, semesterId, evalNum, note, devoirId]
          );
        }
      }
    }

    // Notifier l'enseignant
    await db.insert(notificationsTable).values({
      userId: devoir.enseignant_id,
      type: "notes_prefilled",
      title: "✅ Notes pré-remplies automatiquement",
      message: `Les notes du devoir « ${devoir.titre} » ont été importées dans Saisie des Notes. Vérifiez et soumettez officiellement.`,
    });
  } catch (err) {
    console.error("synchroniserNotesDevoir:", err);
  }
}

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getDevoir(id: number) {
  const rows = await pool.query(
    `SELECT d.*, array_agg(DISTINCT dc.classe_id) FILTER (WHERE dc.classe_id IS NOT NULL) AS classe_ids
     FROM devoirs d
     LEFT JOIN devoir_classes dc ON dc.devoir_id = d.id
     WHERE d.id = $1
     GROUP BY d.id`,
    [id]
  );
  return rows.rows[0] ?? null;
}

async function getDevoirQuestions(devoirId: number) {
  const q = await pool.query(
    `SELECT * FROM devoir_questions WHERE devoir_id = $1 ORDER BY ordre ASC`,
    [devoirId]
  );
  const questions = q.rows;
  for (const question of questions) {
    const r = await pool.query(
      `SELECT * FROM devoir_reponses_possibles WHERE question_id = $1 ORDER BY ordre ASC`,
      [question.id]
    );
    question.reponses = r.rows;
  }
  return questions;
}

async function correcterSession(sessionId: number, devoirId: number) {
  const { rows: reponses } = await pool.query(
    `SELECT dre.*, dq.type, dq.points, dq.valeur_numerique, dq.tolerance_numerique
     FROM devoir_reponses_etudiants dre
     JOIN devoir_questions dq ON dq.id = dre.question_id
     WHERE dre.session_id = $1`,
    [sessionId]
  );

  let scoreBrut = 0;
  let scorePossible = 0;
  const details: any[] = [];

  for (const rep of reponses) {
    scorePossible += rep.points;
    let estCorrecte = false;
    let pointsObtenus = 0;

    if (rep.type === "texte_libre") {
      estCorrecte = null as any;
      pointsObtenus = 0;
    } else if (rep.type === "numerique") {
      const val = rep.reponse_numerique;
      const expected = rep.valeur_numerique;
      const tol = rep.tolerance_numerique ?? 0;
      estCorrecte = val !== null && Math.abs(val - expected) <= tol;
      pointsObtenus = estCorrecte ? rep.points : 0;
    } else {
      const { rows: bonnesReponses } = await pool.query(
        `SELECT id FROM devoir_reponses_possibles WHERE question_id = $1 AND est_correcte = TRUE`,
        [rep.question_id]
      );
      const expectedIds = new Set(bonnesReponses.map((r: any) => r.id));
      const givenIds: number[] = rep.reponse_ids ?? [];

      if (rep.type === "qcm" || rep.type === "vrai_faux") {
        estCorrecte = givenIds.length === 1 && expectedIds.has(givenIds[0]);
      } else if (rep.type === "qcm_multiple") {
        estCorrecte =
          givenIds.length === expectedIds.size &&
          givenIds.every((id: number) => expectedIds.has(id));
      } else if (rep.type === "ordre" || rep.type === "correspondance") {
        const expectedOrdered = [...expectedIds].sort((a, b) => a - b);
        estCorrecte =
          givenIds.length === expectedOrdered.length &&
          givenIds.every((id: number, i: number) => id === expectedOrdered[i]);
      } else {
        estCorrecte = givenIds.length > 0 && givenIds.every((id: number) => expectedIds.has(id));
      }
      pointsObtenus = estCorrecte ? rep.points : 0;
    }

    scoreBrut += pointsObtenus ?? 0;
    await pool.query(
      `UPDATE devoir_reponses_etudiants SET est_correcte = $1, points_obtenus = $2 WHERE id = $3`,
      [estCorrecte, pointsObtenus, rep.id]
    );
    details.push({ questionId: rep.question_id, estCorrecte, pointsObtenus, points: rep.points });
  }

  const devoir = await getDevoir(devoirId);
  const noteSur20 = scorePossible > 0 ? (scoreBrut / scorePossible) * (devoir?.note_sur ?? 20) : 0;

  const hasFreeText = reponses.some((r: any) => r.type === "texte_libre");
  const statut = hasFreeText ? "partiel" : "corrige";

  await pool.query(
    `INSERT INTO devoir_resultats (session_id, etudiant_id, score_brut, score_possible, note_sur_20, statut, details_correction)
     SELECT $1, etudiant_id, $2, $3, $4, $5, $6 FROM devoir_sessions WHERE id = $1
     ON CONFLICT DO NOTHING`,
    [sessionId, scoreBrut, scorePossible, Math.round(noteSur20 * 100) / 100, statut, JSON.stringify(details)]
  );

  return { scoreBrut, scorePossible, noteSur20, statut, details };
}

// ─── TEACHER routes ──────────────────────────────────────────────────────────

// POST /api/devoirs — créer un devoir
router.post("/", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const enseignantId = req.session!.userId!;
    const tenantId = req.session!.tenantId!;
    const {
      titre, description, matiereId, classeIds, typeDevoir,
      dureeMinutes, dateDebut, dateFin, nbTentatives, noteSur,
      optionsAntitiche, questions,
    } = req.body;

    if (!titre || !matiereId || !classeIds?.length || !dateDebut || !dateFin || !questions?.length) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Vérifier que l'enseignant est affecté à cette matière pour chaque classe sélectionnée
    if (req.session!.role !== "admin") {
      const { rows: affectations } = await pool.query(
        `SELECT class_id FROM teacher_assignments WHERE teacher_id = $1 AND subject_id = $2 AND class_id = ANY($3)`,
        [enseignantId, matiereId, classeIds]
      );
      const classesAutorisees = affectations.map((a: any) => a.class_id);
      const classesNonAutorisees = (classeIds as number[]).filter(id => !classesAutorisees.includes(id));
      if (classesNonAutorisees.length > 0) {
        return res.status(403).json({
          error: `Vous n'êtes pas affecté à cette matière pour ${classesNonAutorisees.length} classe(s) sélectionnée(s).`,
        });
      }
    }

    const dRes = await pool.query(
      `INSERT INTO devoirs (tenant_id, matiere_id, enseignant_id, titre, description, duree_minutes,
        date_debut, date_fin, nb_tentatives, note_sur, type_devoir, options_antitiche, statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'publie') RETURNING *`,
      [tenantId, matiereId, enseignantId, titre, description ?? null,
       dureeMinutes ?? 60, dateDebut, dateFin, nbTentatives ?? 1,
       noteSur ?? 20, typeDevoir ?? "exercice", JSON.stringify(optionsAntitiche ?? {})]
    );
    const devoir = dRes.rows[0];

    for (const classeId of classeIds) {
      await pool.query(
        `INSERT INTO devoir_classes (devoir_id, classe_id) VALUES ($1, $2)`,
        [devoir.id, classeId]
      );
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qRes = await pool.query(
        `INSERT INTO devoir_questions (devoir_id, texte, type, points, ordre, explication, valeur_numerique, tolerance_numerique)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [devoir.id, q.texte, q.type, q.points ?? 1, i,
         q.explication ?? null, q.valeurNumerique ?? null, q.toleranceNumerique ?? 0]
      );
      const qId = qRes.rows[0].id;

      if (q.reponses?.length) {
        for (let j = 0; j < q.reponses.length; j++) {
          const r = q.reponses[j];
          await pool.query(
            `INSERT INTO devoir_reponses_possibles (question_id, texte, est_correcte, ordre) VALUES ($1,$2,$3,$4)`,
            [qId, r.texte, r.estCorrecte ?? false, j]
          );
        }
      }
    }

    // Notifier les étudiants inscrits
    const { rows: students } = await pool.query(
      `SELECT DISTINCT ce.student_id FROM class_enrollments ce WHERE ce.class_id = ANY($1)`,
      [classeIds]
    );
    const now = new Date();
    const debut = new Date(dateDebut);
    const diffH = (debut.getTime() - now.getTime()) / 3600000;

    for (const s of students) {
      await db.insert(notificationsTable).values({
        userId: s.student_id,
        type: "devoir_nouveau",
        title: "Nouveau devoir disponible",
        message: `Le devoir « ${titre} » a été publié et commence le ${debut.toLocaleDateString("fr-FR")}.`,
      });
      if (diffH > 0 && diffH <= 24) {
        await sendPushToUser(s.student_id, {
          title: "Nouveau devoir",
          body: `« ${titre} » commence bientôt !`,
          url: "/student/devoirs",
        });
      }
    }

    res.json(devoir);
  } catch (err) {
    console.error("POST /devoirs:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/devoirs — liste des devoirs (teacher = ses devoirs, student = ses classes)
router.get("/", requireRole("teacher", "admin", "student"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const role = req.session!.role!;
    const tenantId = req.session!.tenantId!;

    let rows;

    if (role === "student") {
      const { rows: enrollments } = await pool.query(
        `SELECT class_id FROM class_enrollments WHERE student_id = $1`, [userId]
      );
      const classIds = enrollments.map((e: any) => e.class_id);
      if (!classIds.length) return res.json([]);

      const { rows: devoirs } = await pool.query(
        `SELECT DISTINCT d.*, u.name AS enseignant_nom, s.name AS matiere_nom,
                array_agg(DISTINCT dc.classe_id) AS classe_ids
         FROM devoirs d
         JOIN devoir_classes dc ON dc.devoir_id = d.id
         JOIN users u ON u.id = d.enseignant_id
         JOIN subjects s ON s.id = d.matiere_id
         WHERE dc.classe_id = ANY($1) AND d.tenant_id = $2 AND d.statut = 'publie'
         GROUP BY d.id, u.name, s.name
         ORDER BY d.date_debut DESC`,
        [classIds, tenantId]
      );

      for (const d of devoirs) {
        const { rows: sessions } = await pool.query(
          `SELECT * FROM devoir_sessions WHERE devoir_id = $1 AND etudiant_id = $2 ORDER BY tentative_numero DESC LIMIT 1`,
          [d.id, userId]
        );
        d.session = sessions[0] ?? null;
        if (d.session?.statut === "soumis" || d.session?.statut === "expire" || d.session?.statut === "tricherie") {
          const { rows: resultats } = await pool.query(
            `SELECT * FROM devoir_resultats WHERE session_id = $1 LIMIT 1`,
            [d.session.id]
          );
          d.resultat = resultats[0] ?? null;
        }
      }
      rows = devoirs;
    } else {
      const where = role === "admin" ? `d.tenant_id = $1` : `d.enseignant_id = $2 AND d.tenant_id = $1`;
      const params: any[] = role === "admin" ? [tenantId] : [tenantId, userId];

      const { rows: devoirs } = await pool.query(
        `SELECT d.*, u.name AS enseignant_nom, s.name AS matiere_nom,
                array_agg(DISTINCT dc.classe_id) AS classe_ids
         FROM devoirs d
         JOIN devoir_classes dc ON dc.devoir_id = d.id
         JOIN users u ON u.id = d.enseignant_id
         JOIN subjects s ON s.id = d.matiere_id
         WHERE ${where}
         GROUP BY d.id, u.name, s.name
         ORDER BY d.cree_le DESC`,
        params
      );

      for (const d of devoirs) {
        const { rows: stats } = await pool.query(
          `SELECT COUNT(*) FILTER (WHERE statut IN ('soumis','expire','tricherie')) AS soumis,
                  COUNT(*) AS total
           FROM devoir_sessions WHERE devoir_id = $1`,
          [d.id]
        );
        d.stats = stats[0];
      }
      rows = devoirs;
    }

    res.json(rows);
  } catch (err) {
    console.error("GET /devoirs:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/devoirs/:id — détail d'un devoir
router.get("/:id", requireRole("teacher", "admin", "student"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const devoir = await getDevoir(id);
    if (!devoir) return res.status(404).json({ error: "Devoir introuvable" });
    const questions = await getDevoirQuestions(id);
    res.json({ ...devoir, questions });
  } catch (err) {
    console.error("GET /devoirs/:id:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/devoirs/:id — supprimer (enseignant propriétaire)
router.delete("/:id", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.session!.userId!;
    const role = req.session!.role!;

    const devoir = await getDevoir(id);
    if (!devoir) return res.status(404).json({ error: "Devoir introuvable" });
    if (role !== "admin" && devoir.enseignant_id !== userId) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    await pool.query(`DELETE FROM devoirs WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /devoirs/:id:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/devoirs/:id — modifier un devoir (enseignant propriétaire)
router.put("/:id", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.session!.userId!;
    const role = req.session!.role!;

    const devoir = await getDevoir(id);
    if (!devoir) return res.status(404).json({ error: "Devoir introuvable" });
    if (role !== "admin" && devoir.enseignant_id !== userId) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const {
      titre, description, matiereId, classeIds, typeDevoir,
      dureeMinutes, dateDebut, dateFin, nbTentatives, noteSur,
      optionsAntitiche, questions,
    } = req.body;

    if (!titre || !dateDebut || !dateFin) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Vérifier si des sessions existent (non annulées)
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*) FROM devoir_sessions WHERE devoir_id = $1 AND statut != 'annule'`,
      [id]
    );
    const hasSessions = Number(count) > 0;

    // Mettre à jour les métadonnées (toujours autorisé)
    await pool.query(
      `UPDATE devoirs
       SET titre=$1, description=$2, duree_minutes=$3, date_debut=$4, date_fin=$5,
           nb_tentatives=$6, note_sur=$7, type_devoir=$8, options_antitiche=$9
       WHERE id=$10`,
      [titre, description ?? null, dureeMinutes ?? 60, dateDebut, dateFin,
       nbTentatives ?? 1, noteSur ?? 20, typeDevoir ?? "exercice",
       JSON.stringify(optionsAntitiche ?? {}), id]
    );

    // Mettre à jour classes + questions seulement si aucune session démarrée
    if (!hasSessions && questions?.length) {
      if (classeIds?.length) {
        if (role !== "admin") {
          const { rows: affectations } = await pool.query(
            `SELECT class_id FROM teacher_assignments WHERE teacher_id = $1 AND subject_id = $2 AND class_id = ANY($3)`,
            [userId, matiereId, classeIds]
          );
          const classesAutorisees = affectations.map((a: any) => a.class_id);
          const classesNonAutorisees = (classeIds as number[]).filter(id => !classesAutorisees.includes(id));
          if (classesNonAutorisees.length > 0) {
            return res.status(403).json({ error: `Vous n'êtes pas affecté à cette matière pour ${classesNonAutorisees.length} classe(s).` });
          }
        }
        await pool.query(`DELETE FROM devoir_classes WHERE devoir_id = $1`, [id]);
        for (const classeId of classeIds) {
          await pool.query(`INSERT INTO devoir_classes (devoir_id, classe_id) VALUES ($1, $2)`, [id, classeId]);
        }
      }

      await pool.query(`DELETE FROM devoir_questions WHERE devoir_id = $1`, [id]);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qRes = await pool.query(
          `INSERT INTO devoir_questions (devoir_id, texte, type, points, ordre, explication, valeur_numerique, tolerance_numerique)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [id, q.texte, q.type, q.points ?? 1, i,
           q.explication ?? null, q.valeurNumerique ?? null, q.toleranceNumerique ?? 0]
        );
        const qId = qRes.rows[0].id;
        if (q.reponses?.length) {
          for (let j = 0; j < q.reponses.length; j++) {
            const r = q.reponses[j];
            await pool.query(
              `INSERT INTO devoir_reponses_possibles (question_id, texte, est_correcte, ordre) VALUES ($1,$2,$3,$4)`,
              [qId, r.texte, r.estCorrecte ?? false, j]
            );
          }
        }
      }
    }

    res.json({ ok: true, hasSessions });
  } catch (err) {
    console.error("PUT /devoirs/:id:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PATCH /api/devoirs/:id/statut — ouvrir/clôturer
router.patch("/:id/statut", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { statut } = req.body;
    await pool.query(`UPDATE devoirs SET statut = $1 WHERE id = $2`, [statut, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /devoirs/:id/statut:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── STUDENT routes ──────────────────────────────────────────────────────────

// GET /api/devoirs/prefilled-notes — résumé des notes pré-remplies pour un teacher
router.get("/prefilled-notes", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, semesterId, classId } = req.query;

    const { rows } = await pool.query(
      `SELECT
         g.student_id   AS "studentId",
         g.evaluation_number AS "evalNumber",
         g.value,
         g.source,
         g.devoir_id    AS "devoirId",
         d.titre        AS "devoirTitre"
       FROM grades g
       LEFT JOIN devoirs d ON d.id = g.devoir_id
       JOIN class_enrollments ce ON ce.student_id = g.student_id AND ce.class_id = $3
       WHERE g.subject_id  = $1
         AND g.semester_id = $2
         AND g.source = 'devoir_en_ligne'
         AND (d.enseignant_id = $4 OR $4 IS NULL)`,
      [
        Number(subjectId), Number(semesterId), Number(classId),
        req.session!.role === "admin" ? null : teacherId,
      ]
    );

    // Distinct devoirs involved
    const devoirsMap = new Map<number, string>();
    for (const r of rows) {
      if (r.devoirId) devoirsMap.set(r.devoirId, r.devoirTitre ?? "");
    }
    const devoirs = [...devoirsMap.entries()].map(([id, titre]) => ({ id, titre }));

    res.json({ count: rows.length, devoirs, grades: rows });
  } catch (err) {
    console.error("GET /devoirs/prefilled-notes:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/devoirs/ip — retourner l'IP partiellement masquée pour le watermark
router.get("/ip", requireRole("student"), (req, res) => {
  const raw = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || req.ip || "";
  // Masquer les deux derniers octets IPv4 (192.168.1.42 → 192.168.x.x)
  const masked = raw.replace(/^(\d+\.\d+)\.\d+\.\d+$/, "$1.x.x")
                     .replace(/^(::ffff:)(\d+\.\d+)\.\d+\.\d+$/, "$1$2.x.x");
  res.json({ ip: masked || "x.x.x.x" });
});

// POST /api/devoirs/:id/demarrer — démarrer une session
router.post("/:id/demarrer", requireRole("student"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const etudiantId = req.session!.userId!;

    const devoir = await getDevoir(devoirId);
    if (!devoir) return res.status(404).json({ error: "Devoir introuvable" });

    const now = new Date();
    if (now < new Date(devoir.date_debut)) {
      return res.status(403).json({ error: "Le devoir n'a pas encore commencé" });
    }
    if (now > new Date(devoir.date_fin)) {
      return res.status(403).json({ error: "Le délai du devoir est dépassé" });
    }

    // Vérifier tentatives
    const { rows: sessions } = await pool.query(
      `SELECT * FROM devoir_sessions WHERE devoir_id = $1 AND etudiant_id = $2 ORDER BY tentative_numero DESC`,
      [devoirId, etudiantId]
    );

    const activeSessions = sessions.filter((s: any) => s.statut === "en_cours");
    if (activeSessions.length > 0) {
      // Session déjà en cours — la retourner
      const s = activeSessions[0];
      const questions = await getDevoirQuestions(devoirId);
      const orderedIds: number[] = s.ordre_questions;
      const orderedQuestions = orderedIds
        .map(id => questions.find(q => q.id === id))
        .filter(Boolean);

      // Retourner sans les bonnes réponses
      const opts = devoir.options_antitiche as any;
      const questionsForStudent = orderedQuestions.map((q: any) => ({
        ...q,
        reponses: q.reponses?.map((r: any) => ({
          id: r.id, texte: r.texte, ordre: r.ordre,
        })),
        est_correcte: undefined,
        valeur_numerique: undefined,
        explication: undefined,
      }));

      // Réponses sauvegardées
      const { rows: savedReponses } = await pool.query(
        `SELECT * FROM devoir_reponses_etudiants WHERE session_id = $1`,
        [s.id]
      );

      return res.json({ session: s, questions: questionsForStudent, savedReponses });
    }

    const tentativeNumero = sessions.length + 1;
    if (tentativeNumero > devoir.nb_tentatives) {
      return res.status(403).json({ error: "Nombre maximum de tentatives atteint" });
    }

    // Générer ordre Fisher-Yates avec graine devoirId+etudiantId
    const questions = await getDevoirQuestions(devoirId);
    const seed = devoirId * 1000003 + etudiantId;
    const opts = devoir.options_antitiche as any;

    let orderedQuestions = [...questions];
    if (opts?.melangeQuestions) {
      orderedQuestions = seededShuffle(questions, seed);
    }

    const ordreIds = orderedQuestions.map((q: any) => q.id);
    const finPrevue = new Date(now.getTime() + devoir.duree_minutes * 60 * 1000);

    const rawIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || req.ip || "";
    const ua = req.headers["user-agent"] || "";

    const { rows: [session] } = await pool.query(
      `INSERT INTO devoir_sessions (devoir_id, etudiant_id, debut_le, fin_prevue, ordre_questions, tentative_numero, ip_address, user_agent, watermark_actif)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
      [devoirId, etudiantId, now, finPrevue, JSON.stringify(ordreIds), tentativeNumero, rawIp, ua]
    );

    // Mélange réponses si option active
    const questionsForStudent = orderedQuestions.map((q: any) => {
      let reponses = q.reponses ?? [];
      if (opts?.melangeReponses && reponses.length > 1) {
        reponses = seededShuffle(reponses, seed + q.id);
      }
      return {
        ...q,
        reponses: reponses.map((r: any) => ({ id: r.id, texte: r.texte, ordre: r.ordre })),
        est_correcte: undefined,
        valeur_numerique: undefined,
        explication: undefined,
      };
    });

    res.json({ session, questions: questionsForStudent, savedReponses: [] });
  } catch (err) {
    console.error("POST /devoirs/:id/demarrer:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/devoirs/:id/session — récupérer session en cours
router.get("/:id/session", requireRole("student"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const etudiantId = req.session!.userId!;

    const { rows: sessions } = await pool.query(
      `SELECT * FROM devoir_sessions WHERE devoir_id = $1 AND etudiant_id = $2 ORDER BY tentative_numero DESC LIMIT 1`,
      [devoirId, etudiantId]
    );
    if (!sessions.length) return res.json({ session: null });

    const session = sessions[0];
    const { rows: savedReponses } = await pool.query(
      `SELECT * FROM devoir_reponses_etudiants WHERE session_id = $1`,
      [session.id]
    );

    if (session.statut === "en_cours") {
      const questions = await getDevoirQuestions(devoirId);
      const devoir = await getDevoir(devoirId);
      const opts = (devoir?.options_antitiche ?? {}) as any;
      const ordreIds: number[] = session.ordre_questions;
      const orderedQuestions = ordreIds
        .map(id => questions.find((q: any) => q.id === id))
        .filter(Boolean)
        .map((q: any) => {
          let reponses = q.reponses ?? [];
          const seed = devoirId * 1000003 + etudiantId;
          if (opts?.melangeReponses && reponses.length > 1) {
            reponses = seededShuffle(reponses, seed + q.id);
          }
          return {
            ...q,
            reponses: reponses.map((r: any) => ({ id: r.id, texte: r.texte, ordre: r.ordre })),
            est_correcte: undefined,
            valeur_numerique: undefined,
            explication: undefined,
          };
        });

      return res.json({ session, questions: orderedQuestions, savedReponses });
    }

    res.json({ session, savedReponses });
  } catch (err) {
    console.error("GET /devoirs/:id/session:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/devoirs/:id/sauvegarder — auto-save
router.post("/:id/sauvegarder", requireRole("student"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const etudiantId = req.session!.userId!;
    const { sessionId, reponses } = req.body;

    const { rows: [session] } = await pool.query(
      `SELECT * FROM devoir_sessions WHERE id = $1 AND etudiant_id = $2 AND statut = 'en_cours'`,
      [sessionId, etudiantId]
    );
    if (!session) return res.status(404).json({ error: "Session introuvable ou déjà soumise" });

    for (const rep of (reponses ?? [])) {
      await pool.query(
        `INSERT INTO devoir_reponses_etudiants (session_id, question_id, reponse_ids, reponse_texte, reponse_numerique, sauvegarde_le)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (session_id, question_id)
         DO UPDATE SET reponse_ids = $3, reponse_texte = $4, reponse_numerique = $5, sauvegarde_le = NOW()`,
        [sessionId, rep.questionId, JSON.stringify(rep.reponseIds ?? []), rep.reponseTexte ?? null, rep.reponseNumerique ?? null]
      ).catch(async () => {
        // Si contrainte unique pas définie, faire un upsert manuel
        const { rows: existing } = await pool.query(
          `SELECT id FROM devoir_reponses_etudiants WHERE session_id = $1 AND question_id = $2`,
          [sessionId, rep.questionId]
        );
        if (existing.length > 0) {
          await pool.query(
            `UPDATE devoir_reponses_etudiants SET reponse_ids=$3, reponse_texte=$4, reponse_numerique=$5, sauvegarde_le=NOW()
             WHERE session_id=$1 AND question_id=$2`,
            [sessionId, rep.questionId, JSON.stringify(rep.reponseIds ?? []), rep.reponseTexte ?? null, rep.reponseNumerique ?? null]
          );
        } else {
          await pool.query(
            `INSERT INTO devoir_reponses_etudiants (session_id, question_id, reponse_ids, reponse_texte, reponse_numerique)
             VALUES ($1,$2,$3,$4,$5)`,
            [sessionId, rep.questionId, JSON.stringify(rep.reponseIds ?? []), rep.reponseTexte ?? null, rep.reponseNumerique ?? null]
          );
        }
      });
    }

    res.json({ ok: true, savedAt: new Date() });
  } catch (err) {
    console.error("POST /devoirs/:id/sauvegarder:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/devoirs/:id/soumettre — soumettre
router.post("/:id/soumettre", requireRole("student"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const etudiantId = req.session!.userId!;
    const { sessionId, reponses, forceStatut } = req.body;

    const { rows: [session] } = await pool.query(
      `SELECT * FROM devoir_sessions WHERE id = $1 AND etudiant_id = $2 AND statut = 'en_cours'`,
      [sessionId, etudiantId]
    );
    if (!session) return res.status(404).json({ error: "Session introuvable ou déjà soumise" });

    // Sauvegarder les dernières réponses
    for (const rep of (reponses ?? [])) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM devoir_reponses_etudiants WHERE session_id = $1 AND question_id = $2`,
        [sessionId, rep.questionId]
      );
      if (existing.length > 0) {
        await pool.query(
          `UPDATE devoir_reponses_etudiants SET reponse_ids=$3, reponse_texte=$4, reponse_numerique=$5 WHERE session_id=$1 AND question_id=$2`,
          [sessionId, rep.questionId, JSON.stringify(rep.reponseIds ?? []), rep.reponseTexte ?? null, rep.reponseNumerique ?? null]
        );
      } else {
        await pool.query(
          `INSERT INTO devoir_reponses_etudiants (session_id, question_id, reponse_ids, reponse_texte, reponse_numerique)
           VALUES ($1,$2,$3,$4,$5)`,
          [sessionId, rep.questionId, JSON.stringify(rep.reponseIds ?? []), rep.reponseTexte ?? null, rep.reponseNumerique ?? null]
        );
      }
    }

    const now = new Date();
    const finPrevue = new Date(session.fin_prevue);
    const enRetard = now > finPrevue;

    const statut = forceStatut === "TRICHERIE_DETECTEE"
      ? "tricherie"
      : enRetard ? "expire" : "soumis";

    await pool.query(
      `UPDATE devoir_sessions SET statut = $1, soumis_le = $2 WHERE id = $3`,
      [statut, now, sessionId]
    );

    const correction = await correcterSession(sessionId, devoirId);

    // Synchroniser automatiquement dans Saisie des Notes (si devoir noté officiel)
    synchroniserNotesDevoir(devoirId).catch(err => console.error("sync notes:", err));

    // Notifier l'enseignant si tricherie
    if (statut === "tricherie") {
      const devoir = await getDevoir(devoirId);
      if (devoir) {
        const { rows: [student] } = await pool.query(
          `SELECT name FROM users WHERE id = $1`, [etudiantId]
        );
        await db.insert(notificationsTable).values({
          userId: devoir.enseignant_id,
          type: "devoir_tricherie",
          title: "⚠️ Tricherie détectée",
          message: `${student?.name ?? "Un étudiant"} a déclenché le système anti-triche sur « ${devoir.titre} ».`,
        });
        await sendPushToUser(devoir.enseignant_id, {
          title: "Tricherie détectée",
          body: `${student?.name ?? "Étudiant"} — ${devoir.titre}`,
          url: `/teacher/devoirs/${devoirId}`,
        });
      }
    }

    res.json({ ok: true, statut, correction });
  } catch (err) {
    console.error("POST /devoirs/:id/soumettre:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/devoirs/:id/incidents — enregistrer un incident
router.post("/:id/incidents", requireRole("student"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const etudiantId = req.session!.userId!;
    const { sessionId, type, dureeSecondes, questionEnCours, details } = req.body;

    const { rows: [session] } = await pool.query(
      `SELECT * FROM devoir_sessions WHERE id = $1 AND etudiant_id = $2 AND statut = 'en_cours'`,
      [sessionId, etudiantId]
    );
    if (!session) return res.status(404).json({ error: "Session introuvable" });

    await pool.query(
      `INSERT INTO devoir_incidents (session_id, type, duree_secondes, question_en_cours, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [sessionId, type, dureeSecondes ?? null, questionEnCours ?? null, details ?? null]
    );

    const newCount = session.nb_incidents + 1;
    await pool.query(
      `UPDATE devoir_sessions SET nb_incidents = $1 WHERE id = $2`,
      [newCount, sessionId]
    );

    res.json({ ok: true, totalIncidents: newCount });
  } catch (err) {
    console.error("POST /devoirs/:id/incidents:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── TEACHER rapport ─────────────────────────────────────────────────────────

// GET /api/devoirs/:id/rapport — rapport de surveillance
router.get("/:id/rapport", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const devoir = await getDevoir(devoirId);
    if (!devoir) return res.status(404).json({ error: "Devoir introuvable" });

    const { rows: sessions } = await pool.query(
      `SELECT ds.*, u.name AS etudiant_nom,
              (SELECT COUNT(*) FROM devoir_incidents WHERE session_id = ds.id) AS nb_incidents_reel
       FROM devoir_sessions ds
       JOIN users u ON u.id = ds.etudiant_id
       WHERE ds.devoir_id = $1
       ORDER BY ds.debut_le DESC`,
      [devoirId]
    );

    for (const s of sessions) {
      const { rows: incidents } = await pool.query(
        `SELECT * FROM devoir_incidents WHERE session_id = $1 ORDER BY occurree_le ASC`,
        [s.id]
      );
      s.incidents = incidents;

      const { rows: resultats } = await pool.query(
        `SELECT * FROM devoir_resultats WHERE session_id = $1 LIMIT 1`,
        [s.id]
      );
      s.resultat = resultats[0] ?? null;
    }

    res.json({ devoir, sessions });
  } catch (err) {
    console.error("GET /devoirs/:id/rapport:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/devoirs/:id/resultats/:sessionId — résultats d'un étudiant
router.get("/:id/resultats/:sessionId", requireRole("student", "teacher", "admin"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const sessionId = Number(req.params.sessionId);
    const userId = req.session!.userId!;
    const role = req.session!.role!;

    const { rows: [session] } = await pool.query(
      `SELECT * FROM devoir_sessions WHERE id = $1 AND devoir_id = $2`,
      [sessionId, devoirId]
    );
    if (!session) return res.status(404).json({ error: "Session introuvable" });

    if (role === "student" && session.etudiant_id !== userId) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { rows: [resultat] } = await pool.query(
      `SELECT * FROM devoir_resultats WHERE session_id = $1`,
      [sessionId]
    );

    const questions = await getDevoirQuestions(devoirId);
    const { rows: reponses } = await pool.query(
      `SELECT * FROM devoir_reponses_etudiants WHERE session_id = $1`,
      [sessionId]
    );

    const questionsAvecReponses = questions.map((q: any) => {
      const rep = reponses.find((r: any) => r.question_id === q.id);
      return {
        ...q,
        reponseDonnee: rep ?? null,
      };
    });

    const devoir = await getDevoir(devoirId);
    res.json({ devoir, session, resultat, questions: questionsAvecReponses });
  } catch (err) {
    console.error("GET /devoirs/:id/resultats/:sessionId:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/devoirs/:id/sessions/:sessionId/annuler — annuler session (enseignant)
router.post("/:id/sessions/:sessionId/annuler", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const sessionId = Number(req.params.sessionId);
    const { motif } = req.body;

    if (!motif || !String(motif).trim()) {
      return res.status(400).json({ error: "Le motif d'annulation est obligatoire." });
    }

    // Récupérer l'étudiant lié à cette session avant annulation
    const { rows: [session] } = await pool.query(
      `SELECT etudiant_id FROM devoir_sessions WHERE id = $1`,
      [sessionId]
    );

    await pool.query(
      `UPDATE devoir_sessions SET statut = 'annule', motif_annulation = $1 WHERE id = $2`,
      [String(motif).trim(), sessionId]
    );
    await pool.query(`UPDATE devoir_resultats SET statut = 'annule' WHERE session_id = $1`, [sessionId]);

    // Resynchroniser la note dans grades pour cet étudiant
    if (session) {
      const etudiantId = session.etudiant_id;

      // Chercher d'autres sessions valides pour ce devoir et cet étudiant
      const { rows: autresResultats } = await pool.query(
        `SELECT dr.note_sur_20
         FROM devoir_resultats dr
         JOIN devoir_sessions ds ON ds.id = dr.session_id
         WHERE ds.devoir_id = $1
           AND ds.etudiant_id = $2
           AND ds.statut IN ('soumis', 'expire', 'tricherie')
         ORDER BY ds.soumis_le DESC
         LIMIT 1`,
        [devoirId, etudiantId]
      );

      if (autresResultats.length > 0) {
        // Mettre à jour la note avec la meilleure session restante
        const note = Math.round(autresResultats[0].note_sur_20 * 100) / 100;
        await pool.query(
          `UPDATE grades SET value = $1, updated_at = NOW()
           WHERE student_id = $2 AND devoir_id = $3 AND source = 'devoir_en_ligne'`,
          [note, etudiantId, devoirId]
        );
      } else {
        // Aucune session valide restante → supprimer la note de la saisie
        await pool.query(
          `DELETE FROM grades
           WHERE student_id = $1 AND devoir_id = $2 AND source = 'devoir_en_ligne'`,
          [etudiantId, devoirId]
        );
      }

      // Notifier l'étudiant
      const devoir = await getDevoir(devoirId);
      const titreDevoir = devoir?.titre ?? "un devoir";
      await db.insert(notificationsTable).values({
        userId: etudiantId,
        type: "devoir_annule",
        title: "Session de devoir annulée",
        message: `Votre session pour le devoir « ${titreDevoir} » a été annulée par votre enseignant. Motif : ${String(motif).trim()}`,
      });
      await sendPushToUser(etudiantId, {
        title: "Session annulée",
        body: `Devoir « ${titreDevoir} » — Motif : ${String(motif).trim()}`,
        url: "/student/devoirs",
        tag: `devoir-annule-${sessionId}`,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("POST annuler:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/devoirs/:id/sessions/:sessionId/retentative — accorder une nouvelle tentative
router.post("/:id/sessions/:sessionId/retentative", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const devoirId = Number(req.params.id);
    const sessionId = Number(req.params.sessionId);

    const { rows: [session] } = await pool.query(
      `SELECT * FROM devoir_sessions WHERE id = $1`, [sessionId]
    );
    if (!session) return res.status(404).json({ error: "Session introuvable" });

    const devoir = await getDevoir(devoirId);
    if (!devoir) return res.status(404).json({ error: "Devoir introuvable" });

    // Augmenter nb_tentatives du devoir de 1 pour cet étudiant via patch sur le devoir
    await pool.query(
      `UPDATE devoirs SET nb_tentatives = nb_tentatives + 1 WHERE id = $1`,
      [devoirId]
    );

    // Notifier l'étudiant
    await db.insert(notificationsTable).values({
      userId: session.etudiant_id,
      type: "devoir_retentative",
      title: "Nouvelle tentative accordée",
      message: `Votre enseignant vous accorde une nouvelle tentative pour le devoir « ${devoir.titre} ».`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("POST retentative:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
