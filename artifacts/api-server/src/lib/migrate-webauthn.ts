import { pool } from "@workspace/db";

export async function ensureWebAuthnSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id  TEXT NOT NULL UNIQUE,
        public_key     TEXT NOT NULL,
        counter        BIGINT NOT NULL DEFAULT 0,
        device_type    TEXT NOT NULL DEFAULT 'singleDevice',
        device_name    TEXT NOT NULL DEFAULT 'Appareil inconnu',
        aaguid         TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at   TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id
        ON webauthn_credentials(user_id)
    `);

    console.log("✓ Schéma WebAuthn (connexion biométrique) prêt.");
  } catch (err) {
    console.error("ensureWebAuthnSchema:", err);
    throw err;
  } finally {
    client.release();
  }
}
