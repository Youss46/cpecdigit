import { pool } from "@workspace/db";

export async function ensureMessagesStatusSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMP
    `);
    console.log("✓ Schéma Statuts Messages (received_at) prêt.");
  } catch (err) {
    console.error("Erreur migration messages status:", err);
  } finally {
    client.release();
  }
}
