import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, classEnrollmentsTable, classesTable, activationKeysTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "cpec-u-salt").digest("hex");
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Email and password are required" });
      return;
    }

    const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    const user = users[0];
    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    const hash = hashPassword(password);
    if (hash !== user.passwordHash) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    // Track first login for directeurs
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

// Mark activation key as shown for directeur
router.post("/activation-shown", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    await db.update(usersTable)
      .set({ activationKeyShown: true })
      .where(eq(usersTable.id, userId));
    // Mark the key as shown
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

// Validate a manually entered activation key and assign it to the current directeur
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

// Get the activation key assigned to a directeur
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
      // Try to auto-assign an available key
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

export { hashPassword };
export default router;
