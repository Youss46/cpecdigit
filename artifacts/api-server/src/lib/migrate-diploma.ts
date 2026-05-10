import { pool } from "@workspace/db";

export async function ensureDiplomaSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS student_status VARCHAR(30) DEFAULT 'actif';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS diploma_attestations (
          id               SERIAL PRIMARY KEY,
          tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          student_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          class_id         INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          academic_year    VARCHAR(9) NOT NULL,
          token            VARCHAR(128) NOT NULL UNIQUE,
          mention          VARCHAR(50),
          average          DECIMAL(5,2),
          class_name       VARCHAR(255),
          student_name     VARCHAR(255),
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          invalidated_at   TIMESTAMPTZ
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_diploma_attestations_student
        ON diploma_attestations(student_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_diploma_attestations_token
        ON diploma_attestations(token)
    `);

    console.log("✓ Schéma Diplômes & Attestations prêt.");
  } catch (err) {
    console.error("ensureDiplomaSchema:", err);
    throw err;
  } finally {
    client.release();
  }
}
