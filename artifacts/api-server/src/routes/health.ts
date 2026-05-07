import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Diagnostic — checks key DB tables exist (non-blocking, no auth needed)
router.get("/healthz/detail", async (_req, res) => {
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users','webauthn_credentials','devoirs','memoires')
        ORDER BY table_name
      `);
      const tables = rows.map((r: any) => r.table_name);
      res.json({
        status: "ok",
        tables,
        webauthn_ready: tables.includes("webauthn_credentials"),
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err?.message });
  }
});

export default router;
