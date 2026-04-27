import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import fs from "fs/promises";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Idempotent migration runner.
 *
 * Drizzle's built-in migrate() uses plain CREATE TYPE / CREATE TABLE which
 * crash when objects already exist (e.g. after a partial deploy on Railway).
 * This runner:
 *   1. Splits the SQL on Drizzle's "--> statement-breakpoint" markers.
 *   2. Wraps every CREATE TYPE in a DO-block that swallows "duplicate_object".
 *   3. Turns every CREATE TABLE into CREATE TABLE IF NOT EXISTS.
 *   4. Tracks applied migrations in __drizzle_migrations (Drizzle's own table)
 *      so re-running is safe.
 */
export async function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "dist/drizzle");
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id        SERIAL PRIMARY KEY,
        hash      TEXT    NOT NULL,
        created_at BIGINT
      );
    `);

    let journal: { entries: { tag: string; when: number }[] };
    try {
      const raw = await fs.readFile(
        path.join(migrationsFolder, "meta/_journal.json"),
        "utf-8",
      );
      journal = JSON.parse(raw);
    } catch {
      console.warn("No migration journal found — skipping migrations.");
      return;
    }

    for (const entry of journal.entries) {
      const tag = entry.tag;

      const { rows } = await client.query(
        `SELECT id FROM "__drizzle_migrations" WHERE hash = $1`,
        [tag],
      );
      if (rows.length > 0) {
        console.log(`  ↩ Migration "${tag}" déjà appliquée, ignorée.`);
        continue;
      }

      let sql: string;
      try {
        sql = await fs.readFile(
          path.join(migrationsFolder, `${tag}.sql`),
          "utf-8",
        );
      } catch {
        console.warn(`  ⚠ Fichier SQL introuvable pour "${tag}", ignoré.`);
        continue;
      }

      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      await client.query("BEGIN");
      try {
        for (const stmt of statements) {
          let query = stmt;

          if (/^CREATE TYPE/i.test(stmt)) {
            const bare = stmt.replace(/;+$/, "");
            query = `DO $$ BEGIN\n  ${bare};\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`;
          } else if (/^CREATE TABLE(?!\s+IF NOT EXISTS)/i.test(stmt)) {
            query = stmt.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
          } else if (/^CREATE UNIQUE INDEX(?!\s+IF NOT EXISTS)/i.test(stmt)) {
            query = stmt.replace(
              /^CREATE UNIQUE INDEX\s+/i,
              "CREATE UNIQUE INDEX IF NOT EXISTS ",
            );
          } else if (/^CREATE INDEX(?!\s+IF NOT EXISTS)/i.test(stmt)) {
            query = stmt.replace(
              /^CREATE INDEX\s+/i,
              "CREATE INDEX IF NOT EXISTS ",
            );
          }

          await client.query(query);
        }

        await client.query(
          `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
          [tag, Date.now()],
        );
        await client.query("COMMIT");
        console.log(`  ✓ Migration "${tag}" appliquée.`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ Échec de la migration "${tag}" :`, err);
        throw err;
      }
    }

    console.log("✓ Toutes les migrations sont à jour.");
  } finally {
    client.release();
  }
}

export * from "./schema";
