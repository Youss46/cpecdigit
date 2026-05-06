import { pool } from "@workspace/db";

export async function ensureMemoiresSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── Table principale des mémoires/rapports ─────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS memoires (
        id               SERIAL PRIMARY KEY,
        tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        student_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        titre            VARCHAR(500) NOT NULL,
        resume           TEXT,
        filiere          VARCHAR(200),
        annee_academique VARCHAR(20) NOT NULL,
        fichier_path     VARCHAR(500),
        fichier_nom      VARCHAR(300),
        statut           VARCHAR(20) NOT NULL DEFAULT 'SOUMIS',
        mention          VARCHAR(30),
        note             DECIMAL(4,2),
        observations     TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Table des soutenances (planification) ──────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS soutenances (
        id               SERIAL PRIMARY KEY,
        tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        memoire_id       INTEGER NOT NULL UNIQUE REFERENCES memoires(id) ON DELETE CASCADE,
        date_soutenance  DATE NOT NULL,
        heure_debut      VARCHAR(5) NOT NULL,
        duree_minutes    INTEGER DEFAULT 60,
        salle            VARCHAR(200),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Table des membres du jury ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS jury_membres (
        id              SERIAL PRIMARY KEY,
        soutenance_id   INTEGER NOT NULL REFERENCES soutenances(id) ON DELETE CASCADE,
        tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
        nom_externe     VARCHAR(300),
        email_externe   VARCHAR(300),
        role            VARCHAR(30) NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log("✓ Schéma Mémoires & Soutenances prêt.");
  } catch (err) {
    console.error("Erreur lors de la création des tables mémoires :", err);
  } finally {
    client.release();
  }
}
