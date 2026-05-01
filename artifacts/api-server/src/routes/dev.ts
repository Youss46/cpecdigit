import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { activationKeysTable, usersTable, tenantsTable } from "@workspace/db";
import { eq, desc, and, isNull, ne } from "drizzle-orm";
import { invalidatedUsers } from "../lib/auth.js";

const router = Router();

const DEV_PASSWORD = process.env.DEV_MASTER_KEY ?? "dev-change-me";

// Derive a stable token from the password — no session needed
function makeToken(password: string): string {
  return crypto.createHash("sha256").update(`dev-token:${password}:m15edutech`).digest("hex");
}

const VALID_TOKEN = makeToken(DEV_PASSWORD);

function requireDev(req: any, res: any, next: any) {
  const header = req.headers["authorization"] ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token !== VALID_TOKEN) {
    return res.status(401).json({ error: "Unauthorized", message: "Espace développeur — accès refusé" });
  }
  next();
}

function generateKey(): string {
  return crypto.randomBytes(16).toString("hex").toUpperCase().replace(/(.{4})/g, "$1-").slice(0, 19);
}

function computeExpiry(duration: string): Date | null {
  const now = new Date();
  switch (duration) {
    case "1year":   { const d = new Date(now); d.setFullYear(d.getFullYear() + 1); return d; }
    case "2years":  { const d = new Date(now); d.setFullYear(d.getFullYear() + 2); return d; }
    case "5years":  { const d = new Date(now); d.setFullYear(d.getFullYear() + 5); return d; }
    case "10years": { const d = new Date(now); d.setFullYear(d.getFullYear() + 10); return d; }
    case "lifetime":
    default: return null;
  }
}

// --- Auth ---
router.post("/auth", (req, res) => {
  const { password } = req.body;
  if (!password || password !== DEV_PASSWORD) {
    return res.status(401).json({ error: "Mot de passe développeur incorrect" });
  }
  const token = makeToken(password);
  res.json({ token, message: "Authentifié en tant que développeur" });
});

router.post("/logout", (_req, res) => {
  res.json({ message: "Déconnecté" });
});

router.get("/me", (req, res) => {
  const header = req.headers["authorization"] ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token !== VALID_TOKEN) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true });
});

// --- Keys CRUD ---
router.get("/keys", requireDev, async (_req, res) => {
  try {
    const keys = await db.select().from(activationKeysTable).orderBy(desc(activationKeysTable.createdAt));
    res.json(keys);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/keys", requireDev, async (req, res) => {
  try {
    const { duration, notes, count = 1 } = req.body;
    const validDurations = ["lifetime", "1year", "2years", "5years", "10years"];
    if (!duration || !validDurations.includes(duration)) {
      return res.status(400).json({ error: "Durée invalide" });
    }
    const num = Math.min(Math.max(parseInt(count) || 1, 1), 50);
    const inserted: any[] = [];
    for (let i = 0; i < num; i++) {
      const key = generateKey();
      const expiresAt = computeExpiry(duration);
      const [row] = await db.insert(activationKeysTable)
        .values({ key, duration: duration as any, expiresAt, notes: notes ?? null })
        .returning();
      inserted.push(row);
    }
    res.status(201).json(inserted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/keys/:id", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(activationKeysTable).where(eq(activationKeysTable.id, id));
    res.json({ message: "Clé supprimée" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/keys/:id/revoke", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(activationKeysTable)
      .set({ status: "revoked" })
      .where(eq(activationKeysTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not Found" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/keys/:id/renew", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db
      .select({ duration: activationKeysTable.duration })
      .from(activationKeysTable)
      .where(eq(activationKeysTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not Found" });

    const newKey = generateKey();
    const newExpiry = computeExpiry(existing.duration);

    const [row] = await db.update(activationKeysTable)
      .set({
        key: newKey,
        status: "available",
        assignedToUserId: null,
        assignedAt: null,
        shownAt: null,
        expiresAt: newExpiry,
      })
      .where(eq(activationKeysTable.id, id))
      .returning();
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/keys/:id/extend", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db
      .select({ duration: activationKeysTable.duration, expiresAt: activationKeysTable.expiresAt })
      .from(activationKeysTable)
      .where(eq(activationKeysTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not Found" });
    if (existing.duration === "lifetime") {
      return res.status(400).json({ error: "Les clés à vie n'ont pas de date d'expiration à prolonger." });
    }

    // Base = current expiry if still in future, otherwise today
    const base = existing.expiresAt && existing.expiresAt > new Date() ? existing.expiresAt : new Date();
    const extended = new Date(base);
    switch (existing.duration) {
      case "1year":   extended.setFullYear(extended.getFullYear() + 1); break;
      case "2years":  extended.setFullYear(extended.getFullYear() + 2); break;
      case "5years":  extended.setFullYear(extended.getFullYear() + 5); break;
      case "10years": extended.setFullYear(extended.getFullYear() + 10); break;
    }

    const [row] = await db.update(activationKeysTable)
      .set({ expiresAt: extended })
      .where(eq(activationKeysTable.id, id))
      .returning();
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- User Management (directeurs only) ---

router.post("/directeurs", requireDev, async (req, res) => {
  try {
    const { name, email, password, activationKeyId } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email et password sont requis" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
      return;
    }
    // Check email uniqueness
    const existing = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, email.trim().toLowerCase()))
      .limit(1);
    if (existing[0]) {
      res.status(409).json({ error: "Un utilisateur avec cet email existe déjà" });
      return;
    }
    const hash = crypto.createHash("sha256").update(password + "cpec-u-salt").digest("hex");
    const [user] = await db.insert(usersTable).values({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      passwordHash: hash,
      role: "admin",
      adminSubRole: "directeur",
      mustChangePassword: true,
      requiresActivationKey: true,
    }).returning();

    let assignedKey = null;
    if (activationKeyId) {
      // Assign the selected key
      const [key] = await db.update(activationKeysTable)
        .set({ assignedToUserId: String(user.id), assignedAt: new Date(), status: "assigned" })
        .where(and(
          eq(activationKeysTable.id, Number(activationKeyId)),
          eq(activationKeysTable.status, "available")
        ))
        .returning();
      assignedKey = key ?? null;
    } else {
      // Auto-assign any available key
      const available = await db.select().from(activationKeysTable)
        .where(and(
          eq(activationKeysTable.status, "available"),
          isNull(activationKeysTable.assignedToUserId as any)
        ))
        .limit(1);
      if (available[0]) {
        const [key] = await db.update(activationKeysTable)
          .set({ assignedToUserId: String(user.id), assignedAt: new Date(), status: "assigned" })
          .where(eq(activationKeysTable.id, available[0].id))
          .returning();
        assignedKey = key ?? null;
      }
    }

    res.status(201).json({ user, activationKey: assignedKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/directeurs", requireDev, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        firstLoginAt: usersTable.firstLoginAt,
      })
      .from(usersTable)
      .where(eq(usersTable.adminSubRole, "directeur"))
      .orderBy(desc(usersTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── School (Tenant) Management ─────────────────────────────────────────────

// GET /api/dev/schools — all schools with their admin user + license info
router.get("/schools", requireDev, async (_req, res) => {
  try {
    const schools = await db.select().from(tenantsTable).orderBy(desc(tenantsTable.createdAt));
    const result = await Promise.all(schools.map(async (school) => {
      const [admin] = await db.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        firstLoginAt: usersTable.firstLoginAt,
      }).from(usersTable)
        .where(and(eq(usersTable.tenantId, school.id), eq(usersTable.adminSubRole, "directeur")))
        .limit(1);

      let license = null;
      if (admin) {
        const [key] = await db.select().from(activationKeysTable)
          .where(eq(activationKeysTable.assignedToUserId, String(admin.id)))
          .limit(1);
        license = key ?? null;
      }

      return { ...school, admin: admin ?? null, license };
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/dev/schools — create school + admin + assign license in one step
router.post("/schools", requireDev, async (req, res) => {
  try {
    const { schoolName, adminName, adminEmail, adminPassword, licenseKeyId, licenseDuration } = req.body;

    if (!schoolName?.trim() || !adminName?.trim() || !adminEmail?.trim() || !adminPassword) {
      return res.status(400).json({ error: "schoolName, adminName, adminEmail et adminPassword sont requis" });
    }
    if (adminPassword.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }

    // Check email not already used
    const emailExists = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, adminEmail.trim().toLowerCase())).limit(1);
    if (emailExists[0]) {
      return res.status(409).json({ error: "Un utilisateur avec cet email existe déjà" });
    }

    // 1. Create the tenant (school)
    const subdomain = schoolName.trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const [tenant] = await db.insert(tenantsTable).values({
      name: schoolName.trim(),
      subdomain: `${subdomain}-${Date.now()}`,
      active: true,
    }).returning();

    // 2. Create the super admin for this school
    const hash = crypto.createHash("sha256").update(adminPassword + "cpec-u-salt").digest("hex");
    const [user] = await db.insert(usersTable).values({
      email: adminEmail.trim().toLowerCase(),
      name: adminName.trim(),
      passwordHash: hash,
      role: "admin",
      adminSubRole: "directeur",
      mustChangePassword: false,
      requiresActivationKey: false,
      tenantId: tenant.id,
    }).returning();

    // 3. Assign license
    let license = null;
    if (licenseKeyId) {
      const [key] = await db.update(activationKeysTable)
        .set({ assignedToUserId: String(user.id), assignedAt: new Date(), status: "assigned" })
        .where(and(eq(activationKeysTable.id, Number(licenseKeyId)), eq(activationKeysTable.status, "available")))
        .returning();
      license = key ?? null;
    } else if (licenseDuration) {
      const validDurations = ["lifetime", "1year", "2years", "5years", "10years"];
      if (validDurations.includes(licenseDuration)) {
        const key = generateKey();
        const expiresAt = computeExpiry(licenseDuration);
        const [newKey] = await db.insert(activationKeysTable).values({
          key,
          duration: licenseDuration as any,
          expiresAt,
          notes: `Licence automatique — ${schoolName.trim()}`,
          assignedToUserId: String(user.id),
          assignedAt: new Date(),
          status: "assigned",
          tenantId: tenant.id,
        }).returning();
        license = newKey;
      }
    }

    res.status(201).json({ school: tenant, admin: user, license });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/dev/schools/:id — update school name
router.patch("/schools/:id", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Le nom est requis" });
    const [updated] = await db.update(tenantsTable)
      .set({ name: name.trim() })
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "École introuvable" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/dev/schools/:id/admin — update directeur info (name, email, optional password)
router.patch("/schools/:id/admin", requireDev, async (req, res) => {
  try {
    const schoolId = parseInt(req.params.id);
    const { name, email, password } = req.body;
    if (!name?.trim() && !email?.trim() && !password) {
      return res.status(400).json({ error: "Au moins un champ à modifier est requis" });
    }

    const [admin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, schoolId), eq(usersTable.adminSubRole, "directeur")))
      .limit(1);
    if (!admin) return res.status(404).json({ error: "Directeur introuvable pour cette école" });

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name?.trim()) updates.name = name.trim();
    if (email?.trim()) {
      const emailLower = email.trim().toLowerCase();
      const conflict = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.email, emailLower)).limit(1);
      if (conflict[0] && conflict[0].id !== admin.id) {
        return res.status(409).json({ error: "Cet email est déjà utilisé par un autre compte" });
      }
      updates.email = emailLower;
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
      updates.passwordHash = crypto.createHash("sha256").update(password + "cpec-u-salt").digest("hex");
    }

    const [updated] = await db.update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, admin.id))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, firstLoginAt: usersTable.firstLoginAt });

    // Invalider la session active du directeur si email ou mot de passe a changé
    if (updates.email || updates.passwordHash) {
      invalidatedUsers.add(admin.id);
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /api/dev/schools/:id/toggle — activate or deactivate a school
router.patch("/schools/:id/toggle", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [school] = await db.select({ active: tenantsTable.active }).from(tenantsTable).where(eq(tenantsTable.id, id));
    if (!school) return res.status(404).json({ error: "École introuvable" });
    const [updated] = await db.update(tenantsTable)
      .set({ active: !school.active })
      .where(eq(tenantsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/dev/schools/:id — permanently delete a school and all its data
router.delete("/schools/:id", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [school] = await db.select({ id: tenantsTable.id, name: tenantsTable.name })
      .from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
    if (!school) return res.status(404).json({ error: "École introuvable" });

    // Invalider les sessions actives de tous les utilisateurs de cette école
    const users = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.tenantId, id));
    for (const u of users) invalidatedUsers.add(u.id);

    // La suppression du tenant cascade à tous ses utilisateurs et données liées (ON DELETE CASCADE)
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));

    res.json({ message: `École "${school.name}" supprimée définitivement.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/dev/schools/:id/renew-license — extend or create license for a school
router.post("/schools/:id/renew-license", requireDev, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { duration } = req.body;

    const validDurations = ["lifetime", "1year", "2years", "5years", "10years"];
    if (!duration || !validDurations.includes(duration)) {
      return res.status(400).json({ error: "Durée invalide" });
    }

    const [school] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
    if (!school) return res.status(404).json({ error: "École introuvable" });

    const [admin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, id), eq(usersTable.adminSubRole, "directeur")))
      .limit(1);

    let existingKey = null;
    if (admin) {
      const [key] = await db.select().from(activationKeysTable)
        .where(eq(activationKeysTable.assignedToUserId, String(admin.id)))
        .limit(1);
      existingKey = key ?? null;
    }

    let updatedKey;
    if (existingKey) {
      // Extend from current expiry (if future) or from today
      let newExpiry: Date | null = null;
      if (duration !== "lifetime") {
        const base = existingKey.expiresAt && existingKey.expiresAt > new Date()
          ? new Date(existingKey.expiresAt)
          : new Date();
        switch (duration) {
          case "1year":   base.setFullYear(base.getFullYear() + 1); break;
          case "2years":  base.setFullYear(base.getFullYear() + 2); break;
          case "5years":  base.setFullYear(base.getFullYear() + 5); break;
          case "10years": base.setFullYear(base.getFullYear() + 10); break;
        }
        newExpiry = base;
      }
      const [row] = await db.update(activationKeysTable)
        .set({ expiresAt: newExpiry, duration: duration as any, status: "assigned" })
        .where(eq(activationKeysTable.id, existingKey.id))
        .returning();
      updatedKey = row;
    } else {
      // Create a new license for this school
      const key = generateKey();
      const expiresAt = computeExpiry(duration);
      const [row] = await db.insert(activationKeysTable).values({
        key,
        duration: duration as any,
        expiresAt,
        notes: `Licence renouvelée — ${school.name}`,
        assignedToUserId: admin ? String(admin.id) : null,
        assignedAt: new Date(),
        status: "assigned",
        tenantId: id,
      }).returning();
      updatedKey = row;
    }

    // Reactivate the school if it was suspended due to expiry
    const [updatedSchool] = await db.update(tenantsTable)
      .set({ active: true })
      .where(eq(tenantsTable.id, id))
      .returning();

    res.json({ school: updatedSchool, license: updatedKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/reset-password", requireDev, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: "userId et newPassword sont requis" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }
    const hash = crypto.createHash("sha256").update(newPassword + "cpec-u-salt").digest("hex");
    const [row] = await db.update(usersTable)
      .set({ passwordHash: hash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(usersTable.id, parseInt(userId)))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });
    if (!row) return res.status(404).json({ error: "Utilisateur introuvable" });
    invalidatedUsers.add(parseInt(userId));
    res.json({ message: `Mot de passe réinitialisé pour ${row.name}`, user: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
