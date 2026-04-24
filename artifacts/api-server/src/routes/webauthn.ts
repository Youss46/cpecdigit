import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/types";
import { db } from "@workspace/db";
import { usersTable, classEnrollmentsTable, classesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ── RP configuration ───────────────────────────────────────────────────────
const REPLIT_DOMAIN = process.env.REPLIT_DOMAINS?.split(",")[0];
const rpID = process.env.WEBAUTHN_RP_ID || REPLIT_DOMAIN || "localhost";
const expectedOrigin =
  process.env.WEBAUTHN_ORIGIN ||
  (REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : "http://localhost:8081");
const rpName = "CPEC-Digital";

// ── In-memory challenge store for authentication (user not logged in yet) ──
const authChallenges = new Map<string, { challenge: string; expiresAt: number }>();

// Clean up expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authChallenges) {
    if (now > v.expiresAt) authChallenges.delete(k);
  }
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION (requires authenticated session)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/webauthn/register/start
router.post("/webauthn/register/start", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

    // Check device count limit (max 5)
    const countResult = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM webauthn_credentials WHERE user_id = ${userId}`
    );
    const countRows = (countResult as any).rows ?? [];
    const count = parseInt(countRows[0]?.count ?? "0");
    if (count >= 5) {
      res.status(400).json({ error: "Limite de 5 appareils atteinte. Révoquez un appareil existant pour continuer." });
      return;
    }

    // Get existing credential IDs to exclude them from options
    const existingCredsResult = await db.execute<{ credential_id: string }>(
      sql`SELECT credential_id FROM webauthn_credentials WHERE user_id = ${userId}`
    );
    const existingCreds = (existingCredsResult as any).rows ?? [];

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(String(userId)),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: "none",
      excludeCredentials: existingCreds.map((c: any) => ({
        id: c.credential_id,
        type: "public-key",
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    // Store challenge in session
    req.session!.webauthnChallenge = options.challenge;
    res.json(options);
  } catch (err) {
    console.error("WebAuthn register/start error:", err);
    res.status(500).json({ error: "Erreur lors de la génération du défi" });
  }
});

// POST /api/auth/webauthn/register/finish
router.post("/webauthn/register/finish", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const challenge = (req.session as any).webauthnChallenge as string | undefined;
    if (!challenge) {
      res.status(400).json({ error: "Aucun défi de registration en cours. Recommencez." });
      return;
    }

    const { body, deviceName } = req.body;
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: "Vérification échouée" });
      return;
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    // Derive a friendly device name from UA if not provided
    const ua = req.headers["user-agent"] ?? "";
    const autoName = deviceName || deriveDeviceName(ua);

    await db.execute(sql`
      INSERT INTO webauthn_credentials
        (user_id, credential_id, public_key, counter, device_type, device_name, aaguid)
      VALUES (
        ${userId},
        ${credential.id},
        ${Buffer.from(credential.publicKey).toString("base64")},
        ${credential.counter},
        ${credentialDeviceType},
        ${autoName},
        ${verification.registrationInfo.aaguid ?? null}
      )
    `);

    delete (req.session as any).webauthnChallenge;
    res.json({ ok: true, deviceName: autoName });
  } catch (err) {
    console.error("WebAuthn register/finish error:", err);
    res.status(500).json({ error: "Enregistrement biométrique échoué" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST / REVOKE (requires authenticated session)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/webauthn/credentials
router.get("/webauthn/credentials", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const result = await db.execute<any>(
      sql`SELECT id, credential_id, device_type, device_name, created_at, last_used_at
          FROM webauthn_credentials WHERE user_id = ${userId}
          ORDER BY created_at DESC`
    );
    res.json((result as any).rows ?? []);
  } catch (err) {
    console.error("WebAuthn credentials list error:", err);
    res.status(500).json({ error: "Erreur lors de la récupération des appareils" });
  }
});

// DELETE /api/auth/webauthn/credentials/:id
router.delete("/webauthn/credentials/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const credRowId = parseInt(req.params.id);
    if (isNaN(credRowId)) { res.status(400).json({ error: "ID invalide" }); return; }

    // Only delete if it belongs to this user
    await db.execute(
      sql`DELETE FROM webauthn_credentials WHERE id = ${credRowId} AND user_id = ${userId}`
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("WebAuthn revoke error:", err);
    res.status(500).json({ error: "Révocation échouée" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION (public — user NOT logged in yet)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/webauthn/authenticate/start
// Body: { email: string }
router.post("/webauthn/authenticate/start", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: "Email requis" }); return; }

    const [user] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user) {
      // Don't reveal if user exists or not — return generic empty challenge
      res.status(404).json({ error: "Aucun identifiant biométrique trouvé pour cet email" });
      return;
    }

    const credsResult = await db.execute<any>(
      sql`SELECT credential_id FROM webauthn_credentials WHERE user_id = ${user.id}`
    );
    const creds = (credsResult as any).rows ?? [];
    if (creds.length === 0) {
      res.status(404).json({ error: "Aucun identifiant biométrique enregistré pour ce compte" });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c: any) => ({
        id: c.credential_id,
        type: "public-key",
      })),
      userVerification: "preferred",
    });

    // Store challenge in memory keyed by email (expires in 5 minutes)
    authChallenges.set(email, { challenge: options.challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
    res.json(options);
  } catch (err) {
    console.error("WebAuthn authenticate/start error:", err);
    res.status(500).json({ error: "Erreur lors de la génération du défi d'authentification" });
  }
});

// POST /api/auth/webauthn/authenticate/finish
// Body: { email: string, body: AuthenticationResponseJSON }
router.post("/webauthn/authenticate/finish", async (req, res) => {
  try {
    const { email, body } = req.body;
    if (!email || !body) {
      res.status(400).json({ error: "email et body requis" }); return;
    }

    const stored = authChallenges.get(email);
    if (!stored || Date.now() > stored.expiresAt) {
      authChallenges.delete(email);
      res.status(400).json({ error: "Défi expiré ou introuvable. Recommencez." });
      return;
    }

    // Look up the credential used
    const credId = body.id;
    const credResult = await db.execute<any>(
      sql`SELECT wc.*, u.id as uid FROM webauthn_credentials wc
          JOIN users u ON u.id = wc.user_id
          WHERE wc.credential_id = ${credId}`
    );
    const credRow = ((credResult as any).rows ?? [])[0];

    if (!credRow) {
      res.status(404).json({ error: "Identifiant biométrique introuvable" });
      return;
    }

    const publicKeyBuffer = Buffer.from(credRow.public_key, "base64");

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: stored.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: credRow.credential_id,
        publicKey: new Uint8Array(publicKeyBuffer),
        counter: credRow.counter,
        transports: undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      res.status(401).json({ error: "Authentification biométrique échouée" });
      return;
    }

    // Update counter and last_used_at
    await db.execute(sql`
      UPDATE webauthn_credentials
      SET counter = ${verification.authenticationInfo.newCounter},
          last_used_at = NOW()
      WHERE credential_id = ${credId}
    `);

    authChallenges.delete(email);

    // Create session — same as password login
    const userId = credRow.user_id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

    let classId: number | null = null;
    let className: string | null = null;
    if (user.role === "student") {
      const [enroll] = await db.select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
        .from(classEnrollmentsTable)
        .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
        .where(eq(classEnrollmentsTable.studentId, user.id))
        .limit(1);
      if (enroll) { classId = enroll.classId; className = enroll.className; }
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
        isFirstLogin: false,
      },
    });
  } catch (err) {
    console.error("WebAuthn authenticate/finish error:", err);
    res.status(500).json({ error: "Authentification biométrique échouée" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveDeviceName(ua: string): string {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "Android (mobile)";
  if (/Android/i.test(ua)) return "Android (tablette)";
  if (/Mac OS X/i.test(ua) && /Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Mac (Safari)";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Appareil inconnu";
}

// Extend session type
declare module "express-session" {
  interface SessionData {
    webauthnChallenge?: string;
  }
}

export default router;
