import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  usersTable,
  studentProfilesTable,
  classEnrollmentsTable,
  classesTable,
  studentCardsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { generateCardHtml, generateBulkCardsHtml, type CardData } from "../lib/card-html.js";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function getAcademicYearExpiry(): Date {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const expiryYear = month >= 8 ? year + 1 : year;
  const d = new Date(`${expiryYear}-07-31T23:59:59Z`);
  return d;
}

function getVerifyBaseUrl(req: any): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost:8081";
  const basePath = process.env.BASE_PATH || "/cpec-u/";
  return `${proto}://${host}${basePath}`;
}

async function getStudentCardData(studentId: number, req: any): Promise<CardData | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
  if (!user) return null;

  const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, studentId)).limit(1);
  const [enroll] = await db
    .select({ classId: classEnrollmentsTable.classId, className: classesTable.name, filiere: classesTable.filiere })
    .from(classEnrollmentsTable)
    .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
    .where(eq(classEnrollmentsTable.studentId, studentId))
    .limit(1);

  const academicYear = getCurrentAcademicYear();
  const [existingCard] = await db
    .select()
    .from(studentCardsTable)
    .where(and(eq(studentCardsTable.studentId, studentId), eq(studentCardsTable.academicYear, academicYear)))
    .limit(1);

  if (!existingCard) return null;

  return {
    studentName: user.name,
    matricule: profile?.matricule ?? null,
    className: enroll?.className ?? null,
    filiere: enroll?.filiere ?? null,
    academicYear,
    photoUrl: profile?.photoUrl ?? null,
    dateNaissance: profile?.dateNaissance ?? null,
    issuedAt: existingCard.issuedAt,
    expiresAt: existingCard.expiresAt,
    isValid: existingCard.isValid,
    hash: existingCard.hash,
    verifyBaseUrl: getVerifyBaseUrl(req),
  };
}

async function generateOrRenewCard(studentId: number): Promise<string> {
  const academicYear = getCurrentAcademicYear();
  const expiresAt = getAcademicYearExpiry();
  const hash = crypto.randomBytes(24).toString("hex");

  const [existing] = await db
    .select()
    .from(studentCardsTable)
    .where(and(eq(studentCardsTable.studentId, studentId), eq(studentCardsTable.academicYear, academicYear)))
    .limit(1);

  if (existing) {
    await db
      .update(studentCardsTable)
      .set({ hash, issuedAt: new Date(), expiresAt, isValid: true, updatedAt: new Date() })
      .where(eq(studentCardsTable.id, existing.id));
  } else {
    await db.insert(studentCardsTable).values({
      studentId, academicYear, hash, issuedAt: new Date(), expiresAt, isValid: true,
    });
  }
  return hash;
}

// ── PUBLIC: Verify a card by hash ─────────────────────────────────────────────
router.get("/verify/:hash", async (req, res) => {
  try {
    const { hash } = req.params;
    const [card] = await db
      .select()
      .from(studentCardsTable)
      .where(eq(studentCardsTable.hash, hash))
      .limit(1);

    if (!card) {
      res.status(404).json({ valid: false, reason: "Carte introuvable ou hash invalide." });
      return;
    }

    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, card.studentId)).limit(1);
    const [profile] = await db
      .select({ matricule: studentProfilesTable.matricule })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.studentId, card.studentId))
      .limit(1);
    const [enroll] = await db
      .select({ className: classesTable.name, filiere: classesTable.filiere })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, card.studentId))
      .limit(1);

    const isExpired = new Date() > card.expiresAt;
    const isValid = card.isValid && !isExpired;

    res.json({
      valid: isValid,
      studentName: user?.name ?? "Inconnu",
      matricule: profile?.matricule ?? null,
      className: enroll?.className ?? null,
      filiere: enroll?.filiere ?? null,
      academicYear: card.academicYear,
      issuedAt: card.issuedAt,
      expiresAt: card.expiresAt,
      status: !card.isValid ? "invalidée" : isExpired ? "expirée" : "active",
      reason: !card.isValid ? "Carte invalidée par l'administration." : isExpired ? "Carte expirée." : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── STUDENT: Get own card info ─────────────────────────────────────────────────
router.get("/student/card", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const cardData = await getStudentCardData(studentId, req);
    if (!cardData) {
      res.status(404).json({ error: "Aucune carte pour cette année académique. Générez votre carte." });
      return;
    }
    const isExpired = new Date() > cardData.expiresAt;
    res.json({
      ...cardData,
      isExpired,
      verifyUrl: `${cardData.verifyBaseUrl}verify/${cardData.hash}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── STUDENT: Generate own card ────────────────────────────────────────────────
router.post("/student/card/generate", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, studentId)).limit(1);
    if (!profile?.photoUrl) {
      res.status(400).json({ error: "Une photo de profil est requise pour générer votre carte étudiante. Veuillez d'abord ajouter une photo dans votre profil." });
      return;
    }
    await generateOrRenewCard(studentId);
    const cardData = await getStudentCardData(studentId, req);
    res.json({ success: true, card: cardData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── STUDENT: Download own card HTML ───────────────────────────────────────────
router.get("/student/card/pdf", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const cardData = await getStudentCardData(studentId, req);
    if (!cardData) {
      res.status(404).json({ error: "Aucune carte générée. Générez votre carte d'abord." });
      return;
    }
    const html = await generateCardHtml(cardData);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="carte-etudiante-${studentId}.html"`);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── ADMIN: Get student card info ───────────────────────────────────────────────
router.get("/admin/students/:id/card", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const studentId = parseInt(req.params.id);
    const cardData = await getStudentCardData(studentId, req);
    if (!cardData) {
      res.status(404).json({ error: "Aucune carte pour cette année académique." });
      return;
    }
    const isExpired = new Date() > cardData.expiresAt;
    res.json({ ...cardData, isExpired, verifyUrl: `${cardData.verifyBaseUrl}verify/${cardData.hash}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── ADMIN: Generate/renew a student's card ────────────────────────────────────
router.post("/admin/students/:id/card/generate", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const studentId = parseInt(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    if (!user || user.role !== "student") {
      res.status(404).json({ error: "Étudiant introuvable." });
      return;
    }
    await generateOrRenewCard(studentId);
    const cardData = await getStudentCardData(studentId, req);
    res.json({ success: true, card: cardData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── ADMIN: Download student card HTML ─────────────────────────────────────────
router.get("/admin/students/:id/card/pdf", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const studentId = parseInt(req.params.id);
    const cardData = await getStudentCardData(studentId, req);
    if (!cardData) {
      res.status(404).json({ error: "Aucune carte générée." });
      return;
    }
    const html = await generateCardHtml(cardData);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="carte-etudiante-${studentId}.html"`);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── ADMIN: Invalidate a student's card ────────────────────────────────────────
router.post("/admin/students/:id/card/invalidate", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const studentId = parseInt(req.params.id);
    const academicYear = getCurrentAcademicYear();
    await db
      .update(studentCardsTable)
      .set({ isValid: false, updatedAt: new Date() })
      .where(and(eq(studentCardsTable.studentId, studentId), eq(studentCardsTable.academicYear, academicYear)));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── ADMIN: Bulk cards for a class ─────────────────────────────────────────────
router.get("/admin/classes/:classId/cards", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const classId = parseInt(req.params.classId);
    const [classRow] = await db.select().from(classesTable).where(eq(classesTable.id, classId)).limit(1);
    if (!classRow) { res.status(404).json({ error: "Classe introuvable." }); return; }

    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.classId, classId));

    if (enrollments.length === 0) {
      res.status(404).json({ error: "Aucun étudiant dans cette classe." });
      return;
    }

    // Ensure all students have cards
    for (const { studentId } of enrollments) {
      const academicYear = getCurrentAcademicYear();
      const [existing] = await db
        .select()
        .from(studentCardsTable)
        .where(and(eq(studentCardsTable.studentId, studentId), eq(studentCardsTable.academicYear, academicYear)))
        .limit(1);
      if (!existing) {
        await generateOrRenewCard(studentId);
      }
    }

    const cardDataList: CardData[] = [];
    for (const { studentId } of enrollments) {
      const data = await getStudentCardData(studentId, req);
      if (data) cardDataList.push(data);
    }

    const html = await generateBulkCardsHtml(cardDataList);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="cartes-classe-${classId}.html"`);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── ADMIN: List all classes (for filter) ──────────────────────────────────────
router.get("/admin/classes-list", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const classList = await db.select({ id: classesTable.id, name: classesTable.name, filiere: classesTable.filiere }).from(classesTable);
    res.json(classList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── ADMIN: List all students with card status ──────────────────────────────────
router.get("/admin/cards/students", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }

    const classIdParam = req.query.classId ? parseInt(req.query.classId as string) : null;

    const students = await (classIdParam
      ? db
          .select({
            studentId: usersTable.id,
            studentName: usersTable.name,
            matricule: studentProfilesTable.matricule,
            classId: classEnrollmentsTable.classId,
            className: classesTable.name,
          })
          .from(usersTable)
          .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, usersTable.id))
          .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.studentId, usersTable.id))
          .leftJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
          .where(and(eq(usersTable.role, "student"), eq(classEnrollmentsTable.classId, classIdParam)))
      : db
          .select({
            studentId: usersTable.id,
            studentName: usersTable.name,
            matricule: studentProfilesTable.matricule,
            classId: classEnrollmentsTable.classId,
            className: classesTable.name,
          })
          .from(usersTable)
          .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, usersTable.id))
          .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.studentId, usersTable.id))
          .leftJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
          .where(eq(usersTable.role, "student"))
    );

    const academicYear = getCurrentAcademicYear();
    const results = await Promise.all(
      students.map(async (s) => {
        const [card] = await db
          .select()
          .from(studentCardsTable)
          .where(and(eq(studentCardsTable.studentId, s.studentId), eq(studentCardsTable.academicYear, academicYear)))
          .limit(1);

        let cardEntry = null;
        if (card) {
          const isExpired = new Date() > card.expiresAt;
          const status = !card.isValid ? "invalidated" : isExpired ? "expired" : "active";
          cardEntry = {
            id: card.id,
            hash: card.hash,
            academicYear: card.academicYear,
            issuedAt: card.issuedAt,
            expiresAt: card.expiresAt,
            isValid: card.isValid,
            isExpired,
            status,
          };
        }

        return {
          studentId: s.studentId,
          studentName: s.studentName,
          matricule: s.matricule ?? null,
          className: s.className ?? null,
          card: cardEntry,
        };
      })
    );

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
