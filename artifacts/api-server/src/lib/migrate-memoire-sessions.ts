import { pool } from "@workspace/db";

export async function ensureMemoireSessionsSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    // Use PL/pgSQL to handle the case where the sequence already exists
    // (can happen if a previous partial run created the sequence but not the table)
    await client.query(`
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS memoire_sessions (
          id               SERIAL PRIMARY KEY,
          tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          titre            VARCHAR(300),
          date_ouverture   TIMESTAMPTZ NOT NULL,
          date_cloture     TIMESTAMPTZ NOT NULL,
          statut           VARCHAR(30) NOT NULL DEFAULT 'OUVERTE',
          max_soumissions  INTEGER NOT NULL DEFAULT 1,
          class_ids        INTEGER[] NOT NULL DEFAULT '{}',
          created_by       INTEGER REFERENCES users(id),
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memoire_sessions_tenant
        ON memoire_sessions(tenant_id)
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS memoire_session_reminders_log (
          id            SERIAL PRIMARY KEY,
          session_id    INTEGER NOT NULL REFERENCES memoire_sessions(id) ON DELETE CASCADE,
          student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reminder_type VARCHAR(20) NOT NULL,
          sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(session_id, student_id, reminder_type)
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("✓ Schéma Périodes de Soumission de Mémoires prêt.");
  } catch (err) {
    console.error("ensureMemoireSessionsSchema:", err);
    throw err;
  } finally {
    client.release();
  }
}
