import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, classEnrollmentsTable, classesTable, activationKeysTable, tenantsTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, isNull, lt } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { sendPasswordResetEmail } from "../lib/resend.js";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "cpec-u-salt").digest("hex");
}

// In-memory login attempt tracker: email -> { count, lockedUntil }
const loginAttempts = new Map<string, { count: number; lockedUntil: Date | null }>();
const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

function getAttempts(email: string) {
  return loginAttempts.get(email) ?? { count: 0, lockedUntil: null };
}

function resetAttempts(email: string) {
  loginAttempts.delete(email);
}

function recordFailedAttempt(email: string): { count: number; locked: boolean } {
  const entry = getAttempts(email);
  const newCount = entry.count + 1;
  const locked = newCount >= MAX_ATTEMPTS;
  loginAttempts.set(email, {
    count: newCount,
    lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
  });
  return { count: newCount, locked };
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Email and password are required" });
      return;
    }

    // Check lockout
    const attempts = getAttempts(email);
    if (attempts.lockedUntil && attempts.lockedUntil > new Date()) {
      const remaining = Math.ceil((attempts.lockedUntil.getTime() - Date.now()) / 60000);
      res.status(429).json({
        error: "TooManyAttempts",
        message: `🔒 Compte temporairement bloqué. Réessayez dans ${remaining} minute${remaining > 1 ? "s" : ""}.`,
      });
      return;
    }
    // Reset stale lockout
    if (attempts.lockedUntil && attempts.lockedUntil <= new Date()) {
      resetAttempts(email);
    }

    // Find user by email globally — tenant is determined from the user's own account
    const users = await db.select().from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    const user = users[0];
    if (!user) {
      recordFailedAttempt(email);
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    const hash = hashPassword(password);
    if (hash !== user.passwordHash) {
      const { count, locked } = recordFailedAttempt(email);
      const remaining = MAX_ATTEMPTS - count;
      if (locked) {
        res.status(429).json({
          error: "TooManyAttempts",
          message: `🚫 Trop de tentatives incorrectes ! Compte bloqué pendant ${LOCKOUT_MINUTES} minutes.`,
        });
      } else {
        const emoji = remaining === 1 ? "⚠️" : "❌";
        res.status(401).json({
          error: "Unauthorized",
          message: `${emoji} Mot de passe incorrect. Il vous reste ${remaining} tentative${remaining > 1 ? "s" : ""}.`,
        });
      }
      return;
    }

    // Successful login — reset attempt counter
    resetAttempts(email);

    const tenantId = user.tenantId!;

    // Block login if the school has been deactivated by the developer
    const [tenant] = await db.select({ active: tenantsTable.active })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));
    if (!tenant || !tenant.active) {
      res.status(401).json({
        error: "AccountDisabled",
        message: "Votre compte a été désactivé. Veuillez contacter le développeur.",
      });
      return;
    }

    const isFirstLogin = user.role === "admin" && user.adminSubRole === "directeur" && !user.firstLoginAt;
    if (isFirstLogin) {
      await db.update(usersTable)
        .set({ firstLoginAt: new Date() })
        .where(eq(usersTable.id, user.id));
    }

    let classId: number | null = null;
    let className: string | null = null;

    if (user.role === "student") {
      const enrollments = await db
        .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
        .from(classEnrollmentsTable)
        .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
        .where(eq(classEnrollmentsTable.studentId, user.id))
        .limit(1);
      if (enrollments[0]) {
        classId = enrollments[0].classId;
        className = enrollments[0].className;
      }
    }

    req.session!.userId = user.id;
    req.session!.role = user.role;
    req.session!.name = user.name;
    req.session!.tenantId = tenantId;
    req.session!.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      adminSubRole: user.adminSubRole ?? null,
    };

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminSubRole: user.adminSubRole ?? null,
        mustChangePassword: user.mustChangePassword,
        classId,
        className,
        activationKeyShown: user.activationKeyShown,
        isFirstLogin: !!user.requiresActivationKey && !user.activationKeyShown,
      },
      message: "Login successful",
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, req.session!.userId!)).limit(1);
    const user = users[0];
    if (!user) {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }

    let classId: number | null = null;
    let className: string | null = null;

    if (user.role === "student") {
      const enrollments = await db
        .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
        .from(classEnrollmentsTable)
        .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
        .where(eq(classEnrollmentsTable.studentId, user.id))
        .limit(1);
      if (enrollments[0]) {
        classId = enrollments[0].classId;
        className = enrollments[0].className;
      }
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      adminSubRole: user.adminSubRole ?? null,
      mustChangePassword: user.mustChangePassword,
      classId,
      className,
      activationKeyShown: user.activationKeyShown,
      isFirstLogin: !!(user.firstLoginAt) && !user.activationKeyShown && !!user.requiresActivationKey,
    });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/activation-shown", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    await db.update(usersTable)
      .set({ activationKeyShown: true })
      .where(eq(usersTable.id, userId));
    await db.update(activationKeysTable)
      .set({ shownAt: new Date() })
      .where(and(
        eq(activationKeysTable.assignedToUserId, String(userId)),
        isNull(activationKeysTable.shownAt)
      ));
    res.json({ message: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/validate-activation-key", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const user = (await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1))[0];
    if (!user || user.role !== "admin" || user.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { key } = req.body;
    if (!key || typeof key !== "string") {
      res.status(400).json({ error: "Bad Request", message: "Clé requise" });
      return;
    }
    const normalized = key.trim().toUpperCase();
    const found = await db.select().from(activationKeysTable)
      .where(and(
        eq(activationKeysTable.key, normalized),
        eq(activationKeysTable.status, "available"),
        isNull(activationKeysTable.assignedToUserId as any)
      ))
      .limit(1);
    if (!found[0]) {
      res.status(404).json({ error: "Clé invalide ou déjà utilisée" });
      return;
    }
    const [assigned] = await db.update(activationKeysTable)
      .set({ assignedToUserId: String(userId), assignedAt: new Date(), status: "assigned" })
      .where(eq(activationKeysTable.id, found[0].id))
      .returning();
    res.json(assigned);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/my-activation-key", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const user = (await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1))[0];
    if (!user || user.role !== "admin" || user.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const keys = await db.select().from(activationKeysTable)
      .where(eq(activationKeysTable.assignedToUserId, String(userId)))
      .limit(1);
    const key = keys[0];
    if (!key) {
      const available = await db.select().from(activationKeysTable)
        .where(and(
          eq(activationKeysTable.status, "available"),
          isNull(activationKeysTable.assignedToUserId as any)
        ))
        .limit(1);
      if (!available[0]) {
        res.status(404).json({ error: "No activation key available" });
        return;
      }
      const [assigned] = await db.update(activationKeysTable)
        .set({ assignedToUserId: String(userId), assignedAt: new Date(), status: "assigned" })
        .where(eq(activationKeysTable.id, available[0].id))
        .returning();
      res.json(assigned);
      return;
    }
    res.json(key);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Bad Request", message: "Champs requis manquants" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "Bad Request", message: "Le mot de passe doit contenir au moins 6 caractères" });
      return;
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.id, req.session!.userId!)).limit(1);
    const user = users[0];
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    if (hashPassword(currentPassword) !== user.passwordHash) {
      res.status(401).json({ error: "Unauthorized", message: "Mot de passe actuel incorrect" });
      return;
    }

    await db.update(usersTable)
      .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
      .where(eq(usersTable.id, user.id));

    res.json({ message: "Mot de passe mis à jour avec succès" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /auth/forgot-password — request a password reset link
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email requis" });
      return;
    }

    // Always respond with 200 so we don't reveal whether the email exists
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.email, email.trim().toLowerCase()))
      .limit(1);

    if (!user) {
      res.json({ message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
      return;
    }

    // Clean up expired tokens for this user
    await db.delete(passwordResetTokensTable)
      .where(and(
        eq(passwordResetTokensTable.userId, user.id),
        lt(passwordResetTokensTable.expiresAt, new Date()),
      ));

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      token,
      expiresAt,
    });

    // Build the reset URL (use FRONTEND_URL env var in prod, Origin header in dev)
    const origin = process.env.FRONTEND_URL ||
      req.headers.origin ||
      `${req.protocol}://${req.headers.host}`;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    // Fetch school name for the email
    const [tenant] = await db.select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId!))
      .limit(1);

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      schoolName: tenant?.name ?? "M15 EduTech",
    });

    res.json({ message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
  } catch (err) {
    console.error("forgot-password error:", err);
    // Don't leak internal error details — still return 200
    res.json({ message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
  }
});

// POST /auth/reset-password — set a new password using a valid token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: "Token et nouveau mot de passe requis" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
      return;
    }

    const [record] = await db.select().from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.token, token))
      .limit(1);

    if (!record) {
      res.status(400).json({ error: "Lien invalide ou déjà utilisé" });
      return;
    }
    if (record.usedAt) {
      res.status(400).json({ error: "Ce lien a déjà été utilisé" });
      return;
    }
    if (record.expiresAt < new Date()) {
      res.status(400).json({ error: "Ce lien a expiré. Veuillez en demander un nouveau." });
      return;
    }

    // Update password and mark token as used
    await Promise.all([
      db.update(usersTable)
        .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
        .where(eq(usersTable.id, record.userId)),
      db.update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokensTable.id, record.id)),
    ]);

    res.json({ message: "Mot de passe mis à jour avec succès" });
  } catch (err) {
    console.error("reset-password error:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export { hashPassword };
export default router;
