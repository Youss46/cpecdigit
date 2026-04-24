import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { activationKeysTable, usersTable } from "@workspace/db";
import { eq, desc, and, isNull } from "drizzle-orm";

const router = Router();

const DEV_PASSWORD = process.env.DEV_MASTER_KEY ?? "dev-change-me";

function requireDev(req: any, res: any, next: any) {
  if (!req.session?.devAuthenticated) {
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
  req.session!.devAuthenticated = true;
  res.json({ message: "Authentifié en tant que développeur" });
});

router.post("/logout", (req, res) => {
  req.session!.devAuthenticated = false;
  res.json({ message: "Déconnecté" });
});

router.get("/me", (req, res) => {
  if (!req.session?.devAuthenticated) {
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
    res.json({ message: `Mot de passe réinitialisé pour ${row.name}`, user: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
