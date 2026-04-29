import { Router } from "express";
import crypto from "crypto";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { generateBulletinHTML } from "../lib/bulletin-html.js";
import { notifyStudentsOfClasses } from "./notifications.js";
import { sendPushToUser } from "./push.js";
import {
  usersTable,
  classesTable,
  classEnrollmentsTable,
  subjectsTable,
  semestersTable,
  gradesTable,
  teacherAssignmentsTable,
  subjectApprovalsTable,
  gradeSubmissionsTable,
  activityLogTable,
  attendanceTable,
  absenceJustificationsTable,
  notificationsTable,
  teachingUnitsTable,
  classFeesTable,
  studentFeesTable,
  studentProfilesTable,
  academicYearArchivesTable,
  ecolesInphbTable,
  paymentsTable,
  paymentInstallmentsTable,
  housingAssignmentsTable,
  housingRoomsTable,
  housingBuildingsTable,
  cahierDeTexteTable,
  retakeSessionsTable,
  retakeGradesTable,
  specialJurySessionsTable,
  specialJuryDecisionsTable,
  bulletinTokensTable,
  bulletinVerificationLogsTable,
  parentStudentLinksTable,
  attendanceSessionsTable,
  scheduleEntriesTable,
  reclamationsTable,
  messagesTable,
  tenantsTable,
} from "@workspace/db";
import { eq, and, sql, count, inArray, desc, ne, isNotNull, isNull, asc, ilike, or, lte, gte } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "cpec-u-salt").digest("hex");
}

async function notifyParentsOfResults(semesterName: string, academicYear: string, tenantId?: number): Promise<void> {
  try {
    const conditions: any[] = [eq(usersTable.role, "parent")];
    if (tenantId) conditions.push(eq(usersTable.tenantId, tenantId));
    const parents = await db.select({ id: usersTable.id }).from(usersTable).where(and(...conditions));
    const title = "Résultats disponibles";
    const message = `Les résultats du semestre "${semesterName}" (${academicYear}) sont publiés. Connectez-vous à l'Espace Parents pour les consulter.`;
    for (const parent of parents) {
      await db.insert(notificationsTable).values({ userId: parent.id, type: "results_published", title, message, read: false });
      sendPushToUser(parent.id, { title, body: message, type: "results_published" }).catch(() => {});
    }
  } catch (e) { console.error("notifyParentsOfResults:", e); }
}

async function applyClassFeeToStudent(studentId: number, classId: number) {
  const [classFee] = await db.select().from(classFeesTable).where(eq(classFeesTable.classId, classId)).limit(1);
  if (!classFee) return;
  await db.insert(studentFeesTable).values({
    studentId,
    totalAmount: classFee.totalAmount,
    academicYear: classFee.academicYear,
    notes: classFee.notes,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [studentFeesTable.studentId],
    set: {
      totalAmount: classFee.totalAmount,
      academicYear: classFee.academicYear,
      notes: classFee.notes,
      updatedAt: new Date(),
    },
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────
router.get("/users", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { role, search } = req.query;
    const conditions: any[] = [eq(usersTable.tenantId, tenantId)];
    if (role) conditions.push(eq(usersTable.role, role as any));

    let usersByText: typeof usersTable.$inferSelect[] = [];
    if (search && typeof search === "string" && search.trim()) {
      const term = `%${search.trim()}%`;
      // Search by name, email, or matricule (via join with student profiles)
      const nameEmailConditions = [...conditions, or(ilike(usersTable.name, term), ilike(usersTable.email, term))];
      const byText = await db.select().from(usersTable).where(and(...nameEmailConditions));

      // Also search by matricule
      const byMatricule = await db
        .select({ id: usersTable.id })
        .from(studentProfilesTable)
        .innerJoin(usersTable, eq(usersTable.id, studentProfilesTable.studentId))
        .where(and(
          eq(usersTable.tenantId, tenantId),
          ilike(studentProfilesTable.matricule, term),
          ...(role ? [eq(usersTable.role, role as any)] : [])
        ));
      const matriculeIds = new Set(byMatricule.map(r => r.id));
      const extraIds = [...matriculeIds].filter(id => !byText.some(u => u.id === id));
      let byMatriculeUsers: typeof usersTable.$inferSelect[] = [];
      if (extraIds.length) {
        byMatriculeUsers = await db.select().from(usersTable)
          .where(and(eq(usersTable.tenantId, tenantId), inArray(usersTable.id, extraIds)));
      }
      usersByText = [...byText, ...byMatriculeUsers];
    } else {
      usersByText = await db.select().from(usersTable).where(and(...conditions));
    }
    const users = usersByText;

    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId, classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId));
    const enrollmentMap = new Map(enrollments.map((e) => [e.studentId, { classId: e.classId, className: e.className }]));

    const profiles = await db.select({ studentId: studentProfilesTable.studentId, matricule: studentProfilesTable.matricule, sexe: studentProfilesTable.sexe }).from(studentProfilesTable);
    const profileMap = new Map(profiles.map((p) => [p.studentId, { matricule: p.matricule, sexe: p.sexe }]));

    const result = users.map((u) => {
      const enroll = enrollmentMap.get(u.id);
      const prof = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        adminSubRole: u.adminSubRole ?? null,
        classId: enroll?.classId ?? null,
        className: enroll?.className ?? null,
        matricule: prof?.matricule ?? null,
        sexe: prof?.sexe ?? null,
        createdAt: u.createdAt,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── Helpers for student validation ────────────────────────────────────────────
function parseFrenchDate(dateStr: string): Date | null {
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  if (d.getFullYear() !== parseInt(yyyy) || d.getMonth() !== parseInt(mm) - 1 || d.getDate() !== parseInt(dd)) return null;
  return d;
}
function isValidStudentPhone(phone: string): boolean {
  // At least 7 digits; may contain +, spaces, dashes, dots, parentheses
  return /^\+?[\d\s\(\)\-\.]{7,25}$/.test(phone) && /\d{7,}/.test(phone.replace(/\D/g, ""));
}

router.post("/users", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    const { email, name, firstName, lastName, password, role, adminSubRole, classId, phone,
            matricule, dateNaissance, lieuNaissance, parentName, parentPhone, sexe } = req.body;

    // ── Generic required fields ────────────────────────────────────────────
    const resolvedName = (role === "student" && (firstName || lastName))
      ? `${(firstName ?? "").trim()} ${(lastName ?? "").trim()}`.trim()
      : name;

    if (!email?.trim() || !resolvedName?.trim() || !password || !role) {
      res.status(400).json({ error: "Bad Request", message: "Les champs nom, email, mot de passe et rôle sont obligatoires." });
      return;
    }

    // ── Student-specific validation ────────────────────────────────────────
    if (role === "student") {
      if (!firstName?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le prénom est obligatoire." });
        return;
      }
      if (!lastName?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le nom est obligatoire." });
        return;
      }
      if (!matricule?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le matricule est obligatoire pour un étudiant." });
        return;
      }
      if (!dateNaissance?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "La date de naissance est obligatoire." });
        return;
      }
      const parsedDOB = parseFrenchDate(dateNaissance.trim());
      if (!parsedDOB) {
        res.status(400).json({ error: "Bad Request", message: "La date de naissance est invalide (format attendu : JJ/MM/AAAA)." });
        return;
      }
      if (parsedDOB >= new Date()) {
        res.status(400).json({ error: "Bad Request", message: "La date de naissance doit être antérieure à aujourd'hui." });
        return;
      }
      if (!lieuNaissance?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le lieu de naissance est obligatoire." });
        return;
      }
      if (!parentName?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le nom du parent/tuteur est obligatoire." });
        return;
      }
      if (!parentPhone?.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Le contact du parent/tuteur est obligatoire." });
        return;
      }
      if (!isValidStudentPhone(parentPhone.trim())) {
        res.status(400).json({ error: "Bad Request", message: "Le contact du parent/tuteur n'est pas un numéro de téléphone valide." });
        return;
      }
      // Matricule uniqueness check
      const existingMatricule = await db
        .select({ id: studentProfilesTable.studentId })
        .from(studentProfilesTable)
        .where(eq(studentProfilesTable.matricule, matricule.trim()))
        .limit(1);
      if (existingMatricule.length > 0) {
        res.status(409).json({ error: "Conflict", message: "Ce matricule est déjà utilisé par un autre étudiant." });
        return;
      }
    }

    // ── Access control ─────────────────────────────────────────────────────
    if (role === "admin" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Forbidden", message: "Seul le Directeur du Centre peut créer un compte administrateur." });
      return;
    }
    if (role === "teacher" && cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden", message: "La Responsable Scolarité ne peut créer que des comptes étudiants." });
      return;
    }

    const passwordHash = hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      tenantId: req.tenantId!,
      email: email.trim(), name: resolvedName, passwordHash, role,
      adminSubRole: role === "admin" ? (adminSubRole ?? null) : null,
      mustChangePassword: true,
    }).returning();

    if (classId && role === "student") {
      await db.insert(classEnrollmentsTable).values({ studentId: user.id, classId }).onConflictDoNothing();
      await applyClassFeeToStudent(user.id, classId);
    }

    if (role === "student") {
      await db.insert(studentProfilesTable).values({
        studentId: user.id,
        matricule: matricule.trim(),
        dateNaissance: dateNaissance.trim(),
        lieuNaissance: lieuNaissance.trim(),
        parentName: parentName.trim(),
        parentPhone: parentPhone.trim(),
        sexe: sexe?.trim() || null,
      }).onConflictDoNothing();
    }

    const enroll = classId ? await db.select({ className: classesTable.name }).from(classesTable).where(eq(classesTable.id, classId)).limit(1) : [];
    res.status(201).json({
      id: user.id, email: user.email, name: user.name, role: user.role,
      adminSubRole: user.adminSubRole ?? null,
      classId: classId ?? null, className: enroll[0]?.className ?? null,
      matricule: matricule?.trim() || null,
      createdAt: user.createdAt,
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Un compte avec cet email existe déjà." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }
    const [enroll] = await db.select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable).innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, id)).limit(1);
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, adminSubRole: user.adminSubRole ?? null, classId: enroll?.classId ?? null, className: enroll?.className ?? null, createdAt: user.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = parseInt(req.params.id);
    const { email, name, password, role, adminSubRole, classId } = req.body;
    const updates: any = {};
    if (email) updates.email = email;
    if (name) updates.name = name;
    if (password) updates.passwordHash = hashPassword(password);
    if (role) updates.role = role;
    if (adminSubRole !== undefined) updates.adminSubRole = adminSubRole;
    if (role && role !== "admin") updates.adminSubRole = null;
    updates.updatedAt = new Date();

    const [user] = await db.update(usersTable).set(updates).where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId))).returning();
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    if (classId !== undefined) {
      await db.delete(classEnrollmentsTable).where(eq(classEnrollmentsTable.studentId, id));
      if (classId !== null && user.role === "student") {
        await db.insert(classEnrollmentsTable).values({ studentId: id, classId }).onConflictDoNothing();
        await applyClassFeeToStudent(id, classId);
      }
    }

    const [enroll] = await db.select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
      .from(classEnrollmentsTable).innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, id)).limit(1);

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, adminSubRole: user.adminSubRole ?? null, classId: enroll?.classId ?? null, className: enroll?.className ?? null, createdAt: user.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:id", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = parseInt(req.params.id);
    const currentUser = req.session.user!;

    // Personne ne peut supprimer son propre compte
    if (id === currentUser.id) {
      res.status(403).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
      return;
    }

    // Restrictions selon le sous-rôle (le Directeur peut tout supprimer sauf lui-même)
    if (currentUser.adminSubRole === "planificateur" || currentUser.adminSubRole === "scolarite") {
      const [target] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
      if (target && target.role === "admin") {
        res.status(403).json({ error: "Action non autorisée : suppression d'un administrateur interdite." });
        return;
      }
      if (currentUser.adminSubRole === "planificateur" && target && target.role === "student") {
        res.status(403).json({ error: "Un responsable pédagogique ne peut pas supprimer un étudiant." });
        return;
      }
      if (currentUser.adminSubRole === "scolarite" && target && target.role === "teacher") {
        res.status(403).json({ error: "Un(e) assistant(e) de direction ne peut pas supprimer un enseignant." });
        return;
      }
    }

    await db.delete(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student Extended Profile (contact + parents) ────────────────────────────
router.get("/students/:id/profile", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, id)).limit(1);
    res.json(profile ?? { studentId: id, phone: null, address: null, parentName: null, parentPhone: null, parentEmail: null, parentAddress: null, photoUrl: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/students/:id/profile", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { phone, address, parentName, parentPhone, parentEmail, parentAddress, matricule, dateNaissance, lieuNaissance, sexe } = req.body;
    const [existing] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.studentId, id)).limit(1);
    const data: any = {
      matricule: matricule?.trim() || null,
      dateNaissance: dateNaissance?.trim() || null,
      lieuNaissance: lieuNaissance?.trim() || null,
      phone: phone ?? null, address: address ?? null,
      parentName: parentName ?? null, parentPhone: parentPhone ?? null,
      parentEmail: parentEmail ?? null, parentAddress: parentAddress ?? null,
      sexe: sexe?.trim() || null,
      updatedAt: new Date(),
    };
    let profile;
    if (existing) {
      [profile] = await db.update(studentProfilesTable).set(data).where(eq(studentProfilesTable.studentId, id)).returning();
    } else {
      [profile] = await db.insert(studentProfilesTable).values({ studentId: id, ...data }).returning();
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Classes ─────────────────────────────────────────────────────────────────
router.get("/classes", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { asc } = await import("drizzle-orm");
    const classes = await db.select().from(classesTable)
      .where(eq(classesTable.tenantId, tenantId))
      .orderBy(asc(classesTable.orderIndex), asc(classesTable.id));
    const classIds = classes.map(c => c.id);
    const enrollCounts = classIds.length ? await db
      .select({ classId: classEnrollmentsTable.classId, cnt: count(classEnrollmentsTable.studentId) })
      .from(classEnrollmentsTable)
      .where(inArray(classEnrollmentsTable.classId, classIds))
      .groupBy(classEnrollmentsTable.classId) : [];
    const countMap = new Map(enrollCounts.map((e) => [e.classId, Number(e.cnt)]));

    const genderRows = classIds.length ? await db
      .select({
        classId: classEnrollmentsTable.classId,
        garcons: sql<number>`COUNT(CASE WHEN ${studentProfilesTable.sexe} = 'M' THEN 1 END)::int`,
        filles: sql<number>`COUNT(CASE WHEN ${studentProfilesTable.sexe} = 'F' THEN 1 END)::int`,
      })
      .from(classEnrollmentsTable)
      .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, classEnrollmentsTable.studentId))
      .where(inArray(classEnrollmentsTable.classId, classIds))
      .groupBy(classEnrollmentsTable.classId) : [];
    const genderMap = new Map(genderRows.map((r) => [Number(r.classId), { garcons: Number(r.garcons ?? 0), filles: Number(r.filles ?? 0) }]));

    const result = classes.map((c) => ({
      ...c,
      studentCount: countMap.get(c.id) ?? 0,
      garcons: genderMap.get(c.id)?.garcons ?? 0,
      filles: genderMap.get(c.id)?.filles ?? 0,
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/classes", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const cu = req.session?.user as any;
    if (cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden", message: "La Responsable Scolarité ne peut pas créer de classe." });
      return;
    }
    const { name, description, filiere } = req.body;
    if (!name) { res.status(400).json({ error: "Bad Request", message: "Name is required" }); return; }
    const existing = await db.select({ o: classesTable.orderIndex }).from(classesTable).where(eq(classesTable.tenantId, tenantId));
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((c) => c.o)) : 0;
    const [cls] = await db.insert(classesTable).values({ tenantId, name, description, filiere: filiere?.trim() || null, orderIndex: maxOrder + 1 }).returning();
    res.status(201).json({ ...cls, studentCount: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Move a class up or down
router.post("/classes/:id/move", requireRole("admin"), async (req, res) => {
  try {
    const { asc } = await import("drizzle-orm");
    const id = parseInt(req.params.id);
    const { direction } = req.body as { direction: "up" | "down" };
    if (!["up", "down"].includes(direction)) {
      res.status(400).json({ error: "direction must be 'up' or 'down'" });
      return;
    }
    const allClasses = await db.select({ id: classesTable.id, orderIndex: classesTable.orderIndex })
      .from(classesTable).orderBy(asc(classesTable.orderIndex), asc(classesTable.id));
    const idx = allClasses.findIndex((c) => c.id === id);
    if (idx === -1) { res.status(404).json({ error: "Not Found" }); return; }
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= allClasses.length) {
      res.json({ message: "Already at boundary" }); return;
    }
    const current = allClasses[idx];
    const other = allClasses[swapIdx];
    // Swap orderIndex values
    await db.update(classesTable).set({ orderIndex: other.orderIndex }).where(eq(classesTable.id, current.id));
    await db.update(classesTable).set({ orderIndex: current.orderIndex }).where(eq(classesTable.id, other.id));
    res.json({ message: "Moved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/classes/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, nextClassId, isTerminal, filiere } = req.body;
    const updateData: any = { name, description };
    if (filiere !== undefined) updateData.filiere = filiere?.trim() || null;
    if (nextClassId !== undefined) {
      updateData.nextClassId = nextClassId === null || nextClassId === "" ? null : parseInt(nextClassId);
    }
    if (isTerminal !== undefined) {
      updateData.isTerminal = Boolean(isTerminal);
      if (updateData.isTerminal) updateData.nextClassId = null; // terminal classes cannot promote
    }
    const [cls] = await db.update(classesTable).set(updateData).where(eq(classesTable.id, id)).returning();
    if (!cls) { res.status(404).json({ error: "Not Found" }); return; }
    const [ec] = await db.select({ cnt: count() }).from(classEnrollmentsTable).where(eq(classEnrollmentsTable.classId, id));
    res.json({ ...cls, studentCount: Number(ec?.cnt ?? 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/classes/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(classesTable).where(eq(classesTable.id, id));
    res.json({ message: "Class deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/classes/:id/students", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const students = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .where(eq(classEnrollmentsTable.classId, id));
    res.json(students.map((s) => ({ ...s, classId: id, className: null })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Subjects ─────────────────────────────────────────────────────────────────
async function enrichSubjects(subjects: any[]) {
  const classes = await db.select().from(classesTable);
  const semesters = await db.select().from(semestersTable);
  const ues = await db.select().from(teachingUnitsTable);
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const semesterMap = new Map(semesters.map((s) => [s.id, s.name]));
  const ueMap = new Map(ues.map((u) => [u.id, u]));
  const assignments = await db.select({
    subjectId: teacherAssignmentsTable.subjectId,
    teacherId: teacherAssignmentsTable.teacherId,
    teacherName: usersTable.name,
  }).from(teacherAssignmentsTable).innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId));
  const assignMap = new Map(assignments.map((a) => [a.subjectId, { teacherId: a.teacherId, teacherName: a.teacherName }]));
  return subjects.map((s) => {
    const ue = s.ueId ? ueMap.get(s.ueId) : null;
    return {
      ...s,
      className: s.classId ? (classMap.get(s.classId) ?? null) : null,
      semesterName: s.semesterId ? (semesterMap.get(s.semesterId) ?? null) : null,
      ueCode: ue?.code ?? null,
      ueName: ue?.name ?? null,
      teacherId: assignMap.get(s.id)?.teacherId ?? null,
      teacherName: assignMap.get(s.id)?.teacherName ?? null,
    };
  });
}

router.get("/subjects", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const subjects = await db.select().from(subjectsTable).where(eq(subjectsTable.tenantId, tenantId));
    res.json(await enrichSubjects(subjects));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/subjects", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const cu = req.session?.user as any;
    if (cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden", message: "La Responsable Scolarité ne peut pas créer de matière." });
      return;
    }
    const { name, coefficient, credits, description, ueId, classId, semesterId } = req.body;
    if (!name || coefficient === undefined) { res.status(400).json({ error: "Bad Request", message: "Name and coefficient are required" }); return; }
    const [subj] = await db.insert(subjectsTable).values({ tenantId, name, coefficient, credits: credits ?? null, description, ueId: ueId ?? null, classId: classId ?? null, semesterId: semesterId ?? null }).returning();
    const [enriched] = await enrichSubjects([subj]);
    res.status(201).json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/subjects/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, coefficient, credits, description, ueId, classId, semesterId } = req.body;
    const [subj] = await db.update(subjectsTable).set({ name, coefficient, credits: credits ?? null, description, ueId: ueId ?? null, classId: classId ?? null, semesterId: semesterId ?? null }).where(eq(subjectsTable.id, id)).returning();
    if (!subj) { res.status(404).json({ error: "Not Found" }); return; }
    const [enriched] = await enrichSubjects([subj]);
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/subjects/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(subjectsTable).where(eq(subjectsTable.id, id));
    res.json({ message: "Subject deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teaching Units (UE) ──────────────────────────────────────────────────────
router.get("/teaching-units", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { classId, semesterId } = req.query;
    const conditions: any[] = [eq(teachingUnitsTable.tenantId, tenantId)];
    if (classId) conditions.push(eq(teachingUnitsTable.classId, parseInt(classId as string)));
    if (semesterId) conditions.push(eq(teachingUnitsTable.semesterId, parseInt(semesterId as string)));
    const ues = await db.select().from(teachingUnitsTable).where(and(...conditions));
    const classes = await db.select().from(classesTable).where(eq(classesTable.tenantId, tenantId));
    const semesters = await db.select().from(semestersTable).where(eq(semestersTable.tenantId, tenantId));
    const classMap = new Map(classes.map((c) => [c.id, c.name]));
    const semesterMap = new Map(semesters.map((s) => [s.id, s.name]));
    res.json(ues.map(u => ({
      ...u,
      className: u.classId ? (classMap.get(u.classId) ?? null) : null,
      semesterName: u.semesterId ? (semesterMap.get(u.semesterId) ?? null) : null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/teaching-units", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const cu = req.session?.user as any;
    if (cu?.adminSubRole === "scolarite") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { code, name, category, credits, coefficient, classId, semesterId } = req.body;
    if (!code || !name || coefficient === undefined) {
      res.status(400).json({ error: "Bad Request", message: "code, name and coefficient are required" }); return;
    }
    const [ue] = await db.insert(teachingUnitsTable).values({ tenantId, code, name, category: category ?? null, credits: credits ?? coefficient, coefficient, classId: classId ?? null, semesterId: semesterId ?? null }).returning();
    const cls = classId ? await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, classId)).limit(1) : [];
    const sem = semesterId ? await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1) : [];
    res.status(201).json({ ...ue, className: cls[0]?.name ?? null, semesterName: sem[0]?.name ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/teaching-units/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { code, name, category, credits, coefficient, classId, semesterId } = req.body;
    const [ue] = await db.update(teachingUnitsTable).set({ code, name, category: category ?? null, credits: credits ?? coefficient, coefficient, classId: classId ?? null, semesterId: semesterId ?? null }).where(eq(teachingUnitsTable.id, id)).returning();
    if (!ue) { res.status(404).json({ error: "Not Found" }); return; }
    const cls = ue.classId ? await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, ue.classId)).limit(1) : [];
    const sem = ue.semesterId ? await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, ue.semesterId)).limit(1) : [];
    res.json({ ...ue, className: cls[0]?.name ?? null, semesterName: sem[0]?.name ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/teaching-units/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(teachingUnitsTable).where(eq(teachingUnitsTable.id, id));
    res.json({ message: "Teaching unit deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Semesters ────────────────────────────────────────────────────────────────
router.get("/semesters", requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select({
        id: semestersTable.id,
        name: semestersTable.name,
        academicYear: semestersTable.academicYear,
        published: semestersTable.published,
        startDate: semestersTable.startDate,
        endDate: semestersTable.endDate,
        classId: semestersTable.classId,
        semesterNumber: semestersTable.semesterNumber,
        niveauLmd: semestersTable.niveauLmd,
        createdAt: semestersTable.createdAt,
        className: classesTable.name,
        classFiliere: classesTable.filiere,
      })
      .from(semestersTable)
      .leftJoin(classesTable, eq(semestersTable.classId, classesTable.id))
      .where(eq(semestersTable.tenantId, tenantId))
      .orderBy(semestersTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/semesters", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, academicYear, startDate, endDate, classId, semesterNumber, niveauLmd } = req.body;
    if (!name || !academicYear) { res.status(400).json({ error: "Bad Request", message: "Name and academicYear are required" }); return; }

    if (classId && semesterNumber) {
      const existing = await db
        .select({ id: semestersTable.id })
        .from(semestersTable)
        .where(
          and(
            eq(semestersTable.classId, classId),
            eq(semestersTable.academicYear, academicYear),
            eq(semestersTable.semesterNumber, semesterNumber)
          )
        );
      if (existing.length > 0) {
        res.status(409).json({ error: `Cette classe possède déjà un semestre n°${semesterNumber} pour l'année ${academicYear}.` });
        return;
      }

      const countForClass = await db
        .select({ id: semestersTable.id })
        .from(semestersTable)
        .where(
          and(
            eq(semestersTable.classId, classId),
            eq(semestersTable.academicYear, academicYear)
          )
        );
      if (countForClass.length >= 2) {
        res.status(409).json({ error: "Cette classe possède déjà 2 semestres pour cette année académique." });
        return;
      }

      if (startDate && endDate) {
        const overlap = await db
          .select({ id: semestersTable.id, name: semestersTable.name })
          .from(semestersTable)
          .where(
            and(
              eq(semestersTable.classId, classId),
              eq(semestersTable.academicYear, academicYear),
              lte(semestersTable.startDate, endDate),
              gte(semestersTable.endDate, startDate)
            )
          );
        if (overlap.length > 0) {
          res.status(409).json({ error: `Les dates chevauchent le semestre "${overlap[0].name}".` });
          return;
        }
      }
    }

    const [sem] = await db.insert(semestersTable).values({
      tenantId,
      name,
      academicYear,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      classId: classId ?? null,
      semesterNumber: semesterNumber ?? null,
      niveauLmd: niveauLmd ?? null,
    }).returning();
    res.status(201).json(sem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/semesters/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, academicYear, startDate, endDate, classId, semesterNumber, niveauLmd } = req.body;

    if (classId && semesterNumber && academicYear) {
      const existing = await db
        .select({ id: semestersTable.id })
        .from(semestersTable)
        .where(
          and(
            eq(semestersTable.classId, classId),
            eq(semestersTable.academicYear, academicYear),
            eq(semestersTable.semesterNumber, semesterNumber),
            ne(semestersTable.id, id)
          )
        );
      if (existing.length > 0) {
        res.status(409).json({ error: `Cette classe possède déjà un semestre n°${semesterNumber} pour l'année ${academicYear}.` });
        return;
      }

      const countForClass = await db
        .select({ id: semestersTable.id })
        .from(semestersTable)
        .where(
          and(
            eq(semestersTable.classId, classId),
            eq(semestersTable.academicYear, academicYear),
            ne(semestersTable.id, id)
          )
        );
      if (countForClass.length >= 2) {
        res.status(409).json({ error: "Cette classe possède déjà 2 semestres pour cette année académique." });
        return;
      }

      if (startDate && endDate) {
        const overlap = await db
          .select({ id: semestersTable.id, name: semestersTable.name })
          .from(semestersTable)
          .where(
            and(
              eq(semestersTable.classId, classId),
              eq(semestersTable.academicYear, academicYear),
              ne(semestersTable.id, id),
              lte(semestersTable.startDate, endDate),
              gte(semestersTable.endDate, startDate)
            )
          );
        if (overlap.length > 0) {
          res.status(409).json({ error: `Les dates chevauchent le semestre "${overlap[0].name}".` });
          return;
        }
      }
    }

    const [sem] = await db.update(semestersTable).set({
      name,
      academicYear,
      startDate,
      endDate,
      classId: classId ?? null,
      semesterNumber: semesterNumber ?? null,
      niveauLmd: niveauLmd ?? null,
    }).where(eq(semestersTable.id, id)).returning();
    if (!sem) { res.status(404).json({ error: "Not Found" }); return; }
    res.json(sem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/semesters/:id/publish", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "La publication des résultats est réservée au Directeur du Centre et à la Responsable Scolarité." });
      return;
    }
    const id = parseInt(req.params.id);
    const { published } = req.body;
    const [sem] = await db.update(semestersTable).set({ published: !!published }).where(eq(semestersTable.id, id)).returning();
    if (!sem) { res.status(404).json({ error: "Not Found" }); return; }
    // Log to activity
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: published ? "publication_resultats" : "depublication_resultats",
      details: `Semestre ID ${id} — résultats ${published ? "publiés" : "dépubliés"}.`,
    });
    // Notify all enrolled students when results are published
    if (published) {
      const tenantId = req.tenantId!;
      const allClasses = await db.select({ id: classesTable.id }).from(classesTable).where(eq(classesTable.tenantId, tenantId));
      const classIds = allClasses.map(c => c.id);
      notifyStudentsOfClasses(
        classIds,
        "results_published",
        "Résultats disponibles",
        `Les résultats du semestre "${sem.name}" (${sem.academicYear}) sont désormais disponibles. Consultez votre espace étudiant.`
      ).catch(console.error);
      // Notify parents
      notifyParentsOfResults(sem.name, sem.academicYear, tenantId).catch(console.error);
    }
    res.json(sem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Promote admitted students to next class
router.post("/semesters/:id/promote", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." });
      return;
    }
    const semesterId = parseInt(req.params.id);
    const { classId: classIdParam } = req.body;
    if (!classIdParam) {
      res.status(400).json({ error: "classId requis." });
      return;
    }
    const classId = parseInt(classIdParam);

    // Fetch class and its next class
    const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId)).limit(1);
    if (!cls) { res.status(404).json({ error: "Classe introuvable." }); return; }
    if (cls.isTerminal) {
      res.status(400).json({ error: "Cette classe est marquée comme fin de cycle. Aucune promotion possible." });
      return;
    }
    if (!cls.nextClassId) {
      res.status(400).json({ error: "Aucune classe supérieure configurée pour cette classe." });
      return;
    }
    const nextClassId = cls.nextClassId;

    // Get all semesters of the same academic year (Rule 4: student must pass ALL semesters)
    const [currentSem] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);
    if (!currentSem) { res.status(404).json({ error: "Semestre introuvable." }); return; }

    const yearSemesters = await db
      .select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, currentSem.academicYear));

    // Get all students in this class
    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.classId, classId));

    const promoted: { id: number; name: string }[] = [];
    const notPromoted: { name: string; reason: string }[] = [];

    for (const { studentId } of enrollments) {
      // Rule 4: student must be "Admis" in ALL semesters of the academic year
      let isAnnuallyAdmis = true;
      const semesterDetails: string[] = [];

      for (const sem of yearSemesters) {
        const result = await computeStudentResult(studentId, sem.id);
        if (!result || result.decision !== "Admis") {
          isAnnuallyAdmis = false;
          semesterDetails.push(`${sem.name}: ${result?.decision ?? "Non calculé"}`);
        }
      }

      if (!isAnnuallyAdmis) {
        const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        notPromoted.push({ name: student?.name ?? "Étudiant inconnu", reason: semesterDetails.join(", ") });
        continue;
      }

      // Remove from current class
      await db.delete(classEnrollmentsTable).where(
        and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.classId, classId))
      );
      // Insert into next class (ignore if already enrolled)
      await db.insert(classEnrollmentsTable).values({ studentId, classId: nextClassId }).onConflictDoNothing();

      const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
      promoted.push({ id: studentId, name: student?.name ?? "Étudiant inconnu" });
    }

    // Log activity
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "promotion_etudiants",
      details: `${promoted.length} étudiant(s) promus de "${cls.name}" vers la classe supérieure (année ${currentSem.academicYear}). Non promus: ${notPromoted.length}.`,
    });

    res.json({ promoted, fromClass: cls.name, toClassId: nextClassId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Annual Promotion ─────────────────────────────────────────────────────────

async function computeAnnualDecision(studentId: number, yearSemesters: { id: number; name: string }[]): Promise<{ decision: "Admis" | "Ajourné" | "En attente"; semesterDecisions: string[] }> {
  const semesterDecisions: string[] = [];
  let hasAjourné = false;
  let hasPending = false;
  for (const sem of yearSemesters) {
    const result = await computeStudentResult(studentId, sem.id);
    const d = result?.decision ?? "En attente";
    semesterDecisions.push(`${sem.name}: ${d}`);
    if (d === "Ajourné") hasAjourné = true;
    if (d === "En attente") hasPending = true;
  }
  const decision = hasAjourné ? "Ajourné" : hasPending ? "En attente" : "Admis";
  return { decision, semesterDecisions };
}

// GET /admin/annual-promotion/preview?academicYear=X — preview without changes
router.get("/annual-promotion/preview", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." }); return;
    }
    const { academicYear } = req.query;
    if (!academicYear) { res.status(400).json({ error: "academicYear requis." }); return; }

    const yearSemesters = await db
      .select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear as string));

    if (yearSemesters.length === 0) {
      res.status(404).json({ error: "Aucun semestre trouvé pour cette année académique." }); return;
    }

    const allClasses = await db.select().from(classesTable);
    const promotableClasses = allClasses.filter(c => !c.isTerminal && c.nextClassId);

    const classResults = await Promise.all(promotableClasses.map(async (cls) => {
      const nextCls = allClasses.find(c => c.id === cls.nextClassId);
      const enrollments = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, cls.id));

      const students = await Promise.all(enrollments.map(async ({ studentId }) => {
        const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        const { decision, semesterDecisions } = await computeAnnualDecision(studentId, yearSemesters);
        return { id: studentId, name: user?.name ?? "—", decision, semesterDecisions };
      }));

      return {
        classId: cls.id,
        className: cls.name,
        nextClassId: cls.nextClassId,
        nextClassName: nextCls?.name ?? "—",
        students,
        admittedCount: students.filter(s => s.decision === "Admis").length,
        deferredCount: students.filter(s => s.decision === "Ajourné").length,
        pendingCount: students.filter(s => s.decision === "En attente").length,
      };
    }));

    res.json({ academicYear, semesters: yearSemesters.map(s => s.name), classes: classResults });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion — launch full annual promotion for all classes
router.post("/annual-promotion", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." }); return;
    }
    const { academicYear } = req.body;
    if (!academicYear) { res.status(400).json({ error: "academicYear requis." }); return; }

    const yearSemesters = await db
      .select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear as string));

    if (yearSemesters.length === 0) {
      res.status(404).json({ error: "Aucun semestre trouvé pour cette année académique." }); return;
    }

    const allClasses = await db.select().from(classesTable);
    const promotableClasses = allClasses.filter(c => !c.isTerminal && c.nextClassId);

    const results = [];
    let totalPromoted = 0;

    for (const cls of promotableClasses) {
      const nextCls = allClasses.find(c => c.id === cls.nextClassId)!;
      const enrollments = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, cls.id));

      const promoted: { id: number; name: string }[] = [];
      const notPromoted: { name: string; reason: string }[] = [];

      for (const { studentId } of enrollments) {
        const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        const { decision, semesterDecisions } = await computeAnnualDecision(studentId, yearSemesters);

        if (decision === "Admis") {
          await db.delete(classEnrollmentsTable).where(
            and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.classId, cls.id))
          );
          await db.insert(classEnrollmentsTable).values({ studentId, classId: cls.nextClassId! }).onConflictDoNothing();
          promoted.push({ id: studentId, name: user?.name ?? "—" });
        } else {
          notPromoted.push({ name: user?.name ?? "—", reason: semesterDecisions.join(", ") });
        }
      }

      totalPromoted += promoted.length;
      results.push({
        classId: cls.id,
        className: cls.name,
        nextClassId: cls.nextClassId!,
        nextClassName: nextCls?.name ?? "—",
        promoted,
        notPromoted,
      });
    }

    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "promotion_annuelle",
      details: `Promotion annuelle ${academicYear} : ${totalPromoted} étudiant(s) promu(s) sur ${promotableClasses.length} classe(s).`,
    });

    res.json({ academicYear, results, totalPromoted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion/rollback — reverse a previously launched promotion
router.post("/annual-promotion/rollback", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." }); return;
    }

    // Expects: { academicYear, results: [{classId, nextClassId, promoted: [{id}]}] }
    const { academicYear, results } = req.body as {
      academicYear: string;
      results: { classId: number; nextClassId: number; promoted: { id: number; name: string }[] }[];
    };

    if (!academicYear || !Array.isArray(results)) {
      res.status(400).json({ error: "Données de révocation invalides." }); return;
    }

    let totalReverted = 0;

    for (const entry of results) {
      for (const student of entry.promoted) {
        // Remove from promoted class
        await db.delete(classEnrollmentsTable).where(
          and(eq(classEnrollmentsTable.studentId, student.id), eq(classEnrollmentsTable.classId, entry.nextClassId))
        );
        // Restore to original class
        await db.insert(classEnrollmentsTable).values({ studentId: student.id, classId: entry.classId }).onConflictDoNothing();
        totalReverted++;
      }
    }

    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "revocation_promotion_annuelle",
      details: `Révocation promotion annuelle ${academicYear} : ${totalReverted} étudiant(s) remis dans leur classe d'origine.`,
    });

    res.json({ ok: true, totalReverted, academicYear });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Archive & Initialize Year ────────────────────────────────────────────────

// GET /admin/archives — list all archived academic years
router.get("/archives", requireRole("admin"), async (req, res) => {
  try {
    const archives = await db
      .select()
      .from(academicYearArchivesTable)
      .orderBy(desc(academicYearArchivesTable.archivedAt));
    res.json(archives);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /admin/archives/:academicYear — detailed view of an archived year
router.get("/archives/:academicYear", requireRole("admin"), async (req, res) => {
  try {
    const { academicYear } = req.params;
    const [archive] = await db
      .select()
      .from(academicYearArchivesTable)
      .where(eq(academicYearArchivesTable.academicYear, academicYear))
      .limit(1);
    if (!archive) { res.status(404).json({ error: "Archive non trouvée." }); return; }

    // Fetch all semesters of this year
    const semesters = await db
      .select()
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear))
      .orderBy(semestersTable.id);

    // Fetch all classes (just names for reference)
    const classes = await db.select({ id: classesTable.id, name: classesTable.name }).from(classesTable);

    // Fetch all enrollments active during this year (students)
    const enrollments = await db
      .select({
        studentId: classEnrollmentsTable.studentId,
        studentName: usersTable.name,
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
      })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId));

    const semesterIds = semesters.map((s) => s.id);

    // Fetch grades aggregated per student per semester
    let gradeRows: { studentId: number; semesterId: number; average: number | null; decision: string | null }[] = [];
    if (semesterIds.length > 0) {
      const rawGrades = await db
        .select({
          studentId: gradesTable.studentId,
          semesterId: gradesTable.semesterId,
          grade: gradesTable.grade,
          coefficient: subjectsTable.coefficient,
        })
        .from(gradesTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
        .where(inArray(gradesTable.semesterId, semesterIds));

      // Compute averages per student per semester
      const map = new Map<string, { sum: number; totalCoef: number }>();
      for (const row of rawGrades) {
        if (row.grade === null || row.grade === undefined) continue;
        const key = `${row.studentId}-${row.semesterId}`;
        const entry = map.get(key) ?? { sum: 0, totalCoef: 0 };
        entry.sum += Number(row.grade) * Number(row.coefficient || 1);
        entry.totalCoef += Number(row.coefficient || 1);
        map.set(key, entry);
      }
      for (const [key, { sum, totalCoef }] of map.entries()) {
        const [studentId, semesterId] = key.split("-").map(Number);
        const average = totalCoef > 0 ? parseFloat((sum / totalCoef).toFixed(2)) : null;
        const decision = average === null ? null : average >= 10 ? "Admis" : "Ajourné";
        gradeRows.push({ studentId, semesterId, average, decision });
      }
    }

    res.json({
      archive,
      semesters,
      classes,
      enrollments,
      grades: gradeRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion/archive — mark an academic year as archived
router.post("/annual-promotion/archive", requireRole("admin"), async (req, res) => {
  try {
    const { academicYear } = req.body as { academicYear: string };
    if (!academicYear) { res.status(400).json({ error: "academicYear requis." }); return; }

    // Check year exists (has semesters)
    const yearSemesters = await db
      .select({ id: semestersTable.id })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear));
    if (yearSemesters.length === 0) { res.status(400).json({ error: "Aucun semestre trouvé pour cette année." }); return; }

    // Check not already archived
    const [existing] = await db
      .select()
      .from(academicYearArchivesTable)
      .where(eq(academicYearArchivesTable.academicYear, academicYear))
      .limit(1);
    if (existing) { res.status(409).json({ error: "Cette année est déjà archivée." }); return; }

    const userId = (req.session as any)?.userId;
    const [archive] = await db
      .insert(academicYearArchivesTable)
      .values({ academicYear, archivedById: userId ?? null })
      .returning();

    await db.insert(activityLogTable).values({
      userId: userId ?? null,
      action: "archive_year",
      targetType: "academic_year",
      targetId: null,
      details: `Année académique ${academicYear} archivée.`,
    });

    res.json(archive);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion/initialize-year — create semesters for new academic year
router.post("/annual-promotion/initialize-year", requireRole("admin"), async (req, res) => {
  try {
    const { fromAcademicYear, toAcademicYear } = req.body as {
      fromAcademicYear: string;
      toAcademicYear: string;
    };
    if (!fromAcademicYear || !toAcademicYear) {
      res.status(400).json({ error: "fromAcademicYear et toAcademicYear requis." });
      return;
    }
    if (fromAcademicYear === toAcademicYear) {
      res.status(400).json({ error: "L'année cible doit être différente de l'année source." });
      return;
    }

    // Verify archive exists for fromYear
    const [archive] = await db
      .select()
      .from(academicYearArchivesTable)
      .where(eq(academicYearArchivesTable.academicYear, fromAcademicYear))
      .limit(1);
    if (!archive) {
      res.status(400).json({ error: "L'année source doit d'abord être archivée avant l'initialisation." });
      return;
    }

    // Check target year doesn't already have semesters
    const existing = await db
      .select({ id: semestersTable.id })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, toAcademicYear));
    if (existing.length > 0) {
      res.status(409).json({ error: `L'année ${toAcademicYear} possède déjà des semestres.` });
      return;
    }

    // Copy semester names from the source year
    const sourceSemesters = await db
      .select()
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, fromAcademicYear))
      .orderBy(semestersTable.id);

    const userId = (req.session as any)?.userId;

    const newSemesters = await db
      .insert(semestersTable)
      .values(
        sourceSemesters.map((s) => ({
          name: s.name.replace(fromAcademicYear, toAcademicYear),
          academicYear: toAcademicYear,
          published: false,
          classId: s.classId,
          semesterNumber: s.semesterNumber,
          niveauLmd: s.niveauLmd,
        }))
      )
      .returning();

    // Update archive record with new year info
    await db
      .update(academicYearArchivesTable)
      .set({ newAcademicYear: toAcademicYear, initializedAt: new Date(), initializedById: userId ?? null })
      .where(eq(academicYearArchivesTable.academicYear, fromAcademicYear));

    await db.insert(activityLogTable).values({
      userId: userId ?? null,
      action: "initialize_year",
      targetType: "academic_year",
      targetId: null,
      details: `Nouvelle année académique ${toAcademicYear} initialisée (${newSemesters.length} semestre(s) créé(s)).`,
    });

    res.json({ ok: true, toAcademicYear, semestersCreated: newSemesters.length, semesters: newSemesters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/annual-promotion/close-year — unified atomic year closure (Directeur only)
router.post("/annual-promotion/close-year", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Directeur du Centre." }); return;
    }
    const { academicYear, toAcademicYear } = req.body as { academicYear: string; toAcademicYear: string };
    if (!academicYear || !toAcademicYear) {
      res.status(400).json({ error: "academicYear et toAcademicYear requis." }); return;
    }
    if (academicYear === toAcademicYear) {
      res.status(400).json({ error: "L'année cible doit être différente de l'année source." }); return;
    }

    // 1. Get semesters for this year
    const yearSemesters = await db
      .select({ id: semestersTable.id, name: semestersTable.name })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, academicYear));
    if (yearSemesters.length === 0) {
      res.status(404).json({ error: "Aucun semestre trouvé pour cette année académique." }); return;
    }

    // 2. Get all classes
    const allClasses = await db.select().from(classesTable);
    const promotableClasses = allClasses.filter((c) => !c.isTerminal && c.nextClassId);
    const terminalClasses = allClasses.filter((c) => c.isTerminal);

    // 3. Run promotion for non-terminal classes
    const promotionResults: { classId: number; className: string; nextClassName: string; promoted: { id: number; name: string }[]; notPromoted: { name: string }[] }[] = [];
    let totalPromoted = 0;
    let totalNotPromoted = 0;
    let totalPending = 0;

    for (const cls of promotableClasses) {
      const nextCls = allClasses.find((c) => c.id === cls.nextClassId)!;
      const enrollments = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, cls.id));

      const promoted: { id: number; name: string }[] = [];
      const notPromoted: { name: string }[] = [];

      for (const { studentId } of enrollments) {
        const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        const { decision } = await computeAnnualDecision(studentId, yearSemesters);
        if (decision === "Admis") {
          await db.delete(classEnrollmentsTable).where(
            and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.classId, cls.id))
          );
          await db.insert(classEnrollmentsTable).values({ studentId, classId: cls.nextClassId! }).onConflictDoNothing();
          promoted.push({ id: studentId, name: user?.name ?? "—" });
          totalPromoted++;
        } else if (decision === "En attente") {
          notPromoted.push({ name: user?.name ?? "—" });
          totalPending++;
        } else {
          notPromoted.push({ name: user?.name ?? "—" });
          totalNotPromoted++;
        }
      }

      promotionResults.push({
        classId: cls.id,
        className: cls.name,
        nextClassName: nextCls?.name ?? "—",
        promoted,
        notPromoted,
      });
    }

    // 4. Identify graduates from terminal classes (admitted students in last class)
    const graduates: { id: number; name: string; className: string }[] = [];
    for (const cls of terminalClasses) {
      const enrollments = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, cls.id));

      for (const { studentId } of enrollments) {
        const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
        const { decision } = await computeAnnualDecision(studentId, yearSemesters);
        if (decision === "Admis") {
          graduates.push({ id: studentId, name: user?.name ?? "—", className: cls.name });
        }
      }
    }

    // 5. Archive the current year (idempotent)
    const [existingArchive] = await db
      .select()
      .from(academicYearArchivesTable)
      .where(eq(academicYearArchivesTable.academicYear, academicYear))
      .limit(1);
    let archiveId: number | null = existingArchive?.id ?? null;
    if (!existingArchive) {
      const [newArchive] = await db
        .insert(academicYearArchivesTable)
        .values({ academicYear, archivedById: cu.id })
        .returning();
      archiveId = newArchive?.id ?? null;
    }

    // 6. Initialize new year semesters (idempotent)
    const existingNewSems = await db
      .select({ id: semestersTable.id })
      .from(semestersTable)
      .where(eq(semestersTable.academicYear, toAcademicYear));

    let newSemestersCreated = 0;
    if (existingNewSems.length === 0) {
      const sourceSemesters = await db
        .select()
        .from(semestersTable)
        .where(eq(semestersTable.academicYear, academicYear))
        .orderBy(semestersTable.id);

      const newSems = await db
        .insert(semestersTable)
        .values(
          sourceSemesters.map((s) => ({
            name: s.name.replace(academicYear, toAcademicYear),
            academicYear: toAcademicYear,
            published: false,
            classId: s.classId,
            semesterNumber: s.semesterNumber,
            niveauLmd: s.niveauLmd,
          }))
        )
        .returning();
      newSemestersCreated = newSems.length;

      // Update archive record with new year info
      if (archiveId) {
        await db
          .update(academicYearArchivesTable)
          .set({ newAcademicYear: toAcademicYear, initializedAt: new Date(), initializedById: cu.id })
          .where(eq(academicYearArchivesTable.academicYear, academicYear));
      }
    }

    // 7. Activity log
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "cloture_annee",
      details: `Clôture ${academicYear} : ${totalPromoted} promus, ${graduates.length} diplômés, ${totalNotPromoted} ajournés. Année ${toAcademicYear} initialisée (${newSemestersCreated} semestre(s) créé(s)).`,
    });

    res.json({
      academicYear,
      toAcademicYear,
      totalPromoted,
      totalNotPromoted,
      totalPending,
      graduates,
      promotionResults,
      newSemestersCreated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Results ──────────────────────────────────────────────────────────────────
async function computeStudentResult(studentId: number, semesterId: number) {
  const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
  if (!student || !semester) return null;

  const [enroll] = await db
    .select({ classId: classEnrollmentsTable.classId, className: classesTable.name })
    .from(classEnrollmentsTable)
    .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
    .where(eq(classEnrollmentsTable.studentId, studentId))
    .limit(1);

  const classId = enroll?.classId ?? null;
  const className = enroll?.className ?? "";

  const subjects = classId
    ? await db.select().from(subjectsTable).where(
        and(
          eq(subjectsTable.classId, classId),
          eq(subjectsTable.semesterId, semesterId)
        )
      )
    : [];

  // Fetch teaching units for this class/semester
  const ues = classId
    ? await db.select().from(teachingUnitsTable).where(
        and(
          eq(teachingUnitsTable.classId, classId),
          eq(teachingUnitsTable.semesterId, semesterId)
        )
      )
    : [];

  const studentGrades = await db
    .select()
    .from(gradesTable)
    .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, semesterId)));

  // Group evaluations by subject and compute average
  const gradeMap = new Map<number, { value: number; evaluations: { evaluationNumber: number; value: number }[] }>();
  for (const g of studentGrades) {
    if (!gradeMap.has(g.subjectId)) {
      const evals = studentGrades.filter(e => e.subjectId === g.subjectId);
      const avg = evals.reduce((s, e) => s + e.value, 0) / evals.length;
      gradeMap.set(g.subjectId, {
        value: Math.round(avg * 100) / 100,
        evaluations: evals.map(e => ({ evaluationNumber: e.evaluationNumber, value: e.value })),
      });
    }
  }

  const grades = subjects.map((s) => ({
    subjectId: s.id,
    subjectName: s.name,
    coefficient: s.coefficient,
    credits: s.credits,
    ueId: s.ueId,
    value: gradeMap.get(s.id)?.value ?? null,
    evaluations: gradeMap.get(s.id)?.evaluations ?? [],
  }));

  // ── LMD: Group subjects by UE and compute UE averages ───────────────────────
  const ueResults = ues.map((ue) => {
    const ueSubjects = grades.filter(g => g.ueId === ue.id);
    // UE average is only calculated when ALL subjects in the UE have a grade
    const allSubjectsGraded = ueSubjects.length > 0 && ueSubjects.every(g => g.value !== null);
    let ueAverage: number | null = null;
    if (allSubjectsGraded) {
      const totalCoeff = ueSubjects.reduce((s, g) => s + g.coefficient, 0);
      const totalPoints = ueSubjects.reduce((s, g) => s + g.value! * g.coefficient, 0);
      ueAverage = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
    }
    // ── Règle éliminatoire : toute note ≤ 6/20 invalide automatiquement l'UE ──
    const eliminatorySubject = ueSubjects.find(g => g.value !== null && g.value <= 6) ?? null;
    const acquis = ueAverage !== null && ueAverage >= 10 && !eliminatorySubject;
    return {
      ueId: ue.id,
      ueCode: ue.code,
      ueName: ue.name,
      credits: ue.credits,
      coefficient: ue.coefficient,
      average: ueAverage,
      acquis,
      eliminatorySubjectName: eliminatorySubject ? eliminatorySubject.subjectName : null,
      subjects: ueSubjects,
    };
  });

  // Subjects not assigned to any UE
  const unassignedGrades = grades.filter(g => !g.ueId || !ues.find(u => u.id === g.ueId));

  let average: number | null = null;
  let decision: "Admis" | "Ajourné" | "En attente" = "En attente";

  // Compute semester average from UE averages (weighted by UE credits) + unassigned subjects
  // Semester average is ONLY calculated when ALL UEs have their average (cascade rule)
  if (ues.length > 0) {
    const allUesHaveAverage = ueResults.every(u => u.average !== null);
    const unassignedAllGraded = unassignedGrades.length === 0 || unassignedGrades.every(g => g.value !== null);
    if (allUesHaveAverage && unassignedAllGraded) {
      const totalCredits = ueResults.reduce((s, u) => s + u.credits, 0);
      const totalPoints = ueResults.reduce((s, u) => s + u.average! * u.credits, 0);
      const unassignedCoeff = unassignedGrades.reduce((s, g) => s + g.coefficient, 0);
      const unassignedPoints = unassignedGrades.reduce((s, g) => s + g.value! * g.coefficient, 0);
      const totalWeight = totalCredits + unassignedCoeff;
      const total = totalPoints + unassignedPoints;
      average = totalWeight > 0 ? Math.round((total / totalWeight) * 100) / 100 : null;
    }
    // If any UE is missing grades, average stays null
  } else {
    // No UE structure: semester average requires ALL subjects to be graded
    const allSubjectsGraded = grades.length > 0 && grades.every(g => g.value !== null);
    if (allSubjectsGraded) {
      const totalCoeff = grades.reduce((sum, g) => sum + g.coefficient, 0);
      const totalPoints = grades.reduce((sum, g) => sum + (g.value! * g.coefficient), 0);
      average = totalCoeff > 0 ? Math.round((totalPoints / totalCoeff) * 100) / 100 : null;
    }
  }

  // Credits validated = sum of UE credits where UE average >= 10
  const creditsValidated = ueResults.filter(u => u.acquis).reduce((s, u) => s + u.credits, 0);
  const totalCredits = ueResults.reduce((s, u) => s + u.credits, 0);

  // ── Absence deduction: -0.1 per complete hour of absence ────────────────────
  let absenceDeductionHours = 0;
  let absenceDeduction = 0;
  if (average !== null) {
    const absenceRecords = await db
      .select({ startTime: attendanceTable.startTime, endTime: attendanceTable.endTime })
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.studentId, studentId),
          eq(attendanceTable.semesterId, semesterId),
          ne(attendanceTable.status, "present"),
          eq(attendanceTable.justified, false),
          isNotNull(attendanceTable.startTime),
          isNotNull(attendanceTable.endTime)
        )
      );

    let totalMinutes = 0;
    for (const r of absenceRecords) {
      if (r.startTime && r.endTime) {
        const [sh, sm] = r.startTime.split(":").map(Number);
        const [eh, em] = r.endTime.split(":").map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) totalMinutes += diff;
      }
    }
    absenceDeductionHours = Math.floor(totalMinutes / 60);
    absenceDeduction = Math.round(absenceDeductionHours * 0.1 * 100) / 100;
    average = Math.max(0, Math.round((average - absenceDeduction) * 100) / 100);
  }

  // Decision: semester average >= 12 required for validation
  if (average !== null) {
    decision = average >= 12 ? "Admis" : "Ajourné";
  } else {
    decision = "En attente";
  }

  // Rule 5: Identify failure reasons for non-validated semesters
  const failedUes = ueResults
    .filter(u => u.average !== null && !u.acquis)
    .map(u => ({
      ueId: u.ueId,
      ueCode: u.ueCode,
      ueName: u.ueName,
      average: u.average,
      acquis: false,
      eliminatorySubjectName: u.eliminatorySubjectName ?? null,
    }));
  const averageFailed = decision === "Ajourné" && average !== null && average < 12;

  // ── Jury Spécial override: if a closed jury has validated this student for this semester ──
  let juryOverride: { newAverage: number; decision: string; justification: string } | null = null;
  const juryDecision = await db
    .select({
      newAverage: specialJuryDecisionsTable.newAverage,
      decision: specialJuryDecisionsTable.decision,
      justification: specialJuryDecisionsTable.justification,
      sessionStatus: specialJurySessionsTable.status,
    })
    .from(specialJuryDecisionsTable)
    .innerJoin(specialJurySessionsTable, eq(specialJurySessionsTable.id, specialJuryDecisionsTable.sessionId))
    .where(and(
      eq(specialJuryDecisionsTable.studentId, studentId),
      eq(specialJuryDecisionsTable.semesterId, semesterId),
      eq(specialJurySessionsTable.status, "closed")
    ))
    .orderBy(desc(specialJuryDecisionsTable.decidedAt))
    .limit(1);

  if (juryDecision.length > 0) {
    const jd = juryDecision[0];
    if ((jd.decision === "validated" || jd.decision === "conditional") && jd.newAverage !== null) {
      juryOverride = { newAverage: jd.newAverage, decision: "Admis", justification: jd.justification ?? "" };
    }
  }

  const finalAverage = juryOverride ? juryOverride.newAverage : average;
  const finalDecision = juryOverride ? (juryOverride.decision as any) : decision;

  return {
    studentId, studentName: student.name,
    classId, className,
    semesterId, semesterName: semester.name,
    average: finalAverage, decision: finalDecision, grades,
    ueResults, creditsValidated, totalCredits,
    absenceDeductionHours, absenceDeduction,
    failedUes, averageFailed: juryOverride ? false : averageFailed,
    juryOverride,
    rank: null, totalStudents: null,
  };
}

router.get("/results/:semesterId", requireRole("admin"), async (req, res) => {
  try {
    const semesterId = parseInt(req.params.semesterId);
    const { classId } = req.query;

    let students: any[];
    if (classId) {
      students = await db
        .select({ id: usersTable.id })
        .from(classEnrollmentsTable)
        .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
        .where(and(eq(classEnrollmentsTable.classId, parseInt(classId as string)), eq(usersTable.role, "student")));
    } else {
      students = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "student"));
    }

    const results = await Promise.all(students.map((s) => computeStudentResult(s.id, semesterId)));
    const validResults = results.filter(Boolean) as any[];

    // Compute ranks
    const ranked = [...validResults].filter(r => r.average !== null).sort((a, b) => b.average! - a.average!);
    const rankMap = new Map(ranked.map((r, i) => [r.studentId, i + 1]));

    const withRanks = validResults.map((r) => ({
      ...r,
      rank: r.average !== null ? (rankMap.get(r.studentId) ?? null) : null,
      totalStudents: validResults.filter(v => v.average !== null).length,
    }));

    res.json(withRanks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── HTML Bulletin ────────────────────────────────────────────────────────────
router.get("/bulletin/:studentId/:semesterId", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const studentId = parseInt(req.params.studentId);
    const semesterId = parseInt(req.params.semesterId);

    const result = await computeStudentResult(studentId, semesterId);
    if (!result) { res.status(404).json({ error: "Étudiant ou semestre introuvable." }); return; }

    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);

    // Fetch UEs with categories for this class/semester (computeStudentResult doesn't expose category)
    const uesWithCategory = result.classId
      ? await db.select().from(teachingUnitsTable).where(
          and(
            eq(teachingUnitsTable.classId, result.classId),
            eq(teachingUnitsTable.semesterId, semesterId)
          )
        )
      : [];
    const ueCategMap = new Map(uesWithCategory.map(u => [u.id, u.category]));

    // Enrich ueResults with category
    const ueResults = result.ueResults.map(ue => ({
      ...ue,
      category: ueCategMap.get(ue.ueId) ?? null,
    }));

    // Compute rank in class
    let rank: number | null = null;
    let totalStudents: number | null = null;
    if (result.classId && result.average !== null) {
      const classStudents = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(eq(classEnrollmentsTable.classId, result.classId));

      const studentIds = classStudents.map(s => s.studentId);
      if (studentIds.length > 1) {
        const allGrades = await db
          .select({
            studentId: gradesTable.studentId,
            value: gradesTable.value,
            coefficient: subjectsTable.coefficient,
          })
          .from(gradesTable)
          .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
          .where(
            and(
              inArray(gradesTable.studentId, studentIds),
              eq(gradesTable.semesterId, semesterId)
            )
          );

        const studentSums = new Map<number, { sum: number; totalCoef: number }>();
        for (const g of allGrades) {
          const e = studentSums.get(g.studentId) ?? { sum: 0, totalCoef: 0 };
          e.sum += (g.value ?? 0) * g.coefficient;
          e.totalCoef += g.coefficient;
          studentSums.set(g.studentId, e);
        }
        const avgs = [...studentSums.entries()]
          .filter(([, e]) => e.totalCoef > 0)
          .map(([id, e]) => ({ id, avg: e.sum / e.totalCoef }))
          .sort((a, b) => b.avg - a.avg);

        totalStudents = avgs.length;
        const pos = avgs.findIndex(a => a.id === studentId);
        rank = pos >= 0 ? pos + 1 : null;
      } else {
        rank = 1;
        totalStudents = 1;
      }
    }

    const editionDate = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // result.average is already the *nette* average (absence deduction already applied)
    // Brute average = nette + deduction
    const averageBrute = result.average !== null
      ? Math.round((result.average + result.absenceDeduction) * 100) / 100
      : null;

    // Fetch filière from classes table
    const [clsRow] = result.classId
      ? await db.select({ filiere: classesTable.filiere }).from(classesTable).where(eq(classesTable.id, result.classId)).limit(1)
      : [];
    const filiere = clsRow?.filiere ?? result.className ?? "";

    // Fetch schools from DB for dynamic footer
    const schoolRows = await db
      .select({ acronym: ecolesInphbTable.acronym, name: ecolesInphbTable.name })
      .from(ecolesInphbTable)
      .orderBy(ecolesInphbTable.displayOrder);

    // Fetch real matricule + naissance + sexe from student profile
    const [studentProfile] = await db
      .select({
        matricule: studentProfilesTable.matricule,
        dateNaissance: studentProfilesTable.dateNaissance,
        lieuNaissance: studentProfilesTable.lieuNaissance,
        sexe: studentProfilesTable.sexe,
      })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.studentId, studentId))
      .limit(1);
    const studentMatricule = studentProfile?.matricule?.trim() || String(studentId).padStart(6, "0");

    // ── Génération du token de vérification ────────────────────────────────
    const bulletinToken = crypto.randomBytes(32).toString("hex");
    const snapshot = {
      studentName: result.studentName,
      matricule: studentMatricule,
      className: result.className,
      filiere,
      academicYear: semester?.academicYear ?? "",
      semesterName: result.semesterName,
      average: averageBrute,
      averageNette: result.average,
      decision: result.decision,
    };

    // Invalider l'éventuel token existant valide pour ce couple étudiant/semestre
    await db
      .update(bulletinTokensTable)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(bulletinTokensTable.studentId, studentId),
          eq(bulletinTokensTable.semesterId, semesterId),
          isNull(bulletinTokensTable.invalidatedAt)
        )
      );

    await db.insert(bulletinTokensTable).values({
      token: bulletinToken,
      studentId,
      semesterId,
      snapshot,
    });

    // Construire l'URL de vérification
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "cpecdigital.replit.app";
    const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const verifyBaseUrl = process.env.PUBLIC_BASE_URL ?? `${protocol}://${host}`;
    const verifyUrl = `${verifyBaseUrl}/verify/bulletin/${bulletinToken}`;

    const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, { width: 200, margin: 1 });

    const [tenantRow] = await db
      .select({ name: tenantsTable.name, contactEmail: tenantsTable.contactEmail, domain: tenantsTable.domain, country: tenantsTable.country })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, req.session.tenantId!))
      .limit(1);

    const html = generateBulletinHTML({
      studentName: result.studentName,
      studentMatricule,
      dateNaissance: studentProfile?.dateNaissance ?? null,
      lieuNaissance: studentProfile?.lieuNaissance ?? null,
      sexe: studentProfile?.sexe ?? null,
      filiere,
      className: result.className,
      semesterName: result.semesterName,
      academicYear: semester?.academicYear ?? "",
      average: averageBrute,
      averageNette: result.average,
      decision: result.decision,
      rank,
      totalStudents,
      absenceDeductionHours: result.absenceDeductionHours,
      absenceDeduction: result.absenceDeduction,
      ueResults,
      unassignedSubjects: result.grades.filter((g: any) => !g.ueId || !ueResults.find(u => u.ueId === g.ueId)),
      editionDate,
      schools: schoolRows,
      qrCodeDataUrl,
      tenantInfo: tenantRow ?? undefined,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Bulletin JSON (for frontend PDF generation) ──────────────────────────────
router.get("/bulletin-json/:studentId/:semesterId", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const studentId = parseInt(req.params.studentId);
    const semesterId = parseInt(req.params.semesterId);
    const result = await computeStudentResult(studentId, semesterId);
    if (!result) { res.status(404).json({ error: "Étudiant ou semestre introuvable." }); return; }
    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);
    const uesWithCategory = result.classId
      ? await db.select().from(teachingUnitsTable).where(and(eq(teachingUnitsTable.classId, result.classId), eq(teachingUnitsTable.semesterId, semesterId)))
      : [];
    const ueCategMap = new Map(uesWithCategory.map(u => [u.id, u.category]));
    const ueResults = result.ueResults.map((ue: any) => ({ ...ue, category: ueCategMap.get(ue.ueId) ?? null }));
    let rank: number | null = null;
    let totalStudents: number | null = null;
    if (result.classId && result.average !== null) {
      const classStudents = await db.select({ studentId: classEnrollmentsTable.studentId }).from(classEnrollmentsTable).where(eq(classEnrollmentsTable.classId, result.classId));
      const sids = classStudents.map((s: any) => s.studentId);
      if (sids.length > 1) {
        const allGrades = await db.select({ studentId: gradesTable.studentId, value: gradesTable.value, coefficient: subjectsTable.coefficient }).from(gradesTable).innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId)).where(and(inArray(gradesTable.studentId, sids), eq(gradesTable.semesterId, semesterId)));
        const sums = new Map<number, { sum: number; coef: number }>();
        for (const g of allGrades) { const e = sums.get(g.studentId) ?? { sum: 0, coef: 0 }; e.sum += (g.value ?? 0) * g.coefficient; e.coef += g.coefficient; sums.set(g.studentId, e); }
        const avgs = [...sums.entries()].filter(([, e]) => e.coef > 0).map(([id, e]) => ({ id, avg: e.sum / e.coef })).sort((a, b) => b.avg - a.avg);
        totalStudents = avgs.length; const pos = avgs.findIndex(a => a.id === studentId); rank = pos >= 0 ? pos + 1 : null;
      } else { rank = 1; totalStudents = 1; }
    }
    const averageBrute = result.average !== null ? Math.round((result.average + result.absenceDeduction) * 100) / 100 : null;
    const [clsRow] = result.classId ? await db.select({ filiere: classesTable.filiere }).from(classesTable).where(eq(classesTable.id, result.classId)).limit(1) : [];
    const filiere = clsRow?.filiere ?? result.className ?? "";
    const [sp] = await db.select({ matricule: studentProfilesTable.matricule, dateNaissance: studentProfilesTable.dateNaissance, lieuNaissance: studentProfilesTable.lieuNaissance, sexe: studentProfilesTable.sexe }).from(studentProfilesTable).where(eq(studentProfilesTable.studentId, studentId)).limit(1);
    const studentMatricule = sp?.matricule?.trim() || String(studentId).padStart(6, "0");
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "cpecdigital.replit.app";
    const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const verifyBaseUrl = process.env.PUBLIC_BASE_URL ?? `${protocol}://${host}`;
    const bulletinToken = crypto.randomBytes(32).toString("hex");
    await db.update(bulletinTokensTable).set({ invalidatedAt: new Date() }).where(and(eq(bulletinTokensTable.studentId, studentId), eq(bulletinTokensTable.semesterId, semesterId), isNull(bulletinTokensTable.invalidatedAt)));
    await db.insert(bulletinTokensTable).values({ token: bulletinToken, studentId, semesterId, snapshot: { studentName: result.studentName, matricule: studentMatricule, className: result.className, filiere, academicYear: semester?.academicYear ?? "", semesterName: result.semesterName, average: averageBrute, averageNette: result.average, decision: result.decision } });
    const [jsonTenantRow] = await db
      .select({ name: tenantsTable.name, contactEmail: tenantsTable.contactEmail, domain: tenantsTable.domain, country: tenantsTable.country })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, req.session.tenantId!))
      .limit(1);
    res.json({ studentName: result.studentName, studentMatricule, dateNaissance: sp?.dateNaissance ?? null, lieuNaissance: sp?.lieuNaissance ?? null, sexe: sp?.sexe ?? null, filiere, className: result.className, semesterName: result.semesterName, academicYear: semester?.academicYear ?? "", average: averageBrute, averageNette: result.average, decision: result.decision, rank, totalStudents, absenceDeductionHours: result.absenceDeductionHours, absenceDeduction: result.absenceDeduction, creditsValidated: result.creditsValidated, totalCredits: result.totalCredits, ueResults, unassignedSubjects: result.grades.filter((g: any) => !g.ueId || !ueResults.find((u: any) => u.ueId === g.ueId)), verifyUrl: `${verifyBaseUrl}/verify/bulletin/${bulletinToken}`, tenantInfo: jsonTenantRow ?? undefined });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// ─── Teacher Assignments ──────────────────────────────────────────────────────
router.get("/assignments", requireRole("admin"), async (req, res) => {
  try {
    const assignments = await db
      .select({
        id: teacherAssignmentsTable.id,
        teacherId: teacherAssignmentsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
        coefficient: subjectsTable.coefficient,
        classId: teacherAssignmentsTable.classId,
        className: classesTable.name,
        semesterId: teacherAssignmentsTable.semesterId,
        semesterName: semestersTable.name,
        plannedHours: teacherAssignmentsTable.plannedHours,
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId));
    res.json(assignments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/assignments", requireRole("admin"), async (req, res) => {
  try {
    const { teacherId, subjectId, classId, semesterId, plannedHours } = req.body;
    if (!teacherId || !subjectId || !classId || !semesterId) {
      res.status(400).json({ error: "Bad Request", message: "All fields are required" });
      return;
    }
    const [assignment] = await db.insert(teacherAssignmentsTable)
      .values({ teacherId, subjectId, classId, semesterId, plannedHours: plannedHours ?? 30 })
      .onConflictDoNothing()
      .returning();

    if (!assignment) {
      res.status(409).json({ error: "Conflict", message: "Assignment already exists" });
      return;
    }

    const [full] = await db
      .select({
        id: teacherAssignmentsTable.id,
        teacherId: teacherAssignmentsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
        coefficient: subjectsTable.coefficient,
        classId: teacherAssignmentsTable.classId,
        className: classesTable.name,
        semesterId: teacherAssignmentsTable.semesterId,
        semesterName: semestersTable.name,
        plannedHours: teacherAssignmentsTable.plannedHours,
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId))
      .where(eq(teacherAssignmentsTable.id, assignment.id));

    res.status(201).json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/assignments/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { plannedHours } = req.body;
    if (plannedHours === undefined || isNaN(Number(plannedHours)) || Number(plannedHours) < 1) {
      res.status(400).json({ error: "Volume horaire invalide (minimum 1 heure)." });
      return;
    }
    await db.update(teacherAssignmentsTable)
      .set({ plannedHours: Number(plannedHours) })
      .where(eq(teacherAssignmentsTable.id, id));
    res.json({ ok: true, id, plannedHours: Number(plannedHours) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/assignments/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(teacherAssignmentsTable).where(eq(teacherAssignmentsTable.id, id));
    res.json({ message: "Assignment deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Subject Approvals ───────────────────────────────────────────────────────

router.get("/subject-approvals", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId } = req.query;
    const conditions: any[] = [];
    if (semesterId) conditions.push(eq(subjectApprovalsTable.semesterId, parseInt(semesterId as string)));
    if (classId) conditions.push(eq(subjectApprovalsTable.classId, parseInt(classId as string)));

    const rows = conditions.length > 0
      ? await db.select({
          id: subjectApprovalsTable.id,
          subjectId: subjectApprovalsTable.subjectId,
          subjectName: subjectsTable.name,
          classId: subjectApprovalsTable.classId,
          className: classesTable.name,
          semesterId: subjectApprovalsTable.semesterId,
          approvedById: subjectApprovalsTable.approvedById,
          approvedByName: usersTable.name,
          approvedAt: subjectApprovalsTable.approvedAt,
        })
        .from(subjectApprovalsTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, subjectApprovalsTable.subjectId))
        .innerJoin(classesTable, eq(classesTable.id, subjectApprovalsTable.classId))
        .innerJoin(usersTable, eq(usersTable.id, subjectApprovalsTable.approvedById))
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : await db.select({
          id: subjectApprovalsTable.id,
          subjectId: subjectApprovalsTable.subjectId,
          subjectName: subjectsTable.name,
          classId: subjectApprovalsTable.classId,
          className: classesTable.name,
          semesterId: subjectApprovalsTable.semesterId,
          approvedById: subjectApprovalsTable.approvedById,
          approvedByName: usersTable.name,
          approvedAt: subjectApprovalsTable.approvedAt,
        })
        .from(subjectApprovalsTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, subjectApprovalsTable.subjectId))
        .innerJoin(classesTable, eq(classesTable.id, subjectApprovalsTable.classId))
        .innerJoin(usersTable, eq(usersTable.id, subjectApprovalsTable.approvedById));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/subject-approvals", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." });
      return;
    }
    const { subjectId, classId, semesterId } = req.body;
    if (!subjectId || !classId || !semesterId) {
      res.status(400).json({ error: "subjectId, classId, semesterId requis." });
      return;
    }
    const [row] = await db
      .insert(subjectApprovalsTable)
      .values({ subjectId, classId, semesterId, approvedById: cu.id })
      .onConflictDoNothing()
      .returning();
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "approbation_notes",
      details: `Notes approuvées — matière ID ${subjectId}, classe ID ${classId}, semestre ID ${semesterId}.`,
    });
    res.status(201).json(row ?? { message: "Already approved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/subject-approvals/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." });
      return;
    }
    const id = parseInt(req.params.id);
    await db.delete(subjectApprovalsTable).where(eq(subjectApprovalsTable.id, id));
    res.json({ message: "Approval removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: grades for a specific subject/class/semester (live, no cache) ─────

router.get("/subject-grades", requireRole("admin"), async (req, res) => {
  try {
    const { subjectId, classId, semesterId } = req.query;
    if (!subjectId || !classId || !semesterId) {
      res.status(400).json({ error: "subjectId, classId et semesterId sont requis." });
      return;
    }
    const subId = parseInt(subjectId as string);
    const clId = parseInt(classId as string);
    const semId = parseInt(semesterId as string);

    // All students enrolled in the class
    const students = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .where(and(eq(classEnrollmentsTable.classId, clId), eq(usersTable.role, "student")));

    if (students.length === 0) { res.json([]); return; }

    const studentIds = students.map((s) => s.id);

    // Live grades from DB for this subject/semester
    const grades = await db
      .select({ studentId: gradesTable.studentId, evaluationNumber: gradesTable.evaluationNumber, value: gradesTable.value })
      .from(gradesTable)
      .where(and(
        inArray(gradesTable.studentId, studentIds),
        eq(gradesTable.subjectId, subId),
        eq(gradesTable.semesterId, semId),
      ));

    // Group by student and compute average of evaluations
    const gradeMap = new Map<number, { evaluations: { n: number; v: number }[]; average: number }>();
    for (const g of grades) {
      if (!gradeMap.has(g.studentId)) {
        const evals = grades.filter((e) => e.studentId === g.studentId);
        const avg = evals.reduce((s, e) => s + e.value, 0) / evals.length;
        gradeMap.set(g.studentId, {
          evaluations: evals.map((e) => ({ n: e.evaluationNumber, v: e.value })),
          average: Math.round(avg * 100) / 100,
        });
      }
    }

    const result = students
      .map((s) => ({
        studentId: s.id,
        studentName: s.name,
        value: gradeMap.get(s.id)?.average ?? null,
        evaluations: gradeMap.get(s.id)?.evaluations ?? [],
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "fr"));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Grade Submissions (pending teacher submissions for review) ────────────────

router.get("/grade-submissions/pending", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId } = req.query;
    const submissions = await db
      .select()
      .from(gradeSubmissionsTable)
      .where(semesterId ? eq(gradeSubmissionsTable.semesterId, parseInt(semesterId as string)) : undefined);

    // Filter out those already approved
    const approvals = await db.select().from(subjectApprovalsTable);
    const approvedKeys = new Set(approvals.map((a) => `${a.subjectId}-${a.classId}-${a.semesterId}`));
    const pending = submissions.filter((s) => !approvedKeys.has(`${s.subjectId}-${s.classId}-${s.semesterId}`));

    res.json(pending);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/grade-submissions/pending-count", requireRole("admin"), async (req, res) => {
  try {
    const submissions = await db.select().from(gradeSubmissionsTable);
    const approvals = await db.select().from(subjectApprovalsTable);
    const approvedKeys = new Set(approvals.map((a) => `${a.subjectId}-${a.classId}-${a.semesterId}`));
    const count = submissions.filter((s) => !approvedKeys.has(`${s.subjectId}-${s.classId}-${s.semesterId}`)).length;
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Alerts summary (dashboard badges) ────────────────────────────────────────
router.get("/alerts-summary", requireRole("admin"), async (req, res) => {
  try {
    const [submissions, approvals, openReclamations] = await Promise.all([
      db.select().from(gradeSubmissionsTable),
      db.select().from(subjectApprovalsTable),
      db.select({ id: reclamationsTable.id })
        .from(reclamationsTable)
        .where(inArray(reclamationsTable.status as any, ["soumise", "en_cours", "en_arbitrage"])),
    ]);
    const approvedKeys = new Set(approvals.map((a) => `${a.subjectId}-${a.classId}-${a.semesterId}`));
    const pendingGradeSubmissions = submissions.filter((s) => !approvedKeys.has(`${s.subjectId}-${s.classId}-${s.semesterId}`)).length;
    res.json({
      pendingGradeSubmissions,
      openReclamations: openReclamations.length,
      total: pendingGradeSubmissions + openReclamations.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Endpoint centralisé : résumé complet de toutes les alertes ───────────────

router.get("/alertes/resume", requireRole("admin"), async (req, res) => {
  try {
    const userId = req.session.user!.id;
    const subRole = req.session.user!.adminSubRole;
    const today = new Date().toISOString().split("T")[0];

    const [
      submissions,
      approvals,
      allReclamations,
      overdueInstallments,
      studentsThresholdResult,
      activeJurySessions,
      unreadMsgs,
    ] = await Promise.all([
      db.select().from(gradeSubmissionsTable),
      db.select().from(subjectApprovalsTable),
      db.select({ id: reclamationsTable.id, status: reclamationsTable.status }).from(reclamationsTable),
      db.select({ id: paymentInstallmentsTable.id })
        .from(paymentInstallmentsTable)
        .where(and(lte(paymentInstallmentsTable.dueDate, today), isNull(paymentInstallmentsTable.paidAt))),
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT student_id FROM attendance WHERE status = 'absent'
          GROUP BY student_id HAVING COUNT(*) >= 3
        ) sub
      `),
      db.select({ id: specialJurySessionsTable.id })
        .from(specialJurySessionsTable)
        .where(eq(specialJurySessionsTable.status, "active")),
      db.select({ id: messagesTable.id })
        .from(messagesTable)
        .where(and(eq(messagesTable.recipientId, userId), isNull(messagesTable.readAt))),
    ]);

    const approvedKeys = new Set(approvals.map((a) => `${a.subjectId}-${a.classId}-${a.semesterId}`));
    const pendingGradeSubmissions = submissions.filter((s) => !approvedKeys.has(`${s.subjectId}-${s.classId}-${s.semesterId}`)).length;
    const openReclamations = allReclamations.filter((r) => ["soumise", "en_cours", "en_arbitrage"].includes(r.status as string)).length;
    const arbitrageReclamations = allReclamations.filter((r) => r.status === "en_arbitrage").length;
    const overduePayments = overdueInstallments.length;
    const studentsAboveThreshold = ((studentsThresholdResult as any).rows?.[0]?.count ?? 0) as number;
    const juryEnAttente = activeJurySessions.length;
    const unreadMessages = unreadMsgs.length;

    let unpaidHonoraires = 0;
    if (subRole === "directeur") {
      const unpaidResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT h.teacher_id
          FROM teacher_honoraria h
          LEFT JOIN teacher_payments tp ON tp.teacher_id = h.teacher_id
          GROUP BY h.teacher_id, h.total_amount
          HAVING h.total_amount > COALESCE(SUM(tp.amount), 0)
        ) sub
      `);
      unpaidHonoraires = ((unpaidResult as any).rows?.[0]?.count ?? 0) as number;
    }

    const urgentTotal = pendingGradeSubmissions + overduePayments + juryEnAttente;
    const attentionTotal = studentsAboveThreshold + arbitrageReclamations;

    res.json({
      pendingGradeSubmissions,
      openReclamations,
      arbitrageReclamations,
      overduePayments,
      studentsAboveThreshold,
      juryEnAttente,
      unreadMessages,
      unpaidHonoraires,
      urgentTotal,
      attentionTotal,
      total: urgentTotal + attentionTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Dérogations (modification exceptionnelle de note) ────────────────────────

router.put("/grades/derogate", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." });
      return;
    }
    const { studentId, subjectId, semesterId, value, justification } = req.body;
    if (!studentId || !subjectId || !semesterId || value === undefined || !justification) {
      res.status(400).json({ error: "Tous les champs sont requis, y compris la justification." });
      return;
    }
    if (value < 0 || value > 20) {
      res.status(400).json({ error: "La note doit être comprise entre 0 et 20." });
      return;
    }

    // Fetch student and subject names for the log
    const [student] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
    const [subject] = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);

    // Fetch old value
    const [old] = await db.select({ value: gradesTable.value }).from(gradesTable)
      .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.subjectId, subjectId), eq(gradesTable.semesterId, semesterId)))
      .limit(1);

    // Upsert grade (derogation applies to evaluation 1 by default)
    const evalNum = req.body.evaluationNumber ?? 1;
    await db.insert(gradesTable)
      .values({ studentId, subjectId, semesterId, evaluationNumber: evalNum, value })
      .onConflictDoUpdate({ target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId, gradesTable.evaluationNumber], set: { value, updatedAt: new Date() } });

    // Log derogation
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "derogation_note",
      details: `Dérogation — ${student?.name ?? studentId} | ${subject?.name ?? subjectId} | Ancienne note: ${old?.value ?? "—"} → Nouvelle: ${value} | Justification: ${justification}`,
    });

    res.json({ message: "Note modifiée avec dérogation enregistrée." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Journal d'Activité ───────────────────────────────────────────────────────

router.get("/activity-log", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé au Responsable Scolarité." });
      return;
    }
    const rows = await db
      .select({
        id: activityLogTable.id,
        userId: activityLogTable.userId,
        userName: usersTable.name,
        action: activityLogTable.action,
        details: activityLogTable.details,
        createdAt: activityLogTable.createdAt,
      })
      .from(activityLogTable)
      .innerJoin(usersTable, eq(usersTable.id, activityLogTable.userId))
      .orderBy(desc(activityLogTable.createdAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Class Enrollments ───────────────────────────────────────────────────────
router.post("/class-enrollments", requireRole("admin"), async (req, res) => {
  try {
    const { studentId, classId } = req.body;
    if (!studentId || !classId) { res.status(400).json({ error: "Bad Request", message: "studentId and classId are required" }); return; }
    await db.delete(classEnrollmentsTable).where(eq(classEnrollmentsTable.studentId, studentId));
    await db.insert(classEnrollmentsTable).values({ studentId, classId }).onConflictDoNothing();
    res.status(201).json({ message: "Student enrolled" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/class-enrollments", requireRole("admin"), async (req, res) => {
  try {
    const { studentId, classId } = req.body;
    if (!studentId || !classId) { res.status(400).json({ error: "Bad Request", message: "studentId and classId are required" }); return; }
    await db.delete(classEnrollmentsTable).where(and(eq(classEnrollmentsTable.studentId, studentId), eq(classEnrollmentsTable.classId, classId)));
    res.json({ message: "Student removed from class" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Absence Justifications (admin) ──────────────────────────────────────────

router.get("/justifications", requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.query;
    const rows = await db
      .select({
        id: absenceJustificationsTable.id,
        attendanceId: absenceJustificationsTable.attendanceId,
        studentId: absenceJustificationsTable.studentId,
        studentName: usersTable.name,
        reason: absenceJustificationsTable.reason,
        status: absenceJustificationsTable.status,
        reviewedBy: absenceJustificationsTable.reviewedBy,
        reviewedAt: absenceJustificationsTable.reviewedAt,
        reviewNote: absenceJustificationsTable.reviewNote,
        fileUrl: absenceJustificationsTable.fileUrl,
        createdAt: absenceJustificationsTable.createdAt,
        sessionDate: attendanceTable.sessionDate,
        attendanceStatus: attendanceTable.status,
        subjectName: subjectsTable.name,
        className: classesTable.name,
      })
      .from(absenceJustificationsTable)
      .innerJoin(usersTable, eq(usersTable.id, absenceJustificationsTable.studentId))
      .innerJoin(attendanceTable, eq(attendanceTable.id, absenceJustificationsTable.attendanceId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, attendanceTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, attendanceTable.classId))
      .orderBy(absenceJustificationsTable.createdAt);

    const filtered = status ? rows.filter((r) => r.status === status) : rows;
    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/justifications/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole !== "scolarite" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const id = parseInt(req.params.id);
    const { status, reviewNote } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status doit être 'approved' ou 'rejected'." }); return;
    }
    const [just] = await db.select().from(absenceJustificationsTable)
      .where(eq(absenceJustificationsTable.id, id)).limit(1);
    if (!just) { res.status(404).json({ error: "Justificatif introuvable." }); return; }

    const [updated] = await db.update(absenceJustificationsTable)
      .set({ status, reviewedBy: cu.id, reviewedAt: new Date(), reviewNote: reviewNote?.trim() || null, updatedAt: new Date() })
      .where(eq(absenceJustificationsTable.id, id))
      .returning();

    // If approved → mark the attendance record as justified
    if (status === "approved") {
      await db.update(attendanceTable).set({ justified: true }).where(eq(attendanceTable.id, just.attendanceId));
    } else if (status === "rejected") {
      await db.update(attendanceTable).set({ justified: false }).where(eq(attendanceTable.id, just.attendanceId));
    }

    // Notify the student
    const notifTitle = status === "approved" ? "Justificatif approuvé" : "Justificatif refusé";
    const notifMessage = status === "approved"
      ? "Votre justificatif d'absence a été approuvé par la scolarité. L'absence est désormais marquée comme justifiée."
      : `Votre justificatif d'absence a été refusé.${reviewNote?.trim() ? ` Motif : ${reviewNote.trim()}` : ""}`;
    await db.insert(notificationsTable).values({
      userId: just.studentId,
      type: status === "approved" ? "justification_approved" : "justification_rejected",
      title: notifTitle,
      message: notifMessage,
    });

    sendPushToUser(just.studentId, { title: notifTitle, body: notifMessage, type: status === "approved" ? "justification_approved" : "justification_rejected" }).catch(() => {});

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /admin/students/:id/detail — fiche complète d'un étudiant ───────────
router.get("/students/:id/detail", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);

    // Info de base + profil
    const [userRow] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: studentProfilesTable.phone,
        address: studentProfilesTable.address,
        dateNaissance: studentProfilesTable.dateNaissance,
        lieuNaissance: studentProfilesTable.lieuNaissance,
        matricule: studentProfilesTable.matricule,
        photoUrl: studentProfilesTable.photoUrl,
      })
      .from(usersTable)
      .leftJoin(studentProfilesTable, eq(studentProfilesTable.studentId, usersTable.id))
      .where(and(eq(usersTable.id, studentId), eq(usersTable.role, "student")))
      .limit(1);

    if (!userRow) { res.status(404).json({ error: "Étudiant introuvable." }); return; }

    // Inscriptions (classes + années)
    const enrollments = await db
      .select({
        classId: classEnrollmentsTable.classId,
        className: classesTable.name,
        enrolledAt: classEnrollmentsTable.enrolledAt,
      })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classesTable.id, classEnrollmentsTable.classId))
      .where(eq(classEnrollmentsTable.studentId, studentId))
      .orderBy(desc(classEnrollmentsTable.enrolledAt));

    // Résultats par semestre (notes + décision)
    const semesters = await db.select().from(semestersTable).orderBy(semestersTable.startDate);
    const semesterResults: any[] = [];
    for (const sem of semesters) {
      const grades = await db
        .select({
          subjectId: gradesTable.subjectId,
          subjectName: subjectsTable.name,
          coefficient: subjectsTable.coefficient,
          value: gradesTable.value,
        })
        .from(gradesTable)
        .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
        .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.semesterId, sem.id)));

      if (grades.length === 0) continue;

      const totalCoef = grades.reduce((s, g) => s + (g.coefficient ?? 1), 0);
      const average = totalCoef > 0
        ? grades.reduce((s, g) => s + (g.value ?? 0) * (g.coefficient ?? 1), 0) / totalCoef
        : null;

      semesterResults.push({
        semesterId: sem.id,
        semesterName: sem.name,
        academicYear: sem.academicYear,
        grades,
        average: average !== null ? Math.round(average * 100) / 100 : null,
        decision: average !== null ? (average >= 10 ? "Admis" : "Ajourné") : "En attente",
      });
    }

    // Absences (total non-justifiées)
    const absenceRows = await db
      .select({
        subjectId: attendanceTable.subjectId,
        subjectName: subjectsTable.name,
        className: classesTable.name,
        sessionDate: attendanceTable.sessionDate,
        status: attendanceTable.status,
        justified: attendanceTable.justified,
        semesterId: attendanceTable.semesterId,
      })
      .from(attendanceTable)
      .leftJoin(subjectsTable, eq(subjectsTable.id, attendanceTable.subjectId))
      .leftJoin(classesTable, eq(classesTable.id, attendanceTable.classId))
      .where(and(eq(attendanceTable.studentId, studentId), ne(attendanceTable.status, "present")))
      .orderBy(desc(attendanceTable.sessionDate));

    // Scolarité (frais + paiements)
    const [feeRow] = await db.select().from(studentFeesTable).where(eq(studentFeesTable.studentId, studentId)).limit(1);
    const payments = await db
      .select({
        id: paymentsTable.id,
        amount: paymentsTable.amount,
        description: paymentsTable.description,
        paymentDate: paymentsTable.paymentDate,
        createdAt: paymentsTable.createdAt,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.studentId, studentId))
      .orderBy(desc(paymentsTable.paymentDate));

    const totalPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
    const totalDue = feeRow?.totalAmount ?? 0;

    // Hébergement
    const housingRows = await db
      .select({
        assignmentId: housingAssignmentsTable.id,
        roomId: housingAssignmentsTable.roomId,
        roomNumber: housingRoomsTable.roomNumber,
        buildingName: housingBuildingsTable.name,
        floor: housingRoomsTable.floor,
        type: housingRoomsTable.type,
        pricePerMonth: housingRoomsTable.pricePerMonth,
        startDate: housingAssignmentsTable.startDate,
        endDate: housingAssignmentsTable.endDate,
        status: housingAssignmentsTable.status,
        notes: housingAssignmentsTable.notes,
      })
      .from(housingAssignmentsTable)
      .innerJoin(housingRoomsTable, eq(housingRoomsTable.id, housingAssignmentsTable.roomId))
      .innerJoin(housingBuildingsTable, eq(housingBuildingsTable.id, housingRoomsTable.buildingId))
      .where(eq(housingAssignmentsTable.studentId, studentId))
      .orderBy(desc(housingAssignmentsTable.startDate));

    res.json({
      student: userRow,
      enrollments,
      semesterResults,
      absences: absenceRows,
      scolarite: {
        totalDue,
        totalPaid: Math.round(totalPaid * 100) / 100,
        balance: Math.round((totalDue - totalPaid) * 100) / 100,
        academicYear: feeRow?.academicYear ?? null,
        payments,
      },
      housing: housingRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /admin/bulletin/class/:classId/:semesterId — bulletins masse ─────────
router.get("/bulletin/class/:classId/:semesterId", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (cu.adminSubRole !== "scolarite" && cu.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." });
      return;
    }
    const classId = parseInt(req.params.classId);
    const semesterId = parseInt(req.params.semesterId);

    const [classRow] = await db.select().from(classesTable).where(eq(classesTable.id, classId)).limit(1);
    const [semester] = await db.select().from(semestersTable).where(eq(semestersTable.id, semesterId)).limit(1);
    if (!classRow || !semester) { res.status(404).json({ error: "Classe ou semestre introuvable." }); return; }

    const enrolledStudents = await db
      .select({ studentId: classEnrollmentsTable.studentId, studentName: usersTable.name })
      .from(classEnrollmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, classEnrollmentsTable.studentId))
      .where(eq(classEnrollmentsTable.classId, classId))
      .orderBy(usersTable.name);

    if (enrolledStudents.length === 0) {
      res.status(404).json({ error: "Aucun étudiant dans cette classe." });
      return;
    }

    // Compute results for all students
    const uesWithCategory = await db.select().from(teachingUnitsTable).where(
      and(eq(teachingUnitsTable.classId, classId), eq(teachingUnitsTable.semesterId, semesterId))
    );
    const ueCategMap = new Map(uesWithCategory.map(u => [u.id, u.category]));

    // Compute rank across class
    const allStudentIds = enrolledStudents.map(s => s.studentId);
    const allGradesForRank = await db
      .select({ studentId: gradesTable.studentId, value: gradesTable.value, coefficient: subjectsTable.coefficient })
      .from(gradesTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, gradesTable.subjectId))
      .where(and(inArray(gradesTable.studentId, allStudentIds), eq(gradesTable.semesterId, semesterId)));

    const studentSums = new Map<number, { sum: number; coef: number }>();
    for (const g of allGradesForRank) {
      const entry = studentSums.get(g.studentId) ?? { sum: 0, coef: 0 };
      entry.sum += (g.value ?? 0) * (g.coefficient ?? 1);
      entry.coef += g.coefficient ?? 1;
      studentSums.set(g.studentId, entry);
    }
    const avgMap = new Map<number, number>();
    for (const [sid, { sum, coef }] of studentSums) {
      if (coef > 0) avgMap.set(sid, sum / coef);
    }
    const sortedAvgs = [...avgMap.entries()].sort((a, b) => b[1] - a[1]);
    const rankMap = new Map<number, number>();
    sortedAvgs.forEach(([sid], i) => rankMap.set(sid, i + 1));

    // Fetch profiles for all students at once
    const profiles = await db
      .select({
        studentId: studentProfilesTable.studentId,
        matricule: studentProfilesTable.matricule,
        dateNaissance: studentProfilesTable.dateNaissance,
        lieuNaissance: studentProfilesTable.lieuNaissance,
        sexe: studentProfilesTable.sexe,
      })
      .from(studentProfilesTable)
      .where(inArray(studentProfilesTable.studentId, allStudentIds));
    const profileMap = new Map(profiles.map(p => [p.studentId, p]));

    const filiere = classRow.filiere ?? classRow.name ?? "";
    const schoolRows = await db
      .select({ acronym: ecolesInphbTable.acronym, name: ecolesInphbTable.name })
      .from(ecolesInphbTable)
      .orderBy(ecolesInphbTable.displayOrder);

    const [massTenantRow] = await db
      .select({ name: tenantsTable.name, contactEmail: tenantsTable.contactEmail, domain: tenantsTable.domain, country: tenantsTable.country })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, req.session.tenantId!))
      .limit(1);

    const bulletinHTMLParts: string[] = [];
    for (const { studentId } of enrolledStudents) {
      const result = await computeStudentResult(studentId, semesterId);
      if (!result) continue;

      const ueResults = result.ueResults.map(ue => ({
        ...ue,
        category: ueCategMap.get(ue.ueId) ?? null,
      }));

      const rank = rankMap.get(studentId) ?? null;
      const totalStudents = sortedAvgs.length;
      const profile = profileMap.get(studentId);
      const studentMatricule = profile?.matricule?.trim() || String(studentId).padStart(6, "0");
      const averageBrute = result.average !== null
        ? Math.round((result.average + result.absenceDeduction) * 100) / 100
        : null;
      const editionDate = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

      // ── Token de vérification pour ce bulletin ──────────────────────────
      const massToken = crypto.randomBytes(32).toString("hex");
      const massSnapshot = {
        studentName: result.studentName,
        matricule: studentMatricule,
        className: result.className,
        filiere,
        academicYear: semester?.academicYear ?? "",
        semesterName: result.semesterName,
        average: averageBrute,
        averageNette: result.average,
        decision: result.decision,
      };
      await db
        .update(bulletinTokensTable)
        .set({ invalidatedAt: new Date() })
        .where(
          and(
            eq(bulletinTokensTable.studentId, studentId),
            eq(bulletinTokensTable.semesterId, semesterId),
            isNull(bulletinTokensTable.invalidatedAt)
          )
        );
      await db.insert(bulletinTokensTable).values({
        token: massToken,
        studentId,
        semesterId,
        snapshot: massSnapshot,
      });
      const massHost = (req.headers["x-forwarded-host"] as string) || req.get("host") || "cpecdigital.replit.app";
      const massProtocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const massVerifyUrl = `${process.env.PUBLIC_BASE_URL ?? `${massProtocol}://${massHost}`}/verify/bulletin/${massToken}`;
      const massQrDataUrl = await QRCode.toDataURL(massVerifyUrl, { width: 200, margin: 1 });

      const html = generateBulletinHTML({
        studentName: result.studentName,
        studentMatricule,
        dateNaissance: profile?.dateNaissance ?? null,
        lieuNaissance: profile?.lieuNaissance ?? null,
        sexe: profile?.sexe ?? null,
        filiere,
        className: result.className,
        semesterName: result.semesterName,
        academicYear: semester?.academicYear ?? "",
        average: averageBrute,
        averageNette: result.average,
        decision: result.decision,
        rank,
        totalStudents,
        absenceDeductionHours: result.absenceDeductionHours,
        absenceDeduction: result.absenceDeduction,
        ueResults,
        unassignedSubjects: result.grades.filter((g: any) => !g.ueId || !ueResults.find(u => u.ueId === g.ueId)),
        editionDate,
        schools: schoolRows,
        qrCodeDataUrl: massQrDataUrl,
        tenantInfo: massTenantRow ?? undefined,
      });

      bulletinHTMLParts.push(html);
    }

    // Combine all bulletins into a single printable page
    const combinedHTML = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>Bulletins — ${classRow.name} — ${semester.name}</title>
<style>
  body { margin: 0; padding: 0; }
  .bulletin-wrapper { page-break-after: always; }
  .bulletin-wrapper:last-child { page-break-after: avoid; }
  @media print { .no-print { display: none !important; } }
  .no-print {
    position: fixed; top: 16px; right: 16px; z-index: 9999;
    background: #1e40af; color: white; border: none; padding: 10px 20px;
    border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
  }
</style>
</head><body>
<button class="no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>
${bulletinHTMLParts.map(h => {
  // Extract just the body content from each bulletin
  const bodyMatch = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : h;
  // Remove individual print buttons
  const cleaned = content.replace(/<button[^>]*class="[^"]*no-print[^"]*"[^>]*>[\s\S]*?<\/button>/gi, "");
  return `<div class="bulletin-wrapper">${cleaned}</div>`;
}).join("\n")}
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(combinedHTML);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Paiements (T001) ─────────────────────────────────────────────────────────

router.post("/payments", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole !== "scolarite" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const { studentId, amount, description, paymentDate } = req.body;
    if (!studentId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "studentId et amount (positif) sont requis." }); return;
    }
    const [payment] = await db.insert(paymentsTable).values({
      studentId: parseInt(studentId),
      amount: Number(amount).toFixed(2),
      description: description?.trim() || null,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      recordedById: cu.id,
    }).returning();
    await db.insert(activityLogTable).values({
      userId: cu.id,
      action: "payment_recorded",
      details: `Paiement de ${Number(amount).toFixed(0)} F enregistré pour l'étudiant #${studentId}.`,
    }).catch(() => {});
    res.status(201).json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/payments/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    if (cu?.adminSubRole !== "scolarite" && cu?.adminSubRole !== "directeur") {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(paymentsTable).where(eq(paymentsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Paiement introuvable." }); return; }
    res.json({ message: "Paiement supprimé." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Suivi heures planifiées vs réalisées (T003) ──────────────────────────────

router.get("/suivi-heures", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId } = req.query;

    const conditions: any[] = [];
    if (semesterId) conditions.push(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId as string)));
    if (classId) conditions.push(eq(teacherAssignmentsTable.classId, parseInt(classId as string)));

    const assignments = await db
      .select({
        id: teacherAssignmentsTable.id,
        teacherId: teacherAssignmentsTable.teacherId,
        teacherName: usersTable.name,
        subjectId: teacherAssignmentsTable.subjectId,
        subjectName: subjectsTable.name,
        classId: teacherAssignmentsTable.classId,
        className: classesTable.name,
        semesterId: teacherAssignmentsTable.semesterId,
        semesterName: semestersTable.name,
        semesterStart: semestersTable.startDate,
        semesterEnd: semestersTable.endDate,
        plannedHours: teacherAssignmentsTable.plannedHours,
      })
      .from(teacherAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, teacherAssignmentsTable.teacherId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, teacherAssignmentsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, teacherAssignmentsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, teacherAssignmentsTable.semesterId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(usersTable.name), asc(subjectsTable.name));

    const result = await Promise.all(assignments.map(async (a) => {
      const schedEntries = await db
        .select({
          sessionDate: scheduleEntriesTable.sessionDate,
          startTime: scheduleEntriesTable.startTime,
          endTime: scheduleEntriesTable.endTime,
        })
        .from(scheduleEntriesTable)
        .where(
          and(
            eq(scheduleEntriesTable.teacherId, a.teacherId),
            eq(scheduleEntriesTable.subjectId, a.subjectId),
            eq(scheduleEntriesTable.classId, a.classId),
            eq(scheduleEntriesTable.semesterId, a.semesterId),
          )
        );

      const submittedSessions = await db
        .select({ sessionDate: attendanceSessionsTable.sessionDate })
        .from(attendanceSessionsTable)
        .where(
          and(
            eq(attendanceSessionsTable.teacherId, a.teacherId),
            eq(attendanceSessionsTable.subjectId, a.subjectId),
            eq(attendanceSessionsTable.classId, a.classId),
            eq(attendanceSessionsTable.semesterId, a.semesterId),
            isNotNull(attendanceSessionsTable.sentAt),
          )
        );

      const submittedDates = new Set(submittedSessions.map(s => s.sessionDate));

      let heuresRealisees = 0;
      let sessionsCount = 0;
      let totalSeancesProgrammees = schedEntries.length;

      for (const entry of schedEntries) {
        if (submittedDates.has(entry.sessionDate)) {
          const [sh, sm] = entry.startTime.split(":").map(Number);
          const [eh, em] = entry.endTime.split(":").map(Number);
          const duration = (eh * 60 + em - sh * 60 - sm) / 60;
          if (duration > 0) {
            heuresRealisees += duration;
            sessionsCount++;
          }
        }
      }

      heuresRealisees = Math.round(heuresRealisees * 10) / 10;
      const planned = Number(a.plannedHours ?? 0);
      const pct = planned > 0 ? Math.round((heuresRealisees / planned) * 100) : null;

      let statut: "A_JOUR" | "A_SURVEILLER" | "EN_RETARD" | "NON_DEMARRE" = "NON_DEMARRE";
      if (sessionsCount > 0 && planned > 0) {
        const semStart = a.semesterStart ? new Date(a.semesterStart) : null;
        const semEnd = a.semesterEnd ? new Date(a.semesterEnd) : null;
        if (semStart && semEnd) {
          const now = new Date();
          const totalDuration = semEnd.getTime() - semStart.getTime();
          const elapsed = Math.max(0, now.getTime() - semStart.getTime());
          const tauxAttendu = Math.min((elapsed / totalDuration) * 100, 100);
          const tauxAvancement = (heuresRealisees / planned) * 100;
          if (tauxAvancement >= tauxAttendu - 5) statut = "A_JOUR";
          else if (tauxAvancement >= tauxAttendu - 20) statut = "A_SURVEILLER";
          else statut = "EN_RETARD";
        } else {
          statut = (pct ?? 0) >= 100 ? "A_JOUR" : (pct ?? 0) >= 60 ? "A_SURVEILLER" : "EN_RETARD";
        }
      } else if (sessionsCount === 0 && totalSeancesProgrammees > 0) {
        statut = "NON_DEMARRE";
      }

      return {
        ...a,
        plannedHours: planned,
        heuresRealisees,
        heuresRestantes: Math.max(0, Math.round((planned - heuresRealisees) * 10) / 10),
        sessions: sessionsCount,
        totalSeances: totalSeancesProgrammees,
        progressPct: pct,
        statut,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Alertes seuil d'absences (T007) ──────────────────────────────────────────

router.post("/absences/send-alerts", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session?.user as any;
    const { semesterId, classId, threshold = 3 } = req.body;
    if (!semesterId) { res.status(400).json({ error: "semesterId requis." }); return; }

    const threshNum = parseInt(String(threshold));
    const cond: any[] = [
      eq(attendanceTable.semesterId, parseInt(String(semesterId))),
      eq(attendanceTable.status, "absent"),
      eq(attendanceTable.justified, false),
    ];
    if (classId) cond.push(eq(attendanceTable.classId, parseInt(String(classId))));

    const absRows = await db
      .select({
        studentId: attendanceTable.studentId,
        studentName: usersTable.name,
        absenceCount: sql<number>`COUNT(*)`,
      })
      .from(attendanceTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceTable.studentId))
      .where(and(...cond))
      .groupBy(attendanceTable.studentId, usersTable.name)
      .having(sql`COUNT(*) >= ${threshNum}`);

    if (absRows.length === 0) {
      res.json({ sent: 0, message: "Aucun étudiant ne dépasse le seuil." });
      return;
    }

    await Promise.all(absRows.map(async (s) => {
      await db.insert(notificationsTable).values({
        userId: s.studentId,
        type: "absence_alert",
        title: "Alerte absences",
        message: `Vous avez ${s.absenceCount} absence(s) non justifiée(s) ce semestre (seuil : ${threshNum}). Veuillez régulariser votre situation auprès de la scolarité.`,
      });
      sendPushToUser(s.studentId, {
        title: "Alerte absences",
        body: `Vous avez ${s.absenceCount} absence(s) non justifiée(s). Contactez la scolarité.`,
        type: "absence_alert",
      }).catch(() => {});
    }));

    res.json({ sent: absRows.length, students: absRows.map(s => ({ id: s.studentId, name: s.studentName, absenceCount: s.absenceCount })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Alert count: students above absence threshold ────────────────────────────

router.get("/absences/alert-count", requireRole("admin"), async (req, res) => {
  try {
    const threshold = parseInt((req.query.threshold as string) ?? "3");
    const rows = Array.from(await db.execute(sql`
      SELECT COUNT(*)::int as count
      FROM (
        SELECT student_id
        FROM ${attendanceTable}
        WHERE status = 'absent'
        GROUP BY student_id
        HAVING COUNT(*) >= ${threshold}
      ) sub
    `));
    res.json({ count: (rows[0] as any)?.count ?? 0, threshold });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Director stats: class progression + financial recovery ───────────────────

router.get("/stats", requireRole("admin"), async (req, res) => {
  try {
    const progression = await db.execute(sql`
      SELECT
        c.id as class_id,
        c.name as class_name,
        COUNT(DISTINCT se.id)::int as planned_sessions,
        COUNT(DISTINCT cdt.id)::int as actual_sessions
      FROM classes c
      LEFT JOIN schedule_entries se ON se.class_id = c.id
      LEFT JOIN cahier_de_texte cdt ON cdt.class_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);

    const financial = await db.execute(sql`
      SELECT
        c.id as class_id,
        c.name as class_name,
        COALESCE(MAX(cf.total_amount), 0)::numeric as fee_per_student,
        COUNT(DISTINCT ce.student_id)::int as enrolled_count,
        (COALESCE(MAX(cf.total_amount), 0) * COUNT(DISTINCT ce.student_id))::numeric as total_due,
        COALESCE(SUM(p_agg.total_paid), 0)::numeric as total_paid
      FROM classes c
      LEFT JOIN class_fees cf ON cf.class_id = c.id
      LEFT JOIN class_enrollments ce ON ce.class_id = c.id
      LEFT JOIN (
        SELECT student_id, SUM(amount)::numeric as total_paid
        FROM payments
        GROUP BY student_id
      ) p_agg ON p_agg.student_id = ce.student_id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);

    res.json({
      progression: (progression as any).rows ?? [],
      financial: (financial as any).rows ?? [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Cahier de texte (lecture seule admin) ────────────────────────────────────

router.get("/cahier-de-texte", requireRole("admin"), async (req, res) => {
  try {
    const { teacherId, classId, subjectId, semesterId } = req.query;

    const conditions: any[] = [];
    if (teacherId) conditions.push(eq(cahierDeTexteTable.teacherId, parseInt(teacherId as string)));
    if (classId) conditions.push(eq(cahierDeTexteTable.classId, parseInt(classId as string)));
    if (subjectId) conditions.push(eq(cahierDeTexteTable.subjectId, parseInt(subjectId as string)));
    if (semesterId) conditions.push(eq(cahierDeTexteTable.semesterId, parseInt(semesterId as string)));

    const query = db
      .select({
        id: cahierDeTexteTable.id,
        sessionDate: cahierDeTexteTable.sessionDate,
        title: cahierDeTexteTable.title,
        contenu: cahierDeTexteTable.contenu,
        devoirs: cahierDeTexteTable.devoirs,
        heuresEffectuees: cahierDeTexteTable.heuresEffectuees,
        subjectId: cahierDeTexteTable.subjectId,
        subjectName: subjectsTable.name,
        classId: cahierDeTexteTable.classId,
        className: classesTable.name,
        semesterId: cahierDeTexteTable.semesterId,
        semesterName: semestersTable.name,
        teacherId: cahierDeTexteTable.teacherId,
        teacherName: usersTable.name,
        createdAt: cahierDeTexteTable.createdAt,
        updatedAt: cahierDeTexteTable.updatedAt,
      })
      .from(cahierDeTexteTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, cahierDeTexteTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, cahierDeTexteTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, cahierDeTexteTable.semesterId))
      .innerJoin(usersTable, eq(usersTable.id, cahierDeTexteTable.teacherId))
      .orderBy(desc(cahierDeTexteTable.sessionDate), asc(usersTable.name));

    const entries = conditions.length > 0
      ? await query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : await query;

    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ===========================
// RETAKE SESSION ROUTES (Admin)
// ===========================

// GET /admin/retake-sessions — List all retake sessions
router.get("/retake-sessions", requireRole("admin"), async (req, res) => {
  try {
    const sessions = await db
      .select({
        id: retakeSessionsTable.id,
        label: retakeSessionsTable.label,
        status: retakeSessionsTable.status,
        semesterId: retakeSessionsTable.semesterId,
        semesterName: semestersTable.name,
        createdBy: retakeSessionsTable.createdBy,
        createdByName: usersTable.name,
        openedAt: retakeSessionsTable.openedAt,
        closedAt: retakeSessionsTable.closedAt,
        createdAt: retakeSessionsTable.createdAt,
      })
      .from(retakeSessionsTable)
      .leftJoin(semestersTable, eq(retakeSessionsTable.semesterId, semestersTable.id))
      .leftJoin(usersTable, eq(retakeSessionsTable.createdBy, usersTable.id))
      .orderBy(desc(retakeSessionsTable.createdAt));
    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/retake-sessions — Create and open a new retake session
router.post("/retake-sessions", requireRole("admin"), async (req, res) => {
  try {
    const adminId = req.session!.userId!;
    const { label, semesterId } = req.body;
    if (!label || !semesterId) return res.status(400).json({ error: "label et semesterId requis" });

    const [session] = await db.insert(retakeSessionsTable).values({
      label,
      semesterId: parseInt(semesterId),
      status: "open",
      createdBy: adminId,
      openedAt: new Date(),
    }).returning();

    // Notify all teachers of this semester
    const teachers = await db
      .select({ teacherId: teacherAssignmentsTable.teacherId })
      .from(teacherAssignmentsTable)
      .where(eq(teacherAssignmentsTable.semesterId, parseInt(semesterId)));

    const uniqueTeacherIds = [...new Set(teachers.map(t => t.teacherId))];
    if (uniqueTeacherIds.length > 0) {
      await db.insert(notificationsTable).values(
        uniqueTeacherIds.map(tid => ({
          userId: tid,
          type: "retake_session_open",
          title: "Session de rattrapage ouverte",
          message: `La session de rattrapage "${label}" est maintenant ouverte. Vous pouvez saisir les notes de rattrapage.`,
          read: false,
        }))
      );
      for (const tid of uniqueTeacherIds) {
        sendPushToUser(tid, {
          title: "Session de rattrapage ouverte",
          body: `La session "${label}" est maintenant ouverte.`,
          type: "retake_session_open",
        }).catch(() => {});
      }
    }

    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /admin/retake-sessions/:id/close — Close a retake session
router.patch("/retake-sessions/:id/close", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [updated] = await db
      .update(retakeSessionsTable)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(retakeSessionsTable.id, sessionId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Session introuvable" });

    // Notify teachers that session is closed
    const teachers = await db
      .select({ teacherId: retakeGradesTable.teacherId })
      .from(retakeGradesTable)
      .where(eq(retakeGradesTable.sessionId, sessionId));
    const uniqueTeacherIds = [...new Set(teachers.map(t => t.teacherId))];
    if (uniqueTeacherIds.length > 0) {
      await db.insert(notificationsTable).values(
        uniqueTeacherIds.map(tid => ({
          userId: tid,
          type: "retake_session_closed",
          title: "Session de rattrapage clôturée",
          message: `La session de rattrapage "${updated.label}" a été clôturée. Aucune modification n'est plus possible.`,
          read: false,
        }))
      );
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /admin/retake-sessions/:id/grades — View all submitted grades for a session
router.get("/retake-sessions/:id/grades", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const grades = await db
      .select({
        id: retakeGradesTable.id,
        studentId: retakeGradesTable.studentId,
        studentName: usersTable.name,
        subjectId: retakeGradesTable.subjectId,
        subjectName: subjectsTable.name,
        teacherId: retakeGradesTable.teacherId,
        value: retakeGradesTable.value,
        observation: retakeGradesTable.observation,
        submissionStatus: retakeGradesTable.submissionStatus,
        submittedAt: retakeGradesTable.submittedAt,
        validatedAt: retakeGradesTable.validatedAt,
      })
      .from(retakeGradesTable)
      .leftJoin(usersTable, eq(retakeGradesTable.studentId, usersTable.id))
      .leftJoin(subjectsTable, eq(retakeGradesTable.subjectId, subjectsTable.id))
      .where(eq(retakeGradesTable.sessionId, sessionId))
      .orderBy(asc(usersTable.name));
    res.json(grades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/retake-sessions/:id/validate — Validate submitted grades (copy to main grades table)
router.post("/retake-sessions/:id/validate", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    const session = await db.select().from(retakeSessionsTable).where(eq(retakeSessionsTable.id, sessionId)).limit(1);
    if (!session[0]) return res.status(404).json({ error: "Session introuvable" });

    const submittedGrades = await db
      .select()
      .from(retakeGradesTable)
      .where(and(eq(retakeGradesTable.sessionId, sessionId), eq(retakeGradesTable.submissionStatus, "submitted")));

    if (submittedGrades.length === 0) return res.status(400).json({ error: "Aucune note soumise à valider" });

    for (const rg of submittedGrades) {
      if (rg.value !== null && rg.value !== undefined) {
        // Upsert into main grades table with evaluationNumber=99 (rattrapage)
        await db
          .insert(gradesTable)
          .values({
            studentId: rg.studentId,
            subjectId: rg.subjectId,
            semesterId: session[0].semesterId,
            evaluationNumber: 99,
            value: rg.value,
          })
          .onConflictDoUpdate({
            target: [gradesTable.studentId, gradesTable.subjectId, gradesTable.semesterId, gradesTable.evaluationNumber],
            set: { value: rg.value, updatedAt: new Date() },
          });
      }

      // Mark as validated
      await db
        .update(retakeGradesTable)
        .set({ submissionStatus: "validated", validatedAt: new Date(), updatedAt: new Date() })
        .where(eq(retakeGradesTable.id, rg.id));

      // Notify student
      if (rg.value !== null && rg.value !== undefined) {
        const subject = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, rg.subjectId)).limit(1);
        await db.insert(notificationsTable).values({
          userId: rg.studentId,
          type: "retake_grade_validated",
          title: "Note de rattrapage publiée",
          message: `Votre note de rattrapage en ${subject[0]?.name ?? "matière"} est de ${rg.value}/20.`,
          read: false,
        });
        sendPushToUser(rg.studentId, {
          title: "Note de rattrapage publiée",
          body: `Votre note de rattrapage en ${subject[0]?.name ?? "matière"} est de ${rg.value}/20.`,
          type: "retake_grade_validated",
        }).catch(() => {});
      }
    }

    res.json({ validated: submittedGrades.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAPPORTS & STATISTIQUES
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: get rows from db.execute result (returns pg QueryResult with .rows array)
function firstRow(result: any): any { return (result as any).rows?.[0] ?? {}; }
function allRows(result: any): any[] { return (result as any).rows ?? []; }

// GET /admin/reports/overview — KPIs globaux de l'établissement
router.get("/reports/overview", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId, academicYear } = req.query;

    // Effectifs
    const counts = firstRow(await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'student')::int AS total_students,
        (SELECT COUNT(*) FROM users WHERE role = 'teacher')::int AS total_teachers,
        (SELECT COUNT(*) FROM users WHERE role = 'admin')::int  AS total_admins,
        (SELECT COUNT(*) FROM housing_assignments WHERE status = 'active')::int AS housing_students,
        (SELECT COUNT(*) FROM student_profiles WHERE sexe = 'M')::int AS garcons,
        (SELECT COUNT(*) FROM student_profiles WHERE sexe = 'F')::int AS filles,
        (SELECT COUNT(*) FROM student_profiles WHERE sexe IS NOT NULL)::int AS total_with_sexe
    `));

    // Taux de réussite global
    const semFilter = semesterId ? sql`AND g.semester_id = ${parseInt(semesterId as string)}` : sql``;
    const classFilter = classId ? sql`AND ce.class_id = ${parseInt(classId as string)}` : sql``;
    const successData = firstRow(await db.execute(sql`
      WITH student_avg AS (
        SELECT g.student_id, AVG(g.value) as avg_grade
        FROM grades g
        JOIN class_enrollments ce ON ce.student_id = g.student_id
        WHERE 1=1 ${semFilter} ${classFilter}
        GROUP BY g.student_id
      )
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN avg_grade >= 10 THEN 1 ELSE 0 END)::int AS passed,
        ROUND(AVG(avg_grade)::numeric, 2) AS avg_grade
      FROM student_avg
    `));

    // Taux de présence global
    const presenceWhere = classId ? sql`WHERE class_id = ${parseInt(classId as string)}` : sql`WHERE 1=1`;
    const presenceData = firstRow(await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END)::int AS present
      FROM attendance ${presenceWhere}
    `));

    // Taux de recouvrement financier
    const yearWhere = academicYear
      ? sql`WHERE academic_year = ${academicYear as string}`
      : sql`WHERE 1=1`;
    const financialData = firstRow(await db.execute(sql`
      SELECT
        COALESCE(SUM(sf.total_amount), 0)::numeric AS total_due,
        COALESCE((SELECT SUM(amount) FROM payments), 0)::numeric AS total_paid
      FROM student_fees sf ${yearWhere}
    `));

    // KPIs par classe
    const kpisByClass = allRows(await db.execute(sql`
      SELECT
        c.id   AS class_id,
        c.name AS class_name,
        COUNT(DISTINCT ce.student_id)::int AS student_count,
        COUNT(DISTINCT CASE WHEN sp.sexe = 'M' THEN ce.student_id END)::int AS garcons,
        COUNT(DISTINCT CASE WHEN sp.sexe = 'F' THEN ce.student_id END)::int AS filles,
        ROUND(AVG(g.value)::numeric, 2) AS avg_grade,
        ROUND(
          100.0 * SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::numeric
          / NULLIF(COUNT(a.id), 0), 1
        ) AS presence_rate
      FROM classes c
      LEFT JOIN class_enrollments ce ON ce.class_id = c.id
      LEFT JOIN student_profiles sp ON sp.student_id = ce.student_id
      LEFT JOIN grades g ON g.student_id = ce.student_id ${semesterId ? sql`AND g.semester_id = ${parseInt(semesterId as string)}` : sql``}
      LEFT JOIN attendance a ON a.class_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `));

    const total = Number(successData.total ?? 0);
    const passed = Number(successData.passed ?? 0);
    const presenceTotal = Number(presenceData.total ?? 0);
    const presencePresent = Number(presenceData.present ?? 0);
    const totalDue = Number(financialData.total_due ?? 0);
    const totalPaid = Number(financialData.total_paid ?? 0);

    const garcons = Number(counts.garcons ?? 0);
    const filles = Number(counts.filles ?? 0);
    const totalWithSexe = Number(counts.total_with_sexe ?? 0);

    res.json({
      totalStudents: Number(counts.total_students ?? 0),
      totalTeachers: Number(counts.total_teachers ?? 0),
      totalAdmins: Number(counts.total_admins ?? 0),
      housingStudents: Number(counts.housing_students ?? 0),
      garcons,
      filles,
      totalWithSexe,
      successRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
      avgGrade: Number(successData.avg_grade ?? 0),
      presenceRate: presenceTotal > 0 ? Math.round((presencePresent / presenceTotal) * 1000) / 10 : 0,
      totalDue,
      totalPaid,
      recoveryRate: totalDue > 0 ? Math.round((totalPaid / totalDue) * 1000) / 10 : 0,
      kpisByClass,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /admin/reports/results — Analyse des résultats académiques
router.get("/reports/results", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId } = req.query;
    const semCond = semesterId ? sql`AND g.semester_id = ${parseInt(semesterId as string)}` : sql``;
    const classCond = classId ? sql`AND ce.class_id = ${parseInt(classId as string)}` : sql``;

    // Distribution des mentions par étudiant (moyenne générale)
    const mentions = await db.execute(sql`
      WITH student_avg AS (
        SELECT g.student_id, AVG(g.value) AS avg_grade
        FROM grades g
        JOIN class_enrollments ce ON ce.student_id = g.student_id
        WHERE 1=1 ${semCond} ${classCond}
        GROUP BY g.student_id
      )
      SELECT
        SUM(CASE WHEN avg_grade >= 16 THEN 1 ELSE 0 END)::int AS tres_bien,
        SUM(CASE WHEN avg_grade >= 14 AND avg_grade < 16 THEN 1 ELSE 0 END)::int AS bien,
        SUM(CASE WHEN avg_grade >= 12 AND avg_grade < 14 THEN 1 ELSE 0 END)::int AS assez_bien,
        SUM(CASE WHEN avg_grade >= 10 AND avg_grade < 12 THEN 1 ELSE 0 END)::int AS passable,
        SUM(CASE WHEN avg_grade < 10 THEN 1 ELSE 0 END)::int AS ajourne,
        COUNT(*)::int AS total,
        ROUND(AVG(avg_grade)::numeric, 2) AS avg_grade
      FROM student_avg
    `);

    // Taux de réussite par classe
    const byClass = await db.execute(sql`
      WITH student_avg AS (
        SELECT g.student_id, ce.class_id, AVG(g.value) AS avg_grade
        FROM grades g
        JOIN class_enrollments ce ON ce.student_id = g.student_id
        WHERE 1=1 ${semCond} ${classCond}
        GROUP BY g.student_id, ce.class_id
      )
      SELECT
        c.id AS class_id,
        c.name AS class_name,
        COUNT(sa.student_id)::int AS total,
        SUM(CASE WHEN sa.avg_grade >= 10 THEN 1 ELSE 0 END)::int AS passed,
        ROUND(AVG(sa.avg_grade)::numeric, 2) AS avg_grade,
        ROUND(100.0 * SUM(CASE WHEN sa.avg_grade >= 10 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sa.student_id), 0), 1) AS success_rate
      FROM classes c
      LEFT JOIN student_avg sa ON sa.class_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `);

    // Taux de réussite par matière
    const bySubject = await db.execute(sql`
      WITH subj_avg AS (
        SELECT g.student_id, g.subject_id, AVG(g.value) AS avg_grade
        FROM grades g
        JOIN class_enrollments ce ON ce.student_id = g.student_id
        WHERE 1=1 ${semCond} ${classCond}
        GROUP BY g.student_id, g.subject_id
      )
      SELECT
        s.id AS subject_id,
        s.name AS subject_name,
        s.coefficient,
        COUNT(sa.student_id)::int AS total,
        SUM(CASE WHEN sa.avg_grade >= 10 THEN 1 ELSE 0 END)::int AS passed,
        ROUND(AVG(sa.avg_grade)::numeric, 2) AS avg_grade,
        ROUND(100.0 * SUM(CASE WHEN sa.avg_grade >= 10 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(sa.student_id), 0), 1) AS success_rate
      FROM subjects s
      LEFT JOIN subj_avg sa ON sa.subject_id = s.id
      GROUP BY s.id, s.name, s.coefficient
      HAVING COUNT(sa.student_id) > 0
      ORDER BY success_rate ASC
      LIMIT 20
    `);

    // Meilleurs étudiants
    const topStudents = await db.execute(sql`
      SELECT u.name, c.name AS class_name,
             ROUND(AVG(g.value)::numeric, 2) AS avg_grade
      FROM grades g
      JOIN users u ON u.id = g.student_id
      JOIN class_enrollments ce ON ce.student_id = g.student_id
      JOIN classes c ON c.id = ce.class_id
      WHERE 1=1 ${semCond} ${classCond}
      GROUP BY u.id, u.name, c.name
      ORDER BY avg_grade DESC
      LIMIT 10
    `);

    // Moins bons étudiants
    const bottomStudents = await db.execute(sql`
      SELECT u.name, c.name AS class_name,
             ROUND(AVG(g.value)::numeric, 2) AS avg_grade
      FROM grades g
      JOIN users u ON u.id = g.student_id
      JOIN class_enrollments ce ON ce.student_id = g.student_id
      JOIN classes c ON c.id = ce.class_id
      WHERE 1=1 ${semCond} ${classCond}
      GROUP BY u.id, u.name, c.name
      ORDER BY avg_grade ASC
      LIMIT 10
    `);

    // Rattrapage vs normale
    const retakeStats = await db.execute(sql`
      SELECT
        COUNT(DISTINCT rg.student_id)::int AS retake_students,
        SUM(CASE WHEN rg.value >= 10 THEN 1 ELSE 0 END)::int AS retake_passed,
        ROUND(AVG(rg.value)::numeric, 2) AS retake_avg
      FROM retake_grades rg
      WHERE rg.value IS NOT NULL
    `);

    const m = firstRow(mentions);
    const rs = firstRow(retakeStats);
    res.json({
      mentions: {
        tresBien: Number(m.tres_bien ?? 0),
        bien: Number(m.bien ?? 0),
        assezBien: Number(m.assez_bien ?? 0),
        passable: Number(m.passable ?? 0),
        ajourne: Number(m.ajourne ?? 0),
        total: Number(m.total ?? 0),
      },
      avgGrade: Number(m.avg_grade ?? 0),
      byClass: allRows(byClass).map((r: any) => ({
        classId: r.class_id, className: r.class_name,
        total: Number(r.total), passed: Number(r.passed),
        avgGrade: Number(r.avg_grade ?? 0),
        successRate: Number(r.success_rate ?? 0),
      })),
      bySubject: allRows(bySubject).map((r: any) => ({
        subjectId: r.subject_id, subjectName: r.subject_name,
        coefficient: r.coefficient, total: Number(r.total), passed: Number(r.passed),
        avgGrade: Number(r.avg_grade ?? 0),
        successRate: Number(r.success_rate ?? 0),
      })),
      topStudents: allRows(topStudents).map((r: any) => ({
        name: r.name, className: r.class_name, avgGrade: Number(r.avg_grade),
      })),
      bottomStudents: allRows(bottomStudents).map((r: any) => ({
        name: r.name, className: r.class_name, avgGrade: Number(r.avg_grade),
      })),
      retakeStats: {
        students: Number(rs.retake_students ?? 0),
        passed: Number(rs.retake_passed ?? 0),
        avgGrade: Number(rs.retake_avg ?? 0),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /admin/reports/absences — Analyse des absences
router.get("/reports/absences", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId } = req.query;
    const semCond = semesterId ? sql`AND a.semester_id = ${parseInt(semesterId as string)}` : sql``;
    const classCond = classId ? sql`AND a.class_id = ${parseInt(classId as string)}` : sql``;

    // Taux de présence global
    const globalRate = firstRow(await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END)::int AS present,
        SUM(CASE WHEN status = 'absent' AND justified = true THEN 1 ELSE 0 END)::int AS justified,
        SUM(CASE WHEN status = 'absent' AND (justified IS NULL OR justified = false) THEN 1 ELSE 0 END)::int AS unjustified
      FROM attendance a
      WHERE 1=1 ${semCond} ${classCond}
    `));

    // Taux de présence par classe
    const byClass = await db.execute(sql`
      SELECT
        c.id AS class_id, c.name AS class_name,
        COUNT(a.id)::int AS total,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::int AS present,
        ROUND(100.0 * SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(a.id), 0), 1) AS presence_rate
      FROM classes c
      LEFT JOIN attendance a ON a.class_id = c.id
      WHERE 1=1 ${classCond} ${semCond}
      GROUP BY c.id, c.name
      ORDER BY presence_rate ASC NULLS LAST
    `);

    // Taux de présence par matière (top 10 absences)
    const bySubject = await db.execute(sql`
      SELECT
        s.id AS subject_id, s.name AS subject_name,
        COUNT(a.id)::int AS total,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absences,
        ROUND(100.0 * SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(a.id), 0), 1) AS absence_rate
      FROM subjects s
      LEFT JOIN attendance a ON a.subject_id = s.id
      WHERE 1=1 ${semCond} ${classCond}
      GROUP BY s.id, s.name
      HAVING COUNT(a.id) > 0
      ORDER BY absence_rate DESC
      LIMIT 10
    `);

    // Étudiants au-dessus du seuil (>= 3 absences sur une même matière)
    const aboveThreshold = await db.execute(sql`
      SELECT
        u.name AS student_name,
        c.name AS class_name,
        COUNT(a.id)::int AS absence_count
      FROM attendance a
      JOIN users u ON u.id = a.student_id
      JOIN classes c ON c.id = a.class_id
      WHERE a.status = 'absent'
        ${classCond} ${semCond}
      GROUP BY u.id, u.name, c.name
      HAVING COUNT(a.id) >= 3
      ORDER BY absence_count DESC
      LIMIT 30
    `);

    // Évolution semaine par semaine (8 dernières semaines)
    const weeklyEvolution = await db.execute(sql`
      SELECT
        DATE_TRUNC('week', a.session_date)::date AS week_start,
        COUNT(*)::int AS total,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::int AS present,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absent
      FROM attendance a
      WHERE a.session_date >= CURRENT_DATE - INTERVAL '8 weeks'
        ${classCond}
      GROUP BY DATE_TRUNC('week', a.session_date)
      ORDER BY week_start ASC
    `);

    const g = globalRate;
    const gTotal = Number(g.total ?? 0);
    res.json({
      globalRate: {
        total: gTotal,
        present: Number(g.present ?? 0),
        justified: Number(g.justified ?? 0),
        unjustified: Number(g.unjustified ?? 0),
        presenceRate: gTotal > 0 ? Math.round(Number(g.present ?? 0) / gTotal * 1000) / 10 : 0,
      },
      byClass: allRows(byClass).map((r: any) => ({
        classId: r.class_id, className: r.class_name,
        total: Number(r.total), present: Number(r.present),
        presenceRate: Number(r.presence_rate ?? 0),
      })),
      bySubject: allRows(bySubject).map((r: any) => ({
        subjectId: r.subject_id, subjectName: r.subject_name,
        total: Number(r.total), absences: Number(r.absences),
        absenceRate: Number(r.absence_rate ?? 0),
      })),
      aboveThreshold: allRows(aboveThreshold).map((r: any) => ({
        studentName: r.student_name, className: r.class_name,
        absenceCount: Number(r.absence_count),
      })),
      weeklyEvolution: allRows(weeklyEvolution).map((r: any) => ({
        weekStart: r.week_start,
        total: Number(r.total), present: Number(r.present), absent: Number(r.absent),
        presenceRate: Number(r.total) > 0 ? Math.round(Number(r.present) / Number(r.total) * 1000) / 10 : 0,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /admin/reports/financial — Analyse financière
router.get("/reports/financial", requireRole("admin"), async (req, res) => {
  try {
    const { academicYear } = req.query;
    const yearCond = academicYear ? sql`AND sf.academic_year = ${academicYear as string}` : sql``;

    // Global
    const globalRow = firstRow(await db.execute(sql`
      SELECT
        COALESCE(SUM(sf.total_amount), 0)::numeric AS total_due,
        COALESCE((SELECT SUM(amount) FROM payments), 0)::numeric AS total_paid
      FROM student_fees sf
      WHERE 1=1 ${yearCond}
    `));

    // Par classe
    const byClass = allRows(await db.execute(sql`
      SELECT
        c.id AS class_id, c.name AS class_name,
        COUNT(DISTINCT ce.student_id)::int AS student_count,
        COALESCE(SUM(sf.total_amount), 0)::numeric AS total_due,
        COALESCE(SUM(p_agg.total_paid), 0)::numeric AS total_paid,
        ROUND((100.0 * COALESCE(SUM(p_agg.total_paid), 0) / NULLIF(SUM(sf.total_amount), 0))::numeric, 1) AS recovery_rate
      FROM classes c
      LEFT JOIN class_enrollments ce ON ce.class_id = c.id
      LEFT JOIN student_fees sf ON sf.student_id = ce.student_id ${yearCond}
      LEFT JOIN (
        SELECT student_id, SUM(amount)::numeric AS total_paid
        FROM payments
        GROUP BY student_id
      ) p_agg ON p_agg.student_id = ce.student_id
      GROUP BY c.id, c.name
      ORDER BY c.name
    `));

    // Étudiants en situation d'impayé
    const unpaidStudents = allRows(await db.execute(sql`
      SELECT
        u.name AS student_name,
        c.name AS class_name,
        COALESCE(sf.total_amount, 0)::numeric AS total_due,
        COALESCE(p_agg.total_paid, 0)::numeric AS total_paid,
        (COALESCE(sf.total_amount, 0) - COALESCE(p_agg.total_paid, 0))::numeric AS balance
      FROM users u
      JOIN class_enrollments ce ON ce.student_id = u.id
      JOIN classes c ON c.id = ce.class_id
      LEFT JOIN student_fees sf ON sf.student_id = u.id ${yearCond}
      LEFT JOIN (
        SELECT student_id, SUM(amount)::numeric AS total_paid
        FROM payments
        GROUP BY student_id
      ) p_agg ON p_agg.student_id = u.id
      WHERE u.role = 'student'
        AND (COALESCE(sf.total_amount, 0) - COALESCE(p_agg.total_paid, 0)) > 0
      ORDER BY balance DESC
      LIMIT 50
    `));

    const totalDue = Number(globalRow.total_due ?? 0);
    const totalPaid = Number(globalRow.total_paid ?? 0);
    res.json({
      totalDue,
      totalPaid,
      totalBalance: totalDue - totalPaid,
      recoveryRate: totalDue > 0 ? Math.round((totalPaid / totalDue) * 1000) / 10 : 0,
      byClass: byClass.map(r => ({
        classId: r.class_id, className: r.class_name,
        studentCount: Number(r.student_count),
        totalDue: Number(r.total_due), totalPaid: Number(r.total_paid),
        recoveryRate: Number(r.recovery_rate ?? 0),
      })),
      unpaidStudents: unpaidStudents.map(r => ({
        studentName: r.student_name, className: r.class_name,
        totalDue: Number(r.total_due), totalPaid: Number(r.total_paid),
        balance: Number(r.balance),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// ════════════════════════════════════════════════════════════════════════════
// PARENT MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

// GET /admin/parents — list all parent accounts + their linked students
router.get("/parents", requireRole("admin"), async (req, res) => {
  try {
    const parents = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(eq(usersTable.role, "parent"))
      .orderBy(usersTable.name);

    const parentsWithStudents = await Promise.all(parents.map(async (p) => {
      const links = await db
        .select({ studentId: parentStudentLinksTable.studentId, studentName: usersTable.name, studentEmail: usersTable.email })
        .from(parentStudentLinksTable)
        .innerJoin(usersTable, eq(usersTable.id, parentStudentLinksTable.studentId))
        .where(eq(parentStudentLinksTable.parentId, p.id));
      return { ...p, students: links };
    }));

    res.json(parentsWithStudents);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// POST /admin/parents — create a parent account
router.post("/parents", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (!["scolarite", "directeur"].includes(cu.adminSubRole ?? "")) {
      res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return;
    }
    const { name, email, phone, password, studentIds } = req.body as { name: string; email: string; phone?: string; password: string; studentIds?: number[]; };
    if (!name?.trim() || !email?.trim() || !password?.trim()) { res.status(400).json({ error: "Nom, email et mot de passe requis." }); return; }
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);
    if (existing) { res.status(409).json({ error: "Un compte avec cet email existe déjà." }); return; }
    const [newParent] = await db.insert(usersTable).values({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash: hashPassword(password), role: "parent", phone: phone?.trim() ?? null, mustChangePassword: true }).returning();
    if (studentIds?.length) {
      for (const sid of studentIds) { await db.insert(parentStudentLinksTable).values({ parentId: newParent.id, studentId: sid }).onConflictDoNothing(); }
    }
    await db.insert(activityLogTable).values({ userId: cu.id, action: "parent_created", details: `Parent ${name} (${email}) créé.` });
    res.status(201).json(newParent);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// PUT /admin/parents/:id — update parent
router.put("/parents/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (!["scolarite", "directeur"].includes(cu.adminSubRole ?? "")) { res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return; }
    const id = parseInt(req.params.id);
    const { name, phone } = req.body as { name?: string; phone?: string };
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name?.trim()) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    const [updated] = await db.update(usersTable).set(updates).where(and(eq(usersTable.id, id), eq(usersTable.role, "parent"))).returning();
    if (!updated) { res.status(404).json({ error: "Parent introuvable." }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// DELETE /admin/parents/:id — delete parent account
router.delete("/parents/:id", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (!["scolarite", "directeur"].includes(cu.adminSubRole ?? "")) { res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return; }
    const id = parseInt(req.params.id);
    await db.delete(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "parent")));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

async function computeUeCredits(studentId: number, semesterId: number, subjectsWithGrades: any[]): Promise<{ earned: number; total: number }> {
  const juryRow = await db
    .select({ decision: specialJuryDecisionsTable.decision })
    .from(specialJuryDecisionsTable)
    .where(and(eq(specialJuryDecisionsTable.studentId, studentId), eq(specialJuryDecisionsTable.semesterId, semesterId)))
    .limit(1);

  const ues = await db
    .select({ id: teachingUnitsTable.id, credits: teachingUnitsTable.credits })
    .from(teachingUnitsTable)
    .where(eq(teachingUnitsTable.semesterId, semesterId));

  if (ues.length === 0) {
    const total = subjectsWithGrades.reduce((t: number, s: any) => t + (s.credits ?? 0), 0);
    if (juryRow.length > 0 && juryRow[0].decision === "validated") {
      return { earned: total, total };
    }
    const earned = subjectsWithGrades.filter((s: any) => {
      const g = s.retakeGrade !== null && s.retakeGrade !== undefined ? Math.max(s.grade ?? 0, s.retakeGrade) : s.grade;
      return g !== null && g >= 10;
    }).reduce((t: number, s: any) => t + (s.credits ?? 0), 0);
    return { earned, total };
  }

  const total = ues.reduce((t, ue) => t + ue.credits, 0);

  if (juryRow.length > 0 && juryRow[0].decision === "validated") {
    return { earned: total, total };
  }

  const allSubjects = await db
    .select({ id: subjectsTable.id, ueId: subjectsTable.ueId, coefficient: subjectsTable.coefficient })
    .from(subjectsTable)
    .where(eq(subjectsTable.semesterId, semesterId));

  const gradeBySubject = new Map<number, number | null>();
  for (const s of subjectsWithGrades) {
    const g = s.retakeGrade !== null && s.retakeGrade !== undefined ? Math.max(s.grade ?? 0, s.retakeGrade) : s.grade;
    gradeBySubject.set(s.subjectId, g !== null ? Number(g) : null);
  }

  let earned = 0;
  for (const ue of ues) {
    const ueSubs = allSubjects.filter(s => s.ueId === ue.id);
    if (ueSubs.length === 0) continue;

    const allGraded = ueSubs.every(s => gradeBySubject.has(s.id) && gradeBySubject.get(s.id) !== null);
    if (!allGraded) continue;

    const totalCoeff = ueSubs.reduce((t, s) => t + (s.coefficient ?? 1), 0);
    const weightedSum = ueSubs.reduce((t, s) => t + (gradeBySubject.get(s.id) ?? 0) * (s.coefficient ?? 1), 0);
    const ueAvg = totalCoeff > 0 ? weightedSum / totalCoeff : 0;

    const hasEliminatoryGrade = ueSubs.some(s => {
      const g = gradeBySubject.get(s.id);
      return g !== null && g !== undefined && g <= 6;
    });

    if (ueAvg >= 10 && !hasEliminatoryGrade) {
      earned += ue.credits;
    }
  }

  return { earned, total };
}

// ─── GET /admin/students/:id/academic-tracking ────────────────────────────────
router.get("/students/:id/academic-tracking", requireRole("admin"), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    if (isNaN(studentId)) { res.status(400).json({ error: "ID invalide" }); return; }

    // 1. Student semester averages + subjects
    const semesterGrades = allRows(await db.execute(sql`
      SELECT
        s.id          AS semester_id,
        s.name        AS semester_name,
        s.academic_year,
        sub.id        AS subject_id,
        sub.name      AS subject_name,
        COALESCE(sub.coefficient, 1)::numeric AS coefficient,
        COALESCE(sub.credits, 1)::numeric AS credits,
        g.value       AS grade
      FROM grades g
      JOIN semesters s  ON s.id  = g.semester_id
      JOIN subjects sub ON sub.id = g.subject_id
      WHERE g.student_id = ${studentId}
      ORDER BY s.academic_year, s.name, sub.name
    `));

    // 2. Retake grades
    const retakeRows = allRows(await db.execute(sql`
      SELECT rs.semester_id, sub.name AS subject_name, rg.value AS retake_grade
      FROM retake_grades rg
      JOIN retake_sessions rs ON rs.id = rg.session_id
      JOIN subjects sub ON sub.id = rg.subject_id
      WHERE rg.student_id = ${studentId}
    `));

    // 3. Class averages per semester (all students in same class)
    const studentClass = firstRow(await db.execute(sql`
      SELECT class_id FROM class_enrollments WHERE student_id = ${studentId} ORDER BY id DESC LIMIT 1
    `));
    const classAvgRows = studentClass?.class_id ? allRows(await db.execute(sql`
      WITH class_sem_avgs AS (
        SELECT g.student_id, g.semester_id,
          SUM(g.value * COALESCE(sub.coefficient, 1)) / NULLIF(SUM(COALESCE(sub.coefficient, 1)), 0) AS avg
        FROM grades g
        JOIN subjects sub ON sub.id = g.subject_id
        JOIN class_enrollments ce ON ce.student_id = g.student_id AND ce.class_id = ${studentClass.class_id}
        GROUP BY g.student_id, g.semester_id
      )
      SELECT semester_id,
        COUNT(DISTINCT student_id)::int AS total_students,
        ROUND(AVG(avg)::numeric, 2)     AS class_avg
      FROM class_sem_avgs
      GROUP BY semester_id
    `)) : [];

    // 4. Ranks per semester
    const rankRows = studentClass?.class_id ? allRows(await db.execute(sql`
      WITH class_sem_avgs AS (
        SELECT g.student_id, g.semester_id,
          SUM(g.value * COALESCE(sub.coefficient, 1)) / NULLIF(SUM(COALESCE(sub.coefficient, 1)), 0) AS avg
        FROM grades g
        JOIN subjects sub ON sub.id = g.subject_id
        JOIN class_enrollments ce ON ce.student_id = g.student_id AND ce.class_id = ${studentClass.class_id}
        GROUP BY g.student_id, g.semester_id
      ),
      ranked AS (
        SELECT student_id, semester_id, RANK() OVER (PARTITION BY semester_id ORDER BY avg DESC) AS rank
        FROM class_sem_avgs
      )
      SELECT semester_id, rank::int FROM ranked WHERE student_id = ${studentId}
    `)) : [];

    // 5. Absence by subject
    const absenceRows = allRows(await db.execute(sql`
      SELECT
        a.semester_id,
        sub.name AS subject_name,
        COUNT(*)::int AS total,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absent,
        SUM(CASE WHEN a.status = 'absent' AND a.justified THEN 1 ELSE 0 END)::int AS justified
      FROM attendance a
      JOIN subjects sub ON sub.id = a.subject_id
      WHERE a.student_id = ${studentId}
      GROUP BY a.semester_id, sub.id, sub.name
      ORDER BY a.semester_id, sub.name
    `));

    // ── Build structured response ────────────────────────────────────────────
    // Group grades by semester
    const semMap = new Map<number, any>();
    for (const r of semesterGrades) {
      const sid = Number(r.semester_id);
      if (!semMap.has(sid)) {
        semMap.set(sid, {
          semesterId: sid,
          semesterName: r.semester_name,
          academicYear: r.academic_year,
          subjects: [],
        });
      }
      semMap.get(sid).subjects.push({
        subjectId: Number(r.subject_id),
        subjectName: r.subject_name,
        coefficient: Number(r.coefficient),
        credits: Number(r.credits),
        grade: r.grade !== null ? Number(r.grade) : null,
      });
    }

    const classAvgMap = new Map(classAvgRows.map(r => [Number(r.semester_id), { classAvg: Number(r.class_avg), totalStudents: Number(r.total_students) }]));
    const rankMap    = new Map(rankRows.map(r => [Number(r.semester_id), Number(r.rank)]));
    const retakeMap  = new Map<string, number>();
    for (const r of retakeRows) { retakeMap.set(`${r.semester_id}_${r.subject_name}`, Number(r.retake_grade)); }

    const semestersRaw = await Promise.all(Array.from(semMap.values()).map(async (sem) => {
      const subjects = sem.subjects;
      const totalCoef = subjects.reduce((s: number, g: any) => s + (g.grade !== null ? g.coefficient : 0), 0);
      const weightedSum = subjects.reduce((s: number, g: any) => s + (g.grade !== null ? g.grade * g.coefficient : 0), 0);
      const average = totalCoef > 0 ? Math.round((weightedSum / totalCoef) * 100) / 100 : null;
      const { classAvg, totalStudents } = classAvgMap.get(sem.semesterId) ?? { classAvg: null, totalStudents: 0 };

      const subjectsWithRetake = subjects.map((s: any) => ({
        ...s,
        retakeGrade: retakeMap.get(`${sem.semesterId}_${s.subjectName}`) ?? null,
      }));

      const ueCredits = await computeUeCredits(studentId, sem.semesterId, subjectsWithRetake);

      return {
        ...sem,
        average,
        classAverage: classAvg,
        totalStudents,
        rank: rankMap.get(sem.semesterId) ?? null,
        creditsEarned: ueCredits.earned,
        creditsTotal: ueCredits.total,
        subjects: subjectsWithRetake,
      };
    }));
    const semesters = semestersRaw.sort((a, b) => a.academicYear < b.academicYear ? -1 : a.academicYear > b.academicYear ? 1 : a.semesterName < b.semesterName ? -1 : 1);

    // Absences grouped by semester
    const absencesBySem = new Map<number, any[]>();
    for (const r of absenceRows) {
      const sid = Number(r.semester_id);
      if (!absencesBySem.has(sid)) absencesBySem.set(sid, []);
      absencesBySem.get(sid)!.push({
        subjectName: r.subject_name,
        total: Number(r.total),
        absent: Number(r.absent),
        justified: Number(r.justified),
        absenceRate: Number(r.total) > 0 ? Math.round((Number(r.absent) / Number(r.total)) * 1000) / 10 : 0,
      });
    }

    // Key indicators
    const totalCreditsEarned = semesters.reduce((t, s) => t + (s.creditsEarned ?? 0), 0);
    const totalCreditsAttempted = semesters.reduce((t, s) => t + (s.creditsTotal ?? 0), 0);
    const latestSem = semesters[semesters.length - 1];
    const prevSem   = semesters.length >= 2 ? semesters[semesters.length - 2] : null;

    let trend: "up"|"down"|"stable" = "stable";
    if (latestSem?.average !== null && prevSem?.average !== null) {
      const diff = (latestSem?.average ?? 0) - (prevSem?.average ?? 0);
      if (diff >= 1) trend = "up";
      else if (diff <= -1) trend = "down";
    }

    // Alerts
    const alerts: { type: string; severity: "critical"|"high"|"moderate"; message: string }[] = [];
    if (latestSem && latestSem.average !== null && latestSem.average < 8) {
      alerts.push({ type: "avg_critical", severity: "critical", message: `Moyenne actuelle ${latestSem.average.toFixed(2)}/20 — En dessous du seuil critique de 8/20.` });
    } else if (latestSem && latestSem.average !== null && latestSem.average < 10) {
      alerts.push({ type: "avg_low", severity: "high", message: `Moyenne actuelle ${latestSem.average.toFixed(2)}/20 — Validation du semestre en danger.` });
    }
    for (const sub of (latestSem?.subjects ?? [])) {
      if (sub.grade !== null && sub.grade <= 6) {
        alerts.push({ type: "eliminatoire", severity: "high", message: `Note éliminatoire en ${sub.subjectName} : ${sub.grade.toFixed(2)}/20` });
      }
    }
    const latestAbsences = absencesBySem.get(latestSem?.semesterId ?? -1) ?? [];
    for (const abs of latestAbsences) {
      if (abs.absenceRate > 20) {
        alerts.push({ type: "absence", severity: "moderate", message: `Taux d'absence de ${abs.absenceRate}% en ${abs.subjectName} — Seuil critique dépassé.` });
      }
    }
    if (trend === "down" && prevSem && prevSem.average !== null && latestSem && latestSem.average !== null) {
      alerts.push({ type: "trend_down", severity: "moderate", message: `Baisse de moyenne : ${prevSem.average.toFixed(2)} → ${latestSem.average.toFixed(2)}/20` });
    }

    // Global attendance
    const totalSessions = absenceRows.reduce((t, r) => t + Number(r.total), 0);
    const totalAbsent   = absenceRows.reduce((t, r) => t + Number(r.absent), 0);
    const attendanceRate = totalSessions > 0 ? Math.round((1 - totalAbsent / totalSessions) * 1000) / 10 : null;

    res.json({
      semesters: semesters.map(sem => ({
        ...sem,
        absences: absencesBySem.get(sem.semesterId) ?? [],
      })),
      indicators: {
        creditsEarned: totalCreditsEarned,
        creditsAttempted: totalCreditsAttempted,
        passRate: totalCreditsAttempted > 0 ? Math.round((totalCreditsEarned / totalCreditsAttempted) * 1000) / 10 : null,
        attendanceRate,
        currentRank: latestSem?.rank ?? null,
        totalStudents: latestSem?.totalStudents ?? null,
        currentAverage: latestSem?.average ?? null,
        trend,
      },
      alerts,
    });
  } catch (err) {
    console.error("GET /admin/students/:id/academic-tracking error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /admin/at-risk-students ──────────────────────────────────────────────
router.get("/at-risk-students", requireRole("admin"), async (req, res) => {
  try {
    const { classId, semesterId } = req.query;
    const classFilter = classId ? sql`AND ce.class_id = ${parseInt(classId as string)}` : sql``;
    const semFilter   = semesterId ? sql`AND g.semester_id = ${parseInt(semesterId as string)}` : sql``;

    // Get all students with their latest semester average + min grade
    const atRiskRows = allRows(await db.execute(sql`
      WITH student_sem_stats AS (
        SELECT
          g.student_id,
          g.semester_id,
          s.name AS semester_name,
          s.academic_year,
          SUM(g.value * COALESCE(sub.coefficient, 1)) / NULLIF(SUM(COALESCE(sub.coefficient, 1)), 0) AS avg,
          MIN(g.value) AS min_grade,
          SUM(CASE WHEN g.value <= 6 THEN 1 ELSE 0 END)::int AS eliminatoire_count,
          SUM(CASE WHEN g.value < 10 THEN 1 ELSE 0 END)::int AS failed_subjects
        FROM grades g
        JOIN subjects sub ON sub.id = g.subject_id
        JOIN class_enrollments ce ON ce.student_id = g.student_id
        JOIN semesters s ON s.id = g.semester_id
        WHERE 1=1 ${classFilter} ${semFilter}
        GROUP BY g.student_id, g.semester_id, s.name, s.academic_year
      ),
      latest_per_student AS (
        SELECT DISTINCT ON (student_id) student_id, semester_id, semester_name, academic_year, avg, min_grade, eliminatoire_count, failed_subjects
        FROM student_sem_stats
        ORDER BY student_id, semester_id DESC
      ),
      absence_stats AS (
        SELECT a.student_id, a.semester_id,
          MAX(CASE WHEN att_total > 0 THEN (att_absent::float / att_total) ELSE 0 END) AS max_absence_rate
        FROM (
          SELECT student_id, semester_id, subject_id,
            COUNT(*)::int AS att_total,
            SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END)::int AS att_absent
          FROM attendance
          GROUP BY student_id, semester_id, subject_id
        ) a
        GROUP BY a.student_id, a.semester_id
      ),
      prev_sem AS (
        SELECT DISTINCT ON (student_id) student_id, avg AS prev_avg
        FROM student_sem_stats
        WHERE (student_id, semester_id) NOT IN (
          SELECT student_id, semester_id FROM latest_per_student
        )
        ORDER BY student_id, semester_id DESC
      )
      SELECT
        u.id AS student_id,
        u.name AS student_name,
        c.id AS class_id,
        c.name AS class_name,
        lps.semester_name,
        lps.academic_year,
        lps.semester_id,
        ROUND(lps.avg::numeric, 2) AS average,
        ROUND(lps.min_grade::numeric, 2) AS min_grade,
        lps.eliminatoire_count,
        lps.failed_subjects,
        ROUND(COALESCE(asb.max_absence_rate * 100, 0)::numeric, 1) AS max_absence_pct,
        ROUND(ps.prev_avg::numeric, 2) AS prev_avg
      FROM latest_per_student lps
      JOIN users u ON u.id = lps.student_id
      JOIN class_enrollments ce ON ce.student_id = u.id
      JOIN classes c ON c.id = ce.class_id
      LEFT JOIN absence_stats asb ON asb.student_id = lps.student_id AND asb.semester_id = lps.semester_id
      LEFT JOIN prev_sem ps ON ps.student_id = lps.student_id
      WHERE (
        lps.avg < 10 OR
        lps.min_grade <= 6 OR
        COALESCE(asb.max_absence_rate * 100, 0) > 20 OR
        lps.failed_subjects >= 2
      )
      ORDER BY lps.avg ASC
      LIMIT 200
    `));

    const students = atRiskRows.map(r => {
      const avg = Number(r.average ?? 0);
      const prevAvg = r.prev_avg !== null ? Number(r.prev_avg) : null;
      const minGrade = Number(r.min_grade ?? 20);
      const absencePct = Number(r.max_absence_pct ?? 0);
      const failedSubjects = Number(r.failed_subjects ?? 0);
      const eliminatoire = Number(r.eliminatoire_count ?? 0);

      const reasons: string[] = [];
      if (avg < 8) reasons.push("avg_critical");
      else if (avg < 10) reasons.push("avg_low");
      if (minGrade <= 6) reasons.push("eliminatoire");
      if (absencePct > 20) reasons.push("absence_high");
      if (failedSubjects >= 2) reasons.push("multi_failure");
      if (prevAvg !== null && avg < prevAvg - 1) reasons.push("declining");

      let riskLevel: "critical"|"high"|"moderate";
      if (avg < 8 || minGrade <= 4) riskLevel = "critical";
      else if (minGrade <= 6 || failedSubjects >= 3 || eliminatoire > 0) riskLevel = "high";
      else riskLevel = "moderate";

      return {
        studentId: Number(r.student_id),
        studentName: r.student_name,
        classId: Number(r.class_id),
        className: r.class_name,
        semesterName: r.semester_name,
        academicYear: r.academic_year,
        average: avg,
        prevAverage: prevAvg,
        minGrade,
        maxAbsencePct: absencePct,
        failedSubjects,
        eliminatoireCount: eliminatoire,
        riskLevel,
        reasons,
      };
    });

    res.json({
      students,
      counts: {
        critical: students.filter(s => s.riskLevel === "critical").length,
        high: students.filter(s => s.riskLevel === "high").length,
        moderate: students.filter(s => s.riskLevel === "moderate").length,
      },
    });
  } catch (err) {
    console.error("GET /admin/at-risk-students error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /admin/reports/comparatif — Multi-year comparative analytics ─────────
router.get("/reports/comparatif", requireRole("admin"), async (req, res) => {
  try {
    const { filiere } = req.query;

    // Filter conditions for class
    const classFilterSql = filiere ? sql`
      AND ce.class_id IN (
        SELECT id FROM classes WHERE filiere = ${filiere as string}
      )
    ` : sql``;

    // ── 1. Year-by-year KPIs ──────────────────────────────────────────────────
    const yearlyKpis = allRows(await db.execute(sql`
      WITH student_year_avg AS (
        SELECT
          s.academic_year,
          g.student_id,
          AVG(g.value)::numeric AS avg_grade
        FROM grades g
        JOIN semesters s ON s.id = g.semester_id
        JOIN class_enrollments ce ON ce.student_id = g.student_id
        WHERE 1=1 ${classFilterSql}
        GROUP BY s.academic_year, g.student_id
      ),
      retake_by_year AS (
        SELECT DISTINCT rg.student_id, s.academic_year
        FROM retake_grades rg
        JOIN retake_sessions rs ON rs.id = rg.session_id
        JOIN semesters s ON s.id = rs.semester_id
      ),
      jury_by_year AS (
        SELECT DISTINCT sjd.student_id, sjs.academic_year
        FROM special_jury_decisions sjd
        JOIN special_jury_sessions sjs ON sjs.id = sjd.session_id
      ),
      enrolled_by_year AS (
        SELECT DISTINCT ce.student_id, s.academic_year
        FROM class_enrollments ce
        JOIN grades g ON g.student_id = ce.student_id
        JOIN semesters s ON s.id = g.semester_id
        WHERE 1=1 ${classFilterSql}
      )
      SELECT
        sya.academic_year,
        COUNT(DISTINCT sya.student_id)::int            AS total_students,
        SUM(CASE WHEN sya.avg_grade >= 10 THEN 1 ELSE 0 END)::int AS passed,
        SUM(CASE WHEN sya.avg_grade < 10 THEN 1 ELSE 0 END)::int  AS failed,
        ROUND(AVG(sya.avg_grade), 2)::numeric          AS avg_grade,
        COUNT(DISTINCT rby.student_id)::int            AS retake_students,
        COUNT(DISTINCT jby.student_id)::int            AS jury_students
      FROM student_year_avg sya
      LEFT JOIN retake_by_year rby
        ON rby.student_id = sya.student_id AND rby.academic_year = sya.academic_year
      LEFT JOIN jury_by_year jby
        ON jby.student_id = sya.student_id AND jby.academic_year = sya.academic_year
      GROUP BY sya.academic_year
      ORDER BY sya.academic_year
    `));

    // ── 2. Subject failure rates by year ──────────────────────────────────────
    const subjectByYear = allRows(await db.execute(sql`
      SELECT
        s.academic_year,
        sub.id   AS subject_id,
        sub.name AS subject_name,
        COUNT(DISTINCT g.student_id)::int  AS total_graded,
        SUM(CASE WHEN g.value < 10 THEN 1 ELSE 0 END)::int AS failed,
        ROUND(AVG(g.value)::numeric, 2)    AS avg_grade
      FROM grades g
      JOIN semesters s   ON s.id   = g.semester_id
      JOIN subjects sub  ON sub.id = g.subject_id
      JOIN class_enrollments ce ON ce.student_id = g.student_id
      WHERE 1=1 ${classFilterSql}
      GROUP BY s.academic_year, sub.id, sub.name
      ORDER BY s.academic_year, sub.name
    `));

    // ── 3. Teacher assignments per subject per year ───────────────────────────
    const teacherBySubjectYear = allRows(await db.execute(sql`
      SELECT
        s.academic_year,
        ta.subject_id,
        u.name AS teacher_name
      FROM teacher_assignments ta
      JOIN semesters s ON s.id = ta.semester_id
      JOIN users u     ON u.id = ta.teacher_id
      GROUP BY s.academic_year, ta.subject_id, u.name
      ORDER BY s.academic_year, ta.subject_id
    `));

    // ── 4. Attendance by year ─────────────────────────────────────────────────
    const absenceByYear = allRows(await db.execute(sql`
      SELECT
        s.academic_year,
        COUNT(*)::int AS total,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END)::int AS absent
      FROM attendance a
      JOIN semesters s ON s.id = a.semester_id
      JOIN class_enrollments ce ON ce.student_id = a.student_id AND ce.class_id = a.class_id
      WHERE 1=1 ${classFilterSql}
      GROUP BY s.academic_year
      ORDER BY s.academic_year
    `));

    // ── 5. Teacher comparison (directeur view) ────────────────────────────────
    const teacherComparison = allRows(await db.execute(sql`
      SELECT
        u.id AS teacher_id,
        u.name AS teacher_name,
        s.academic_year,
        COUNT(DISTINCT g.subject_id)::int AS subject_count,
        COUNT(DISTINCT g.student_id)::int AS student_count,
        ROUND(AVG(g.value)::numeric, 2)   AS avg_grade_given,
        SUM(CASE WHEN g.value < 10 THEN 1 ELSE 0 END)::int AS failed_count,
        COUNT(DISTINCT g.id)::int                          AS total_grades
      FROM teacher_assignments ta
      JOIN users u     ON u.id  = ta.teacher_id
      JOIN semesters s ON s.id  = ta.semester_id
      JOIN grades g    ON g.subject_id = ta.subject_id AND g.semester_id = ta.semester_id
      GROUP BY u.id, u.name, s.academic_year
      ORDER BY s.academic_year, u.name
    `));

    // ── 6. Available filieres for filters ────────────────────────────────────
    const filieresRows = allRows(await db.execute(sql`
      SELECT DISTINCT filiere FROM classes WHERE filiere IS NOT NULL ORDER BY filiere
    `));

    res.json({
      yearlyKpis: yearlyKpis.map(r => ({
        academicYear: r.academic_year,
        totalStudents: Number(r.total_students ?? 0),
        passed: Number(r.passed ?? 0),
        failed: Number(r.failed ?? 0),
        avgGrade: Number(r.avg_grade ?? 0),
        retakeStudents: Number(r.retake_students ?? 0),
        juryStudents: Number(r.jury_students ?? 0),
        passRate: Number(r.total_students) > 0
          ? Math.round((Number(r.passed) / Number(r.total_students)) * 1000) / 10
          : 0,
        retakeRate: Number(r.total_students) > 0
          ? Math.round((Number(r.retake_students) / Number(r.total_students)) * 1000) / 10
          : 0,
        juryRate: Number(r.total_students) > 0
          ? Math.round((Number(r.jury_students) / Number(r.total_students)) * 1000) / 10
          : 0,
        failureRate: Number(r.total_students) > 0
          ? Math.round((Number(r.failed) / Number(r.total_students)) * 1000) / 10
          : 0,
      })),
      subjectByYear: subjectByYear.map(r => ({
        academicYear: r.academic_year as string,
        subjectId: Number(r.subject_id),
        subjectName: r.subject_name as string,
        totalGraded: Number(r.total_graded ?? 0),
        failed: Number(r.failed ?? 0),
        avgGrade: Number(r.avg_grade ?? 0),
        failureRate: Number(r.total_graded) > 0
          ? Math.round((Number(r.failed) / Number(r.total_graded)) * 1000) / 10
          : 0,
      })),
      teacherBySubjectYear: teacherBySubjectYear.map(r => ({
        academicYear: r.academic_year as string,
        subjectId: Number(r.subject_id),
        teacherName: r.teacher_name as string,
      })),
      absenceByYear: absenceByYear.map(r => ({
        academicYear: r.academic_year as string,
        total: Number(r.total ?? 0),
        absent: Number(r.absent ?? 0),
        absenceRate: Number(r.total) > 0
          ? Math.round((Number(r.absent) / Number(r.total)) * 1000) / 10
          : 0,
      })),
      teacherComparison: teacherComparison.map(r => ({
        teacherId: Number(r.teacher_id),
        teacherName: r.teacher_name as string,
        academicYear: r.academic_year as string,
        subjectCount: Number(r.subject_count ?? 0),
        studentCount: Number(r.student_count ?? 0),
        avgGradeGiven: Number(r.avg_grade_given ?? 0),
        failedCount: Number(r.failed_count ?? 0),
        totalGrades: Number(r.total_grades ?? 0),
        failureRate: Number(r.total_grades) > 0
          ? Math.round((Number(r.failed_count) / Number(r.total_grades)) * 1000) / 10
          : 0,
      })),
      filieres: filieresRows.map(r => r.filiere as string).filter(Boolean),
    });
  } catch (err) {
    console.error("GET /admin/reports/comparatif error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/parents/:id/students/:studentId — link parent ↔ student
router.post("/parents/:id/students/:studentId", requireRole("admin"), async (req, res) => {
  try {
    await db.insert(parentStudentLinksTable).values({ parentId: parseInt(req.params.id), studentId: parseInt(req.params.studentId) }).onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// DELETE /admin/parents/:id/students/:studentId — unlink
router.delete("/parents/:id/students/:studentId", requireRole("admin"), async (req, res) => {
  try {
    await db.delete(parentStudentLinksTable).where(and(eq(parentStudentLinksTable.parentId, parseInt(req.params.id)), eq(parentStudentLinksTable.studentId, parseInt(req.params.studentId))));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

// POST /admin/parents/:id/reset-password
router.post("/parents/:id/reset-password", requireRole("admin"), async (req, res) => {
  try {
    const cu = req.session.user!;
    if (!["scolarite", "directeur"].includes(cu.adminSubRole ?? "")) { res.status(403).json({ error: "Réservé à la Scolarité et au Directeur." }); return; }
    const { password } = req.body as { password: string };
    if (!password?.trim()) { res.status(400).json({ error: "Mot de passe requis." }); return; }
    const [updated] = await db.update(usersTable).set({ passwordHash: hashPassword(password), mustChangePassword: true, updatedAt: new Date() }).where(and(eq(usersTable.id, parseInt(req.params.id)), eq(usersTable.role, "parent"))).returning({ id: usersTable.id });
    if (!updated) { res.status(404).json({ error: "Parent introuvable." }); return; }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
});

export default router;
