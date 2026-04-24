import http from "http";
import crypto from "crypto";
import app from "./app";
import { initSocketIO } from "./lib/socket.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { startFeeReminderScheduler } from "./lib/fee-reminder-scheduler.js";
import { startRecommendationScheduler } from "./lib/recommendation-scheduler.js";

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

async function seedInitialAdmin() {
  try {
    const passwordHash = crypto
      .createHash("sha256")
      .update("password123" + "cpec-u-salt")
      .digest("hex");

    const inserted = await db.insert(usersTable).values({
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

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  seedInitialAdmin();
  startFeeReminderScheduler();
  startRecommendationScheduler();
});
