import { db } from "@workspace/db";
import { activationKeysTable, tenantsTable, usersTable } from "@workspace/db";
import { eq, lte, and, isNotNull } from "drizzle-orm";

async function runExpiryCheck() {
  const now = new Date();

  const expiredKeys = await db
    .select({
      id: activationKeysTable.id,
      tenantId: activationKeysTable.tenantId,
      assignedToUserId: activationKeysTable.assignedToUserId,
    })
    .from(activationKeysTable)
    .where(
      and(
        eq(activationKeysTable.status, "assigned"),
        isNotNull(activationKeysTable.expiresAt),
        lte(activationKeysTable.expiresAt, now)
      )
    );

  if (expiredKeys.length === 0) return;

  for (const key of expiredKeys) {
    let tenantId: number | null = key.tenantId ?? null;

    if (!tenantId && key.assignedToUserId) {
      const [user] = await db
        .select({ tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(eq(usersTable.id, parseInt(key.assignedToUserId)))
        .limit(1);
      tenantId = user?.tenantId ?? null;
    }

    if (tenantId) {
      const [school] = await db
        .select({ active: tenantsTable.active })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1);

      if (school?.active) {
        await db.update(tenantsTable)
          .set({ active: false })
          .where(eq(tenantsTable.id, tenantId));
        console.log(`[LicenseExpiry] École tenantId=${tenantId} désactivée — licence expirée.`);
      }
    }

    await db.update(activationKeysTable)
      .set({ status: "revoked" })
      .where(eq(activationKeysTable.id, key.id));
  }

  console.log(`[LicenseExpiry] ${expiredKeys.length} licence(s) expirée(s) traitée(s).`);
}

export function startLicenseExpiryScheduler() {
  runExpiryCheck().catch(console.error);
  setInterval(() => runExpiryCheck().catch(console.error), 60 * 60 * 1000);
  console.log("[LicenseExpiry] Scheduler démarré — vérification toutes les heures.");
}
