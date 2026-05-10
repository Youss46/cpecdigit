import http from "http";
import crypto from "crypto";
import app from "./app";
import { initSocketIO } from "./lib/socket.js";
import { db, runMigrations } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db";
import { ensureDevoirsSchema } from "./lib/migrate-devoirs.js";
import { ensureMemoiresSchema } from "./lib/migrate-memoires.js";
import { ensureMemoireSessionsSchema } from "./lib/migrate-memoire-sessions.js";
import { ensureDiplomaSchema } from "./lib/migrate-diploma.js";
import { ensureWebAuthnSchema } from "./lib/migrate-webauthn.js";
import { eq } from "drizzle-orm";
import { startFeeReminderScheduler } from "./lib/fee-reminder-scheduler.js";
import { startRecommendationScheduler } from "./lib/recommendation-scheduler.js";
import { startLicenseExpiryScheduler } from "./lib/license-expiry-scheduler.js";
import { startMemoireSessionScheduler } from "./lib/memoire-session-scheduler.js";
import { startBackupScheduler } from "./lib/backup-scheduler.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedDefaultTenant(): Promise<number> {
  try {
    const existing = await db.select().from(tenantsTable)
      .where(eq(tenantsTable.subdomain, "cpec"))
      .limit(1);

    if (existing[0]) {
      return existing[0].id;
    }

    const [tenant] = await db.insert(tenantsTable).values({
      name: "CPEC-U INP-HB",
      subdomain: "cpec",
      country: "Côte d'Ivoire",
      contactEmail: "scolarite@cpec-u.ci",
      planType: "standard",
      active: true,
    }).returning();

    console.log("✓ Tenant par défaut créé : cpec (CPEC-U INP-HB)");
    return tenant.id;
  } catch (err) {
    console.error("Erreur lors du seeding du tenant :", err);
    return 1;
  }
}

async function seedInitialAdmin() {
  try {
    const tenantId = await seedDefaultTenant();

    const passwordHash = crypto
      .createHash("sha256")
      .update("password123" + "cpec-u-salt")
      .digest("hex");

    const inserted = await db.insert(usersTable).values({
      tenantId,
      email: "youss@gmail.com",
      name: "Youssouf Sawadogo",
      passwordHash,
      role: "admin",
      adminSubRole: "directeur",
      mustChangePassword: false,
    }).onConflictDoNothing();

    if (inserted.rowCount && inserted.rowCount > 0) {
      console.log("✓ Compte administrateur initial créé : youss@gmail.com");
    }
  } catch (err) {
    console.error("Erreur lors du seeding initial :", err);
  }
}

const httpServer = http.createServer(app);
initSocketIO(httpServer);

async function start() {
  if (process.env.RUN_MIGRATIONS === "true") {
    await runMigrations();
  }
  await ensureDevoirsSchema();
  await ensureMemoiresSchema();
  await ensureMemoireSessionsSchema();
  await ensureDiplomaSchema();
  await ensureWebAuthnSchema();
  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    seedInitialAdmin();
    startFeeReminderScheduler();
    startRecommendationScheduler();
    startLicenseExpiryScheduler();
    startMemoireSessionScheduler();
    startBackupScheduler();
  });
}

start().catch((err) => {
  console.error("Échec du démarrage du serveur :", err);
  process.exit(1);
});
