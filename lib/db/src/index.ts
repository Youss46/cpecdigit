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
 * Executes each SQL statement individually (no transaction wrapping) and
 * silently ignores PostgreSQL "already exists" errors:
 *   42710 — duplicate_object  (CREATE TYPE, ADD CONSTRAINT)
 *   42P07 — duplicate_table   (CREATE TABLE, CREATE INDEX)
 *   42701 — duplicate_column  (ALTER TABLE ADD COLUMN)
 *
 * This means re-running against a database that was partially migrated is
 * always safe — objects that already exist are skipped, new ones are created.
 */

// PostgreSQL error codes that mean "this object already exists — skip it."
const ALREADY_EXISTS = new Set(["42710", "42P07", "42701"]);

export async function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "dist/drizzle");
  const client = await pool.connect();

  try {
    // Ensure the migrations tracking table exists.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id         SERIAL PRIMARY KEY,
        hash       TEXT   NOT NULL,
        created_at BIGINT
      )
    `);

    // Read the Drizzle journal to know which SQL files to apply and in what order.
    let journal: { entries: { tag: string }[] };
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

      // Skip migrations that have already been applied.
      const { rows } = await client.query(
        `SELECT id FROM "__drizzle_migrations" WHERE hash = $1`,
        [tag],
      );
      if (rows.length > 0) {
        console.log(`  ↩  "${tag}" already applied — skipping.`);
        continue;
      }

      // Load the SQL file for this migration.
      let sql: string;
      try {
        sql = await fs.readFile(
          path.join(migrationsFolder, `${tag}.sql`),
          "utf-8",
        );
      } catch {
        console.warn(`  ⚠  SQL file not found for "${tag}" — skipping.`);
        continue;
      }

      // Split on Drizzle's statement-breakpoint markers and strip whitespace.
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim().replace(/;+$/, "")) // strip trailing semicolons
        .filter(Boolean);

      console.log(`  Running migration "${tag}" (${statements.length} statements)…`);

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        try {
          await client.query(stmt);
        } catch (err: any) {
          if (ALREADY_EXISTS.has(err.code)) {
            // Object already exists from a previous partial run — safe to skip.
            console.log(`    [${i + 1}] skipped (already exists): ${stmt.slice(0, 72)}…`);
          } else {
            // Real error — report it with context and abort.
            console.error(`    [${i + 1}] FAILED: ${stmt.slice(0, 200)}`);
            console.error(`    PostgreSQL error ${err.code}: ${err.message}`);
            throw err;
          }
        }
      }

      // Mark this migration as applied only after all statements succeed.
      await client.query(
        `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [tag, Date.now()],
      );
      console.log(`  ✓  Migration "${tag}" applied.`);
    }

    console.log("✓ All migrations are up to date.");
  } finally {
    client.release();
  }
}

export * from "./schema";
