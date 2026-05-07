import { pool } from "@workspace/db";

export async function ensureDevoirsSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS devoirs (
        id            SERIAL PRIMARY KEY,
        tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        matiere_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        enseignant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        titre         VARCHAR(255) NOT NULL,
        description   TEXT,
        duree_minutes INTEGER NOT NULL DEFAULT 60,
        date_debut    TIMESTAMPTZ NOT NULL,
        date_fin      TIMESTAMPTZ NOT NULL,
        nb_tentatives INTEGER NOT NULL DEFAULT 1,
        note_sur      REAL NOT NULL DEFAULT 20,
        type_devoir   VARCHAR(30) NOT NULL DEFAULT 'exercice',
        options_antitiche JSONB NOT NULL DEFAULT '{}',
        statut        VARCHAR(20) NOT NULL DEFAULT 'brouillon',
        cree_le       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devoir_classes (
        id        SERIAL PRIMARY KEY,
        devoir_id INTEGER NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
        classe_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devoir_questions (
        id                  SERIAL PRIMARY KEY,
        devoir_id           INTEGER NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
        texte               TEXT NOT NULL,
        type                VARCHAR(30) NOT NULL,
        points              REAL NOT NULL DEFAULT 1,
        ordre               INTEGER NOT NULL DEFAULT 0,
        explication         TEXT,
        valeur_numerique    REAL,
        tolerance_numerique REAL DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devoir_reponses_possibles (
        id           SERIAL PRIMARY KEY,
        question_id  INTEGER NOT NULL REFERENCES devoir_questions(id) ON DELETE CASCADE,
        texte        TEXT NOT NULL,
        est_correcte BOOLEAN NOT NULL DEFAULT FALSE,
        ordre        INTEGER NOT NULL DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devoir_sessions (
        id               SERIAL PRIMARY KEY,
        devoir_id        INTEGER NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
        etudiant_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        debut_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fin_prevue       TIMESTAMPTZ NOT NULL,
        statut           VARCHAR(30) NOT NULL DEFAULT 'en_cours',
        ordre_questions  JSONB NOT NULL DEFAULT '[]',
        soumis_le        TIMESTAMPTZ,
        nb_incidents     INTEGER NOT NULL DEFAULT 0,
        tentative_numero INTEGER NOT NULL DEFAULT 1,
        ip_address       VARCHAR(45),
        user_agent       TEXT,
        watermark_actif  BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    await client.query(`ALTER TABLE devoir_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)`);
    await client.query(`ALTER TABLE devoir_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT`);
    await client.query(`ALTER TABLE devoir_sessions ADD COLUMN IF NOT EXISTS watermark_actif BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE devoir_sessions ADD COLUMN IF NOT EXISTS motif_annulation TEXT`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devoir_reponses_etudiants (
        id                SERIAL PRIMARY KEY,
        session_id        INTEGER NOT NULL REFERENCES devoir_sessions(id) ON DELETE CASCADE,
        question_id       INTEGER NOT NULL REFERENCES devoir_questions(id) ON DELETE CASCADE,
        reponse_ids       JSONB NOT NULL DEFAULT '[]',
        reponse_texte     TEXT,
        reponse_numerique REAL,
        est_correcte      BOOLEAN,
        points_obtenus    REAL,
        sauvegarde_le     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devoir_incidents (
        id                SERIAL PRIMARY KEY,
        session_id        INTEGER NOT NULL REFERENCES devoir_sessions(id) ON DELETE CASCADE,
        type              VARCHAR(50) NOT NULL,
        occurree_le       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        duree_secondes    INTEGER,
        question_en_cours INTEGER,
        details           TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devoir_resultats (
        id                 SERIAL PRIMARY KEY,
        session_id         INTEGER NOT NULL REFERENCES devoir_sessions(id) ON DELETE CASCADE,
        etudiant_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score_brut         REAL NOT NULL DEFAULT 0,
        score_possible     REAL NOT NULL DEFAULT 0,
        note_sur_20        REAL NOT NULL DEFAULT 0,
        statut             VARCHAR(30) NOT NULL DEFAULT 'corrige',
        details_correction JSONB NOT NULL DEFAULT '[]',
        corrige_le         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Colonnes de traçabilité sur la table grades
    await client.query(`ALTER TABLE grades ADD COLUMN IF NOT EXISTS source VARCHAR(30)`);
    await client.query(`ALTER TABLE grades ADD COLUMN IF NOT EXISTS devoir_id INTEGER`);

    // ── Géolocalisation présences ──────────────────────────────────────────
    // Coordonnées GPS de l'établissement sur la table tenants
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rayon_metres INTEGER DEFAULT 200`);

    // Données GPS sur les feuilles de présence
    await client.query(`ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8)`);
    await client.query(`ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)`);
    await client.query(`ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS precision_metres INTEGER`);
    await client.query(`ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS distance_etablissement INTEGER`);
    await client.query(`ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS localisation_validee BOOLEAN DEFAULT false`);

    // Table des tentatives de soumission hors zone
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_location_incidents (
        id               SERIAL PRIMARY KEY,
        teacher_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        subject_id       INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
        class_id         INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        session_date     DATE,
        latitude         DECIMAL(10, 8),
        longitude        DECIMAL(11, 8),
        distance_metres  INTEGER,
        precision_metres INTEGER,
        type             VARCHAR(50) DEFAULT 'SOUMISSION_HORS_ZONE',
        tenant_id        INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log("✓ Schéma Devoirs & Évaluations prêt.");
  } catch (err) {
    console.error("Erreur lors de la création des tables devoirs :", err);
  } finally {
    client.release();
  }
}
