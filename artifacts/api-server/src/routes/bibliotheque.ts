import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  libraryResourcesTable,
  libraryDownloadsTable,
  libraryQuizTable,
  libraryQuizQuestionsTable,
  libraryQuizReponsesTable,
  libraryQuizResultatsTable,
  libraryTimeTrackingTable,
  subjectsTable,
  semestersTable,
  teachingUnitsTable,
  classesTable,
  usersTable,
  teacherAssignmentsTable,
  classEnrollmentsTable,
  notificationsTable,
  parentStudentLinksTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql, ne } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { sendPushToUsers } from "./push.js";
import { emitToUsers } from "../lib/socket.js";
import { objectStorageClient } from "../lib/objectStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const GCS_BUCKET = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
const GCS_PREFIX = "library";

async function uploadToGCS(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
  const ext = path.extname(originalName) || "";
  const objectName = `${GCS_PREFIX}/bib-${randomUUID()}${ext}`;
  const bucket = objectStorageClient.bucket(GCS_BUCKET);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: mimeType, resumable: false });
  return `gcs://${GCS_BUCKET}/${objectName}`;
}

async function downloadFromGCS(gcsUrl: string): Promise<{ stream: Readable; contentType: string; size?: number }> {
  const withoutPrefix = gcsUrl.replace("gcs://", "");
  const slashIdx = withoutPrefix.indexOf("/");
  const bucketName = withoutPrefix.substring(0, slashIdx);
  const objectName = withoutPrefix.substring(slashIdx + 1);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [metadata] = await file.getMetadata();
  const contentType = (metadata.contentType as string) ?? "application/octet-stream";
  const size = metadata.size ? Number(metadata.size) : undefined;
  const stream = file.createReadStream();
  return { stream, contentType, size };
}

const ALLOWED_MIMETYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.ms-powerpoint": "powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
  "image/jpeg": "image",
  "image/png": "image",
  "application/zip": "archive",
  "application/x-rar-compressed": "archive",
  "application/x-zip-compressed": "archive",
  "application/octet-stream": "archive",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES[file.mimetype]) cb(null, true);
    else cb(new Error("Type de fichier non autorisé"));
  },
});

const router = Router();

// ─── Helper: get student's enrolled class IDs ────────────────────────────────
async function getStudentClassIds(studentId: number): Promise<number[]> {
  const rows = await db
    .select({ classId: classEnrollmentsTable.classId })
    .from(classEnrollmentsTable)
    .where(eq(classEnrollmentsTable.studentId, studentId));
  return rows.map(r => r.classId);
}

// ─── Helper: build rich resource list ───────────────────────────────────────
async function buildResourceList(where: any) {
  const rows = await db
    .select({
      id: libraryResourcesTable.id,
      title: libraryResourcesTable.title,
      type: libraryResourcesTable.type,
      subjectId: libraryResourcesTable.subjectId,
      semesterId: libraryResourcesTable.semesterId,
      classIds: libraryResourcesTable.classIds,
      teacherId: libraryResourcesTable.teacherId,
      fileUrl: libraryResourcesTable.fileUrl,
      fileName: libraryResourcesTable.fileName,
      fileSize: libraryResourcesTable.fileSize,
      description: libraryResourcesTable.description,
      availableFrom: libraryResourcesTable.availableFrom,
      suspended: libraryResourcesTable.suspended,
      downloadCount: libraryResourcesTable.downloadCount,
      createdAt: libraryResourcesTable.createdAt,
      updatedAt: libraryResourcesTable.updatedAt,
      subjectName: subjectsTable.name,
      semesterName: semestersTable.name,
      teacherName: usersTable.name,
      ueId: teachingUnitsTable.id,
      ueName: teachingUnitsTable.name,
      ueCode: teachingUnitsTable.code,
    })
    .from(libraryResourcesTable)
    .leftJoin(subjectsTable, eq(libraryResourcesTable.subjectId, subjectsTable.id))
    .leftJoin(semestersTable, eq(libraryResourcesTable.semesterId, semestersTable.id))
    .leftJoin(usersTable, eq(libraryResourcesTable.teacherId, usersTable.id))
    .leftJoin(teachingUnitsTable, eq(subjectsTable.ueId, teachingUnitsTable.id))
    .where(where)
    .orderBy(desc(libraryResourcesTable.createdAt));

  return rows.map(r => ({
    ...r,
    classIds: JSON.parse(r.classIds || "[]") as number[],
  }));
}

// ─── GET /api/bibliotheque ───────────────────────────────────────────────────
router.get("/bibliotheque", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [me] = await db.select({ role: usersTable.role, adminSubRole: usersTable.adminSubRole })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!me) { res.status(401).json({ error: "Non authentifié" }); return; }

    const { semesterId, subjectId } = req.query;

    const tid = req.tenantId!;

    if (me.role === "teacher") {
      const conditions: any[] = [eq(libraryResourcesTable.teacherId, userId), eq(libraryResourcesTable.tenantId, tid)];
      if (semesterId) conditions.push(eq(libraryResourcesTable.semesterId, Number(semesterId)));
      if (subjectId) conditions.push(eq(libraryResourcesTable.subjectId, Number(subjectId)));
      const resources = await buildResourceList(and(...conditions));
      res.json({ resources });
      return;
    }

    if (me.role === "admin") {
      const conditions: any[] = [eq(libraryResourcesTable.tenantId, tid)];
      if (semesterId) conditions.push(eq(libraryResourcesTable.semesterId, Number(semesterId)));
      if (subjectId) conditions.push(eq(libraryResourcesTable.subjectId, Number(subjectId)));
      const resources = await buildResourceList(and(...conditions));
      res.json({ resources });
      return;
    }

    if (me.role === "student") {
      const classIds = await getStudentClassIds(userId);
      if (classIds.length === 0) { res.json({ resources: [] }); return; }

      const conditions: any[] = [eq(libraryResourcesTable.suspended, false), eq(libraryResourcesTable.tenantId, tid)];
      if (semesterId) conditions.push(eq(libraryResourcesTable.semesterId, Number(semesterId)));
      if (subjectId) conditions.push(eq(libraryResourcesTable.subjectId, Number(subjectId)));

      const all = await buildResourceList(and(...conditions));
      const now = new Date();
      const filtered = all.filter(r => {
        if (r.availableFrom && new Date(r.availableFrom) > now) return false;
        const rClassIds = r.classIds as number[];
        return rClassIds.length === 0 || rClassIds.some(cid => classIds.includes(cid));
      });

      const downloads = await db
        .select({ resourceId: libraryDownloadsTable.resourceId })
        .from(libraryDownloadsTable)
        .where(eq(libraryDownloadsTable.studentId, userId));
      const downloadedSet = new Set(downloads.map(d => d.resourceId));

      res.json({ resources: filtered.map(r => ({ ...r, alreadyDownloaded: downloadedSet.has(r.id) })) });
      return;
    }

    if (me.role === "parent") {
      const links = await db
        .select({ studentId: parentStudentLinksTable.studentId })
        .from(parentStudentLinksTable)
        .where(eq(parentStudentLinksTable.parentId, userId));
      if (links.length === 0) { res.json({ resources: [] }); return; }

      const studentId = links[0].studentId;
      const classIds = await getStudentClassIds(studentId);
      if (classIds.length === 0) { res.json({ resources: [] }); return; }

      const conditions: any[] = [eq(libraryResourcesTable.suspended, false), eq(libraryResourcesTable.tenantId, tid)];
      if (semesterId) conditions.push(eq(libraryResourcesTable.semesterId, Number(semesterId)));

      const all = await buildResourceList(and(...conditions));
      const now = new Date();
      const filtered = all.filter(r => {
        if (r.availableFrom && new Date(r.availableFrom) > now) return false;
        const rClassIds = r.classIds as number[];
        return rClassIds.length === 0 || rClassIds.some(cid => classIds.includes(cid));
      });
      res.json({ resources: filtered });
      return;
    }

    res.status(403).json({ error: "Accès refusé" });
  } catch (err) {
    console.error("[bibliotheque GET]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/semesters ────────────────────────────────────────
router.get("/bibliotheque/semesters", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [me] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    const tid = req.tenantId!;
    if (me?.role === "teacher") {
      const assignments = await db
        .select({ semesterId: teacherAssignmentsTable.semesterId })
        .from(teacherAssignmentsTable)
        .where(eq(teacherAssignmentsTable.teacherId, userId));
      const semIds = [...new Set(assignments.map(a => a.semesterId).filter(Boolean) as number[])];
      if (semIds.length === 0) { res.json({ semesters: [] }); return; }
      const semesters = await db.select().from(semestersTable).where(and(inArray(semestersTable.id, semIds), eq(semestersTable.tenantId, tid)));
      res.json({ semesters });
    } else {
      const semesters = await db.select().from(semestersTable).where(eq(semestersTable.tenantId, tid)).orderBy(desc(semestersTable.createdAt));
      res.json({ semesters });
    }
  } catch (err) {
    console.error("[bibliotheque/semesters]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/subjects ─────────────────────────────────────────
router.get("/bibliotheque/subjects", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const assignments = await db
      .select({
        subjectId: teacherAssignmentsTable.subjectId,
        classId: teacherAssignmentsTable.classId,
        semesterId: teacherAssignmentsTable.semesterId,
        subjectName: subjectsTable.name,
        ueId: teachingUnitsTable.id,
        ueName: teachingUnitsTable.name,
      })
      .from(teacherAssignmentsTable)
      .leftJoin(subjectsTable, eq(teacherAssignmentsTable.subjectId, subjectsTable.id))
      .leftJoin(teachingUnitsTable, eq(subjectsTable.ueId, teachingUnitsTable.id))
      .where(eq(teacherAssignmentsTable.teacherId, teacherId));
    res.json({ subjects: assignments });
  } catch (err) {
    console.error("[bibliotheque/subjects]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/stats ────────────────────────────────────────────
router.get("/bibliotheque/stats", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const resources = await db
      .select({
        id: libraryResourcesTable.id,
        title: libraryResourcesTable.title,
        downloadCount: libraryResourcesTable.downloadCount,
        subjectName: subjectsTable.name,
      })
      .from(libraryResourcesTable)
      .leftJoin(subjectsTable, eq(libraryResourcesTable.subjectId, subjectsTable.id))
      .where(eq(libraryResourcesTable.teacherId, teacherId))
      .orderBy(desc(libraryResourcesTable.downloadCount));

    const totalPublished = resources.length;
    const totalDownloads = resources.reduce((s, r) => s + (r.downloadCount ?? 0), 0);

    res.json({ resources, totalPublished, totalDownloads });
  } catch (err) {
    console.error("[bibliotheque/stats]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /api/bibliotheque/upload ───────────────────────────────────────────
router.post("/bibliotheque/upload", requireRole("teacher"), (req, res) => {
  upload.single("fichier")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }

    try {
      const teacherId = req.session!.userId!;
      const { title, subjectId, semesterId, classIds, description, availableFrom } = req.body;

      if (!title || !req.file) {
        res.status(400).json({ error: "Titre et fichier requis" });
        return;
      }

      const mime = req.file.mimetype;
      const resourceType = ALLOWED_MIMETYPES[mime] as any;

      if (subjectId) {
        const [assignment] = await db
          .select({ id: teacherAssignmentsTable.id })
          .from(teacherAssignmentsTable)
          .where(and(
            eq(teacherAssignmentsTable.teacherId, teacherId),
            eq(teacherAssignmentsTable.subjectId, Number(subjectId))
          ))
          .limit(1);
        if (!assignment) {
          res.status(403).json({ error: "Vous n'êtes pas affecté à cette matière" });
          return;
        }
      }

      const parsedClassIds: number[] = classIds
        ? (Array.isArray(classIds) ? classIds.map(Number) : JSON.parse(classIds))
        : [];

      const gcsUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype);

      const [resource] = await db
        .insert(libraryResourcesTable)
        .values({
          title,
          type: resourceType,
          subjectId: subjectId ? Number(subjectId) : null,
          semesterId: semesterId ? Number(semesterId) : null,
          classIds: JSON.stringify(parsedClassIds),
          teacherId,
          fileUrl: gcsUrl,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          description: description || null,
          availableFrom: availableFrom ? new Date(availableFrom) : null,
          tenantId: req.tenantId!,
        })
        .returning();

      if (parsedClassIds.length > 0) {
        const [teacher] = await db
          .select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, teacherId))
          .limit(1);
        const teacherName = teacher?.name ?? "Un enseignant";

        const subjectRow = subjectId
          ? await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, Number(subjectId))).limit(1)
          : [];
        const subjectName = subjectRow[0]?.name ?? "une matière";

        const enrollments = await db
          .select({ studentId: classEnrollmentsTable.studentId })
          .from(classEnrollmentsTable)
          .where(inArray(classEnrollmentsTable.classId, parsedClassIds));
        const studentIds = [...new Set(enrollments.map(e => e.studentId))];

        if (studentIds.length > 0) {
          await db.insert(notificationsTable).values(
            studentIds.map(uid => ({
              userId: uid,
              type: "nouveau_support",
              title: "Nouveau support de cours",
              message: `${teacherName} a publié "${title}" en ${subjectName}`,
            }))
          );
          sendPushToUsers(studentIds, {
            title: "Nouveau support de cours",
            body: `${teacherName} a publié "${title}" en ${subjectName}`,
            type: "nouveau_support",
          }).catch(() => {});
          emitToUsers(studentIds, "notification:new");
        }
      }

      res.json({ resource });
    } catch (err2) {
      console.error("[bibliotheque/upload]", err2);
      res.status(500).json({ error: "Erreur lors de l'upload" });
    }
  });
});

// ─── POST /api/bibliotheque/link ─────────────────────────────────────────────
router.post("/bibliotheque/link", requireRole("teacher"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { title, type, url, subjectId, semesterId, classIds, description, availableFrom } = req.body;

    if (!title || !url || !["youtube", "link"].includes(type)) {
      res.status(400).json({ error: "Titre, URL et type (youtube/link) requis" });
      return;
    }

    if (subjectId) {
      const [assignment] = await db
        .select({ id: teacherAssignmentsTable.id })
        .from(teacherAssignmentsTable)
        .where(and(
          eq(teacherAssignmentsTable.teacherId, teacherId),
          eq(teacherAssignmentsTable.subjectId, Number(subjectId))
        ))
        .limit(1);
      if (!assignment) {
        res.status(403).json({ error: "Vous n'êtes pas affecté à cette matière" });
        return;
      }
    }

    const parsedClassIds: number[] = classIds
      ? (Array.isArray(classIds) ? classIds.map(Number) : JSON.parse(classIds))
      : [];

    const [resource] = await db
      .insert(libraryResourcesTable)
      .values({
        title,
        type: type as any,
        subjectId: subjectId ? Number(subjectId) : null,
        semesterId: semesterId ? Number(semesterId) : null,
        classIds: JSON.stringify(parsedClassIds),
        teacherId,
        fileUrl: url,
        description: description || null,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
      })
      .returning();

    if (parsedClassIds.length > 0) {
      const [teacher] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, teacherId)).limit(1);
      const teacherName = teacher?.name ?? "Un enseignant";
      const subjectRow = subjectId
        ? await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, Number(subjectId))).limit(1)
        : [];
      const subjectName = subjectRow[0]?.name ?? "une matière";

      const enrollments = await db
        .select({ studentId: classEnrollmentsTable.studentId })
        .from(classEnrollmentsTable)
        .where(inArray(classEnrollmentsTable.classId, parsedClassIds));
      const studentIds = [...new Set(enrollments.map(e => e.studentId))];
      if (studentIds.length > 0) {
        await db.insert(notificationsTable).values(
          studentIds.map(uid => ({
            userId: uid,
            type: "nouveau_support",
            title: "Nouveau support de cours",
            message: `${teacherName} a partagé "${title}" en ${subjectName}`,
          }))
        );
        sendPushToUsers(studentIds, { title: "Nouveau support", body: `${teacherName} a partagé "${title}"`, type: "nouveau_support" }).catch(() => {});
        emitToUsers(studentIds, "notification:new");
      }
    }

    res.json({ resource });
  } catch (err) {
    console.error("[bibliotheque/link]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /api/bibliotheque/:id ───────────────────────────────────────────────
router.put("/bibliotheque/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = Number(req.params.id);
    const [me] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const [resource] = await db.select().from(libraryResourcesTable).where(eq(libraryResourcesTable.id, id)).limit(1);

    if (!resource) { res.status(404).json({ error: "Support introuvable" }); return; }
    if (me?.role !== "admin" && resource.teacherId !== userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }

    const { title, description, availableFrom, classIds } = req.body;
    const parsedClassIds = classIds
      ? (Array.isArray(classIds) ? classIds.map(Number) : JSON.parse(classIds))
      : undefined;

    const [updated] = await db
      .update(libraryResourcesTable)
      .set({
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(availableFrom !== undefined && { availableFrom: availableFrom ? new Date(availableFrom) : null }),
        ...(parsedClassIds !== undefined && { classIds: JSON.stringify(parsedClassIds) }),
        updatedAt: new Date(),
      })
      .where(eq(libraryResourcesTable.id, id))
      .returning();

    res.json({ resource: updated });
  } catch (err) {
    console.error("[bibliotheque PUT]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /api/bibliotheque/:id ────────────────────────────────────────────
router.delete("/bibliotheque/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = Number(req.params.id);
    const [me] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const [resource] = await db.select().from(libraryResourcesTable).where(eq(libraryResourcesTable.id, id)).limit(1);

    if (!resource) { res.status(404).json({ error: "Support introuvable" }); return; }
    if (me?.role !== "admin" && resource.teacherId !== userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }

    if (resource.fileUrl?.startsWith("gcs://")) {
      try {
        const withoutPrefix = resource.fileUrl.replace("gcs://", "");
        const slashIdx = withoutPrefix.indexOf("/");
        const bucketName = withoutPrefix.substring(0, slashIdx);
        const objectName = withoutPrefix.substring(slashIdx + 1);
        await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
      } catch { /* ignore GCS deletion errors */ }
    } else if (resource.fileUrl?.startsWith("/api/uploads/")) {
      const filename = resource.fileUrl.split("/api/uploads/")[1];
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.delete(libraryResourcesTable).where(eq(libraryResourcesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[bibliotheque DELETE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /api/bibliotheque/:id/suspend ─────────────────────────────────────
router.patch("/bibliotheque/:id/suspend", requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { suspended } = req.body;
    await db
      .update(libraryResourcesTable)
      .set({ suspended: Boolean(suspended), updatedAt: new Date() })
      .where(eq(libraryResourcesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[bibliotheque suspend]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/:id/download ──────────────────────────────────────
router.get("/bibliotheque/:id/download", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = Number(req.params.id);
    const [me] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const [resource] = await db.select().from(libraryResourcesTable).where(eq(libraryResourcesTable.id, id)).limit(1);

    if (!resource) { res.status(404).json({ error: "Support introuvable" }); return; }
    if (resource.suspended && me?.role !== "admin") {
      res.status(403).json({ error: "Support suspendu" }); return;
    }

    if (me?.role === "student") {
      const existing = await db
        .select({ id: libraryDownloadsTable.id })
        .from(libraryDownloadsTable)
        .where(and(
          eq(libraryDownloadsTable.resourceId, id),
          eq(libraryDownloadsTable.studentId, userId)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(libraryDownloadsTable).values({ resourceId: id, studentId: userId });
        await db
          .update(libraryResourcesTable)
          .set({ downloadCount: sql`${libraryResourcesTable.downloadCount} + 1` })
          .where(eq(libraryResourcesTable.id, id));
      }
    }

    if (resource.fileUrl?.startsWith("gcs://")) {
      const originalName = resource.fileName || "fichier";
      const isPreview = req.query.mode === "preview";
      const { stream, contentType, size } = await downloadFromGCS(resource.fileUrl);
      res.setHeader("Content-Type", contentType);
      if (size) res.setHeader("Content-Length", size);
      if (isPreview) {
        res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`);
      } else {
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
      }
      stream.pipe(res);
      return;
    }

    if (resource.fileUrl?.startsWith("/api/uploads/")) {
      const filename = resource.fileUrl.split("/api/uploads/")[1];
      const filePath = path.join(UPLOADS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "Fichier introuvable sur le serveur. Ce fichier a peut-être été perdu suite à un redéploiement." });
        return;
      }
      const originalName = resource.fileName || filename;
      const isPreview = req.query.mode === "preview";
      if (isPreview) {
        res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`);
      } else {
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
      }
      res.sendFile(filePath);
      return;
    }

    if (resource.fileUrl && (resource.fileUrl.startsWith("http://") || resource.fileUrl.startsWith("https://"))) {
      res.json({ url: resource.fileUrl });
      return;
    }

    res.status(400).json({ error: "Aucun fichier associé" });
  } catch (err) {
    console.error("[bibliotheque download]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/:id/non-consultants ───────────────────────────────
router.get("/bibliotheque/:id/non-consultants", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [resource] = await db.select().from(libraryResourcesTable).where(eq(libraryResourcesTable.id, id)).limit(1);
    if (!resource) { res.status(404).json({ error: "Support introuvable" }); return; }

    const classIds = JSON.parse(resource.classIds || "[]") as number[];
    if (classIds.length === 0) { res.json({ students: [] }); return; }

    const enrolled = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(inArray(classEnrollmentsTable.classId, classIds));
    const enrolledIds = enrolled.map(e => e.studentId);

    const downloaded = await db
      .select({ studentId: libraryDownloadsTable.studentId })
      .from(libraryDownloadsTable)
      .where(eq(libraryDownloadsTable.resourceId, id));
    const downloadedIds = new Set(downloaded.map(d => d.studentId));

    const notConsultedIds = enrolledIds.filter(sid => !downloadedIds.has(sid));
    if (notConsultedIds.length === 0) { res.json({ students: [] }); return; }

    const students = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, notConsultedIds));

    res.json({ students });
  } catch (err) {
    console.error("[bibliotheque non-consultants]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /api/bibliotheque/tracker ──────────────────────────────────────────
// Log time spent on a resource by a student
router.post("/bibliotheque/tracker", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const { resourceId, seconds } = req.body;
    if (!resourceId || !seconds || seconds < 5) { res.status(400).json({ error: "Données invalides" }); return; }

    await db.insert(libraryTimeTrackingTable).values({
      resourceId: Number(resourceId),
      studentId,
      durreeSecondes: Math.min(Number(seconds), 7200), // cap 2h
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[tracker]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/my-progress ───────────────────────────────────────
// Student's personal learning progress (time + quiz scores per resource)
router.get("/bibliotheque/my-progress", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;

    const timeRows = (await db.execute(
      sql`SELECT resource_id, SUM(duree_secondes) as total_sec FROM library_time_tracking WHERE student_id = ${studentId} GROUP BY resource_id`
    ) as any).rows ?? [];

    const quizRows = (await db.execute(
      sql`SELECT r.quiz_id, r.score, r.max_score, r.tentative, r.termine_le, q.titre as quiz_titre, q.resource_id
          FROM library_quiz_resultats r
          JOIN library_quiz q ON q.id = r.quiz_id
          WHERE r.etudiant_id = ${studentId}
          ORDER BY r.termine_le DESC`
    ) as any).rows ?? [];

    const downloads = (await db.execute(
      sql`SELECT resource_id FROM library_downloads WHERE student_id = ${studentId}`
    ) as any).rows ?? [];

    res.json({
      timeByResource: timeRows,
      quizResults: quizRows,
      downloadedIds: downloads.map((d: any) => d.resource_id),
    });
  } catch (err) {
    console.error("[my-progress]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/quiz ───────────────────────────────────────────────
// Get quiz(zes) for a resource
router.get("/bibliotheque/quiz", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [me] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const { resourceId } = req.query;
    if (!resourceId) { res.status(400).json({ error: "resourceId requis" }); return; }

    const quizzes = (await db.execute(
      sql`SELECT q.*, COUNT(qq.id)::int as question_count
          FROM library_quiz q
          LEFT JOIN library_quiz_questions qq ON qq.quiz_id = q.id
          WHERE q.resource_id = ${Number(resourceId)} AND q.actif = true
          GROUP BY q.id
          ORDER BY q.cree_le DESC`
    ) as any).rows ?? [];

    if (me?.role !== "teacher" && me?.role !== "admin") {
      // Students only see basic info (no correct answers)
      res.json({ quizzes: quizzes.map((q: any) => ({ id: q.id, titre: q.titre, duree_minutes: q.duree_minutes, note_minimale: q.note_minimale, nb_tentatives: q.nb_tentatives, question_count: q.question_count })) });
      return;
    }

    // Teacher/admin: full details with questions + answers
    const enriched = await Promise.all(quizzes.map(async (q: any) => {
      const questions = (await db.execute(
        sql`SELECT qq.*, json_agg(json_build_object('id', r.id, 'texte', r.texte, 'est_correcte', r.est_correcte, 'ordre', r.ordre) ORDER BY r.ordre) FILTER (WHERE r.id IS NOT NULL) as reponses
            FROM library_quiz_questions qq
            LEFT JOIN library_quiz_reponses r ON r.question_id = qq.id
            WHERE qq.quiz_id = ${q.id}
            GROUP BY qq.id
            ORDER BY qq.ordre`
      ) as any).rows ?? [];
      return { ...q, questions };
    }));

    res.json({ quizzes: enriched });
  } catch (err) {
    console.error("[quiz GET]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /api/bibliotheque/quiz ─────────────────────────────────────────────
// Create a quiz (teacher only)
router.post("/bibliotheque/quiz", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const { resourceId, titre, durreeMinutes, noteMinimale, nbTentatives, questions } = req.body;
    if (!resourceId || !titre || !questions?.length) { res.status(400).json({ error: "Données incomplètes" }); return; }

    const [quiz] = await db.insert(libraryQuizTable).values({
      resourceId: Number(resourceId),
      titre,
      durreeMinutes: durreeMinutes ? Number(durreeMinutes) : null,
      noteMinimale: noteMinimale ? Number(noteMinimale) : null,
      nbTentatives: nbTentatives ? Number(nbTentatives) : 2,
      creePar: userId,
    }).returning();

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const [dbQ] = await db.insert(libraryQuizQuestionsTable).values({
        quizId: quiz.id,
        texte: q.texte,
        type: q.type ?? "qcm",
        explication: q.explication ?? null,
        points: q.points ?? 1,
        ordre: i + 1,
      }).returning();

      if (q.reponses?.length) {
        for (let j = 0; j < q.reponses.length; j++) {
          const r = q.reponses[j];
          await db.insert(libraryQuizReponsesTable).values({
            questionId: dbQ.id,
            texte: r.texte,
            estCorrecte: !!r.estCorrecte,
            ordre: j + 1,
          });
        }
      }
    }

    res.json({ quiz: { ...quiz, id: quiz.id } });
  } catch (err) {
    console.error("[quiz POST]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /api/bibliotheque/quiz/:id ──────────────────────────────────────────
// Update a quiz (teacher only — rebuilds questions)
router.put("/bibliotheque/quiz/:id", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const quizId = Number(req.params.id);
    const { titre, durreeMinutes, noteMinimale, nbTentatives, actif, questions } = req.body;

    await db.update(libraryQuizTable).set({
      titre,
      durreeMinutes: durreeMinutes ? Number(durreeMinutes) : null,
      noteMinimale: noteMinimale ? Number(noteMinimale) : null,
      nbTentatives: nbTentatives ? Number(nbTentatives) : 2,
      actif: actif !== undefined ? Boolean(actif) : true,
    }).where(eq(libraryQuizTable.id, quizId));

    if (questions) {
      // Delete old questions (cascades to reponses)
      const oldQs = await db.select({ id: libraryQuizQuestionsTable.id }).from(libraryQuizQuestionsTable).where(eq(libraryQuizQuestionsTable.quizId, quizId));
      if (oldQs.length > 0) {
        await db.delete(libraryQuizReponsesTable).where(inArray(libraryQuizReponsesTable.questionId, oldQs.map(q => q.id)));
        await db.delete(libraryQuizQuestionsTable).where(eq(libraryQuizQuestionsTable.quizId, quizId));
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const [dbQ] = await db.insert(libraryQuizQuestionsTable).values({
          quizId,
          texte: q.texte,
          type: q.type ?? "qcm",
          explication: q.explication ?? null,
          points: q.points ?? 1,
          ordre: i + 1,
        }).returning();
        if (q.reponses?.length) {
          for (let j = 0; j < q.reponses.length; j++) {
            const r = q.reponses[j];
            await db.insert(libraryQuizReponsesTable).values({
              questionId: dbQ.id,
              texte: r.texte,
              estCorrecte: !!r.estCorrecte,
              ordre: j + 1,
            });
          }
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[quiz PUT]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /api/bibliotheque/quiz/:id ───────────────────────────────────────
router.delete("/bibliotheque/quiz/:id", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const quizId = Number(req.params.id);
    await db.delete(libraryQuizTable).where(eq(libraryQuizTable.id, quizId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[quiz DELETE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/quiz/:id/take ─────────────────────────────────────
// Get quiz for taking by student (no correct answers revealed)
router.get("/bibliotheque/quiz/:id/take", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const quizId = Number(req.params.id);

    const [quiz] = await db.select().from(libraryQuizTable).where(and(eq(libraryQuizTable.id, quizId), eq(libraryQuizTable.actif, true))).limit(1);
    if (!quiz) { res.status(404).json({ error: "Quiz introuvable" }); return; }

    // Check attempt count
    const attempts = (await db.execute(
      sql`SELECT COUNT(*) as cnt FROM library_quiz_resultats WHERE quiz_id = ${quizId} AND etudiant_id = ${studentId}`
    ) as any).rows[0];
    const attemptCount = Number((attempts as any).cnt ?? 0);
    if (attemptCount >= quiz.nbTentatives) {
      res.status(403).json({ error: "Nombre maximum de tentatives atteint", maxReached: true });
      return;
    }

    const questions = (await db.execute(
      sql`SELECT qq.id, qq.texte, qq.type, qq.points, qq.ordre,
          json_agg(json_build_object('id', r.id, 'texte', r.texte, 'ordre', r.ordre) ORDER BY r.ordre) FILTER (WHERE r.id IS NOT NULL) as reponses
          FROM library_quiz_questions qq
          LEFT JOIN library_quiz_reponses r ON r.question_id = qq.id
          WHERE qq.quiz_id = ${quizId}
          GROUP BY qq.id
          ORDER BY qq.ordre`
    ) as any).rows ?? [];

    res.json({
      quiz: {
        id: quiz.id,
        titre: quiz.titre,
        durreeMinutes: quiz.durreeMinutes,
        noteMinimale: quiz.noteMinimale,
        nbTentatives: quiz.nbTentatives,
        tentativeActuelle: attemptCount + 1,
      },
      questions,
    });
  } catch (err) {
    console.error("[quiz take]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /api/bibliotheque/quiz/:id/submit ───────────────────────────────────
// Submit quiz answers (student)
router.post("/bibliotheque/quiz/:id/submit", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;
    const quizId = Number(req.params.id);
    const { reponses, durreeSecondes } = req.body; // reponses: { [questionId]: answerId | answerId[] | string }

    const [quiz] = await db.select().from(libraryQuizTable).where(eq(libraryQuizTable.id, quizId)).limit(1);
    if (!quiz) { res.status(404).json({ error: "Quiz introuvable" }); return; }

    const attempts = (await db.execute(
      sql`SELECT COUNT(*) as cnt FROM library_quiz_resultats WHERE quiz_id = ${quizId} AND etudiant_id = ${studentId}`
    ) as any).rows[0];
    const attemptCount = Number((attempts as any).cnt ?? 0);
    if (attemptCount >= quiz.nbTentatives) {
      res.status(403).json({ error: "Nombre maximum de tentatives atteint" }); return;
    }

    const questions = (await db.execute(
      sql`SELECT qq.id, qq.type, qq.points,
          json_agg(json_build_object('id', r.id, 'texte', r.texte, 'est_correcte', r.est_correcte) ORDER BY r.ordre) FILTER (WHERE r.id IS NOT NULL) as reponses,
          qq.explication
          FROM library_quiz_questions qq
          LEFT JOIN library_quiz_reponses r ON r.question_id = qq.id
          WHERE qq.quiz_id = ${quizId}
          GROUP BY qq.id
          ORDER BY qq.ordre`
    ) as any).rows ?? [];

    let score = 0;
    let maxScore = 0;
    const feedback: any[] = [];

    for (const q of questions) {
      maxScore += q.points;
      const given = reponses?.[String(q.id)];
      const correctIds = (q.reponses ?? []).filter((r: any) => r.est_correcte).map((r: any) => r.id);

      let correct = false;
      if (q.type === "qcm" || q.type === "vrai_faux") {
        correct = correctIds.includes(Number(given));
      } else if (q.type === "qcm_multi") {
        const givenArr = Array.isArray(given) ? given.map(Number) : [];
        correct = correctIds.length === givenArr.length && correctIds.every((id: number) => givenArr.includes(id));
      } else if (q.type === "libre") {
        correct = false; // manual grading not implemented
      }

      if (correct) score += q.points;
      feedback.push({
        questionId: q.id,
        correct,
        correctIds,
        given,
        explication: q.explication,
        points: q.points,
        earned: correct ? q.points : 0,
      });
    }

    await db.insert(libraryQuizResultatsTable).values({
      quizId,
      etudiantId: studentId,
      score,
      maxScore,
      durreeSecondes: durreeSecondes ? Number(durreeSecondes) : null,
      tentative: attemptCount + 1,
      reponsesDonnees: JSON.stringify(reponses ?? {}),
    });

    const pourcentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    // Push notification si score < 50%
    if (pourcentage < 50) {
      const [quizResource] = (await db.execute(
        sql`SELECT lr.title as resource_title FROM library_resources lr JOIN library_quiz lq ON lq.id = ${quizId} WHERE lr.id = lq.resource_id LIMIT 1`
      ) as any).rows ?? [];
      const body = `Vous avez eu ${pourcentage}% au quiz "${quiz.titre}" — Revoir le cours est recommandé`;
      sendPushToUsers([studentId], { title: "🎯 Résultat quiz", body, type: "bibliotheque", url: "/bibliotheque" }).catch(() => {});
      db.execute(sql`
        INSERT INTO notifications (user_id, title, body, type, read, created_at)
        VALUES (${studentId}, '🎯 Résultat quiz', ${body}, 'bibliotheque', false, NOW())
      `).catch(() => {});
      // Create/update recommendation for failed quiz
      db.execute(sql`
        INSERT INTO library_recommendations
          (etudiant_id, matiere_id, semestre_id, priorite, type, support_ids, quiz_ids, cree_le, envoyee_le)
        SELECT ${studentId}, lr.subject_id, lr.semester_id, 'moyenne', 'quiz_echec',
               json_build_array(lr.id)::text, json_build_array(${quizId})::text, NOW(), NOW()
        FROM library_quiz lq
        JOIN library_resources lr ON lr.id = lq.resource_id
        WHERE lq.id = ${quizId}
      `).catch(() => {});
    }

    res.json({
      score,
      maxScore,
      pourcentage,
      reussi: quiz.noteMinimale !== null ? pourcentage >= (quiz.noteMinimale ?? 0) : null,
      feedback,
    });
  } catch (err) {
    console.error("[quiz submit]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/quiz/:id/results ───────────────────────────────────
// Get quiz results (student: own; teacher/admin: all)
router.get("/bibliotheque/quiz/:id/results", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const quizId = Number(req.params.id);
    const [me] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (me?.role === "student") {
      const results = (await db.execute(
        sql`SELECT score, max_score, duree_secondes, tentative, termine_le FROM library_quiz_resultats WHERE quiz_id = ${quizId} AND etudiant_id = ${userId} ORDER BY termine_le DESC`
      ) as any).rows ?? [];
      res.json({ results });
      return;
    }

    if (me?.role === "teacher" || me?.role === "admin") {
      const results = (await db.execute(
        sql`SELECT r.*, u.name as etudiant_nom FROM library_quiz_resultats r JOIN users u ON u.id = r.etudiant_id WHERE r.quiz_id = ${quizId} ORDER BY r.termine_le DESC`
      ) as any).rows ?? [];
      res.json({ results });
      return;
    }

    res.status(403).json({ error: "Accès refusé" });
  } catch (err) {
    console.error("[quiz results]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/student-engagement ────────────────────────────────
// Teacher view: time + quiz engagement per resource
router.get("/bibliotheque/student-engagement", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [me] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    const resourceFilter = me?.role === "teacher"
      ? sql`AND lr.teacher_id = ${userId}`
      : sql``;

    const engagementRows = (await db.execute(
      sql`
        SELECT
          lr.id as resource_id,
          lr.title,
          COUNT(DISTINCT ld.student_id) as consultation_count,
          COALESCE(SUM(tt.duree_secondes), 0) as total_secondes,
          COUNT(DISTINCT qr.etudiant_id) as quiz_participants,
          ROUND(AVG(CASE WHEN qr.max_score > 0 THEN qr.score / qr.max_score * 100 END)::numeric, 1) as avg_score_pct
        FROM library_resources lr
        LEFT JOIN library_downloads ld ON ld.resource_id = lr.id
        LEFT JOIN library_time_tracking tt ON tt.resource_id = lr.id
        LEFT JOIN library_quiz lq ON lq.resource_id = lr.id AND lq.actif = true
        LEFT JOIN library_quiz_resultats qr ON qr.quiz_id = lq.id
        WHERE 1=1 ${resourceFilter}
        GROUP BY lr.id, lr.title
        ORDER BY total_secondes DESC
      `
    ) as any).rows ?? [];

    res.json({ engagement: engagementRows });
  } catch (err) {
    console.error("[student-engagement]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/recommendations ───────────────────────────────────
// Student: personal revision recommendations
router.get("/bibliotheque/recommendations", requireRole("student"), async (req, res) => {
  try {
    const userId = req.session!.userId!;

    const rows = (await db.execute(sql`
      SELECT lr.id, lr.priorite, lr.type, lr.support_ids, lr.quiz_ids,
             lr.jours_avant_examen, lr.lu, lr.cree_le,
             s.name as matiere_name,
             sem.name as semestre_name, sem.end_date as examen_date
      FROM library_recommendations lr
      LEFT JOIN subjects s ON s.id = lr.matiere_id
      LEFT JOIN semesters sem ON sem.id = lr.semestre_id
      WHERE lr.etudiant_id = ${userId}
      ORDER BY
        CASE lr.priorite WHEN 'haute' THEN 1 WHEN 'moyenne' THEN 2 ELSE 3 END,
        lr.cree_le DESC
      LIMIT 50
    `) as any).rows ?? [];

    const enriched = await Promise.all(rows.map(async (rec: any) => {
      const supportIds: number[] = JSON.parse(rec.support_ids || "[]");
      const quizIds: number[] = JSON.parse(rec.quiz_ids || "[]");

      let supports: any[] = [];
      let quizzes: any[] = [];

      if (supportIds.length > 0) {
        supports = (await db.execute(sql`
          SELECT id, title, type FROM library_resources WHERE id = ANY(${supportIds})
        `) as any).rows ?? [];
      }

      if (quizIds.length > 0) {
        quizzes = (await db.execute(sql`
          SELECT lq.id, lq.titre, lr.id as resource_id, lr.title as resource_title,
            (SELECT ROUND((score::numeric / NULLIF(max_score,0)) * 100, 0)
             FROM library_quiz_resultats
             WHERE quiz_id = lq.id AND etudiant_id = ${userId}
             ORDER BY termine_le DESC LIMIT 1) as last_score_pct
          FROM library_quiz lq
          JOIN library_resources lr ON lr.id = lq.resource_id
          WHERE lq.id = ANY(${quizIds})
        `) as any).rows ?? [];
      }

      return { ...rec, supports, quizzes };
    }));

    // Also count unread
    const unreadCount = enriched.filter((r: any) => !r.lu).length;

    res.json({ recommendations: enriched, unreadCount });
  } catch (err) {
    console.error("[recommendations]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /api/bibliotheque/recommendations/:id/read ────────────────────────
router.patch("/bibliotheque/recommendations/:id/read", requireRole("student"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const id = parseInt(req.params.id);
    await db.execute(sql`
      UPDATE library_recommendations SET lu = true WHERE id = ${id} AND etudiant_id = ${userId}
    `);
    res.json({ ok: true });
  } catch (err) {
    console.error("[recommendations/read]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /api/bibliotheque/recommendations/mark-all-read ───────────────────
router.patch("/bibliotheque/recommendations/mark-all-read", requireRole("student"), async (req, res) => {
  try {
    const userId = req.session!.userId!;
    await db.execute(sql`UPDATE library_recommendations SET lu = true WHERE etudiant_id = ${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[recommendations/mark-all]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /api/bibliotheque/send-reminder ────────────────────────────────────
// Teacher sends push notification to students who haven't consulted a resource
router.post("/bibliotheque/send-reminder", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const { resourceId } = req.body;
    if (!resourceId) { res.status(400).json({ error: "resourceId requis" }); return; }

    const [resource] = (await db.execute(sql`
      SELECT id, title, class_ids FROM library_resources WHERE id = ${resourceId}
    `) as any).rows ?? [];
    if (!resource) { res.status(404).json({ error: "Support non trouvé" }); return; }

    const classIds: number[] = JSON.parse(resource.class_ids || "[]");

    let studentRows: any[] = [];
    if (classIds.length > 0) {
      studentRows = (await db.execute(sql`
        SELECT DISTINCT u.id
        FROM class_enrollments ce
        JOIN users u ON u.id = ce.student_id
        WHERE ce.class_id = ANY(${classIds})
          AND u.id NOT IN (
            SELECT student_id FROM library_downloads WHERE resource_id = ${resourceId}
          )
      `) as any).rows ?? [];
    } else {
      studentRows = (await db.execute(sql`
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.role = 'student'
          AND u.id NOT IN (
            SELECT student_id FROM library_downloads WHERE resource_id = ${resourceId}
          )
      `) as any).rows ?? [];
    }

    const studentIds: number[] = studentRows.map((r: any) => r.id);

    if (studentIds.length === 0) {
      res.json({ sent: 0, message: "Tous les étudiants ont déjà consulté ce support" });
      return;
    }

    const pushBody = `Consultez le support disponible : "${resource.title}"`;

    await sendPushToUsers(studentIds, {
      title: "📚 Support de cours à consulter",
      body: pushBody,
      type: "bibliotheque",
      url: "/bibliotheque",
    });

    // In-app notifications
    for (const sid of studentIds) {
      await db.execute(sql`
        INSERT INTO notifications (user_id, title, body, type, read, created_at)
        VALUES (${sid}, '📚 Support de cours à consulter', ${pushBody}, 'bibliotheque', false, NOW())
      `);
    }

    res.json({ sent: studentIds.length });
  } catch (err) {
    console.error("[send-reminder]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/admin-stats ───────────────────────────────────────
// Admin: global library statistics (section 7)
router.get("/bibliotheque/admin-stats", requireRole("admin"), async (req, res) => {
  try {
    // 1. Global counters
    const globalCounts = (await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM library_resources WHERE suspended = false)::int as total_supports,
        (SELECT COUNT(DISTINCT student_id) FROM library_downloads)::int as active_students,
        (SELECT COALESCE(SUM(duree_secondes), 0) FROM library_time_tracking)::bigint as total_secondes,
        (SELECT COUNT(*) FROM library_quiz_resultats)::int as total_quiz_passages,
        (SELECT ROUND(AVG(CASE WHEN max_score > 0 THEN score / max_score * 20.0 END)::numeric, 2)
         FROM library_quiz_resultats) as avg_quiz_note_20
    `) as any).rows?.[0] ?? {};

    // 2. Top 10 supports by consultation
    const topSupports = (await db.execute(sql`
      SELECT lr.id, lr.title, lr.type,
             sub.name as subject_name,
             COUNT(DISTINCT ld.student_id)::int as consultation_count,
             lr.download_count,
             COALESCE(SUM(tt.duree_secondes), 0)::int as total_secondes
      FROM library_resources lr
      LEFT JOIN subjects sub ON sub.id = lr.subject_id
      LEFT JOIN library_downloads ld ON ld.resource_id = lr.id
      LEFT JOIN library_time_tracking tt ON tt.resource_id = lr.id
      WHERE lr.suspended = false
      GROUP BY lr.id, lr.title, lr.type, sub.name, lr.download_count
      ORDER BY consultation_count DESC, total_secondes DESC
      LIMIT 10
    `) as any).rows ?? [];

    // 3. Average time per student per subject
    const timePerSubject = (await db.execute(sql`
      SELECT sub.name as subject_name,
             COUNT(DISTINCT sub_data.student_id)::int as student_count,
             ROUND(AVG(sub_data.student_total)::numeric, 0)::int as avg_secondes_per_student
      FROM (
        SELECT tt.student_id, lr.subject_id, SUM(tt.duree_secondes) as student_total
        FROM library_time_tracking tt
        JOIN library_resources lr ON lr.id = tt.resource_id
        WHERE lr.subject_id IS NOT NULL
        GROUP BY tt.student_id, lr.subject_id
      ) sub_data
      JOIN subjects sub ON sub.id = sub_data.subject_id
      GROUP BY sub.name
      ORDER BY avg_secondes_per_student DESC
      LIMIT 10
    `) as any).rows ?? [];

    // 4. Quiz score per subject
    const quizPerSubject = (await db.execute(sql`
      SELECT sub.name as subject_name,
             COUNT(DISTINCT qr.etudiant_id)::int as participants,
             ROUND(AVG(CASE WHEN qr.max_score > 0 THEN qr.score / qr.max_score * 20.0 END)::numeric, 2) as avg_note_20,
             COUNT(*)::int as total_passages
      FROM library_quiz_resultats qr
      JOIN library_quiz lq ON lq.id = qr.quiz_id
      JOIN library_resources lr ON lr.id = lq.resource_id
      LEFT JOIN subjects sub ON sub.id = lr.subject_id
      GROUP BY sub.name
      ORDER BY avg_note_20 DESC NULLS LAST
      LIMIT 10
    `) as any).rows ?? [];

    // 5. Correlation: time bracket vs. average grade
    const correlation = (await db.execute(sql`
      SELECT
        CASE
          WHEN total_secs = 0           THEN '0 min'
          WHEN total_secs < 1800        THEN '< 30 min'
          WHEN total_secs < 3600        THEN '30–60 min'
          WHEN total_secs < 7200        THEN '1–2 h'
          ELSE                               '> 2 h'
        END as tranche_temps,
        CASE
          WHEN total_secs = 0    THEN 0
          WHEN total_secs < 1800 THEN 1
          WHEN total_secs < 3600 THEN 2
          WHEN total_secs < 7200 THEN 3
          ELSE                        4
        END as tranche_order,
        COUNT(DISTINCT student_id)::int as nb_etudiants,
        ROUND(AVG(avg_grade)::numeric, 2) as moyenne_notes
      FROM (
        SELECT g.student_id,
               COALESCE(SUM(tt.duree_secondes), 0) as total_secs,
               AVG(g.value) as avg_grade
        FROM grades g
        LEFT JOIN library_time_tracking tt ON tt.student_id = g.student_id
        GROUP BY g.student_id
      ) sub
      GROUP BY tranche_temps, tranche_order
      ORDER BY tranche_order
    `) as any).rows ?? [];

    // 6. Students who never consulted the library
    const neverConnected = (await db.execute(sql`
      SELECT u.id, u.name, u.email,
             (SELECT c.name FROM classes c
              JOIN class_enrollments ce ON ce.class_id = c.id
              WHERE ce.student_id = u.id LIMIT 1) as class_name
      FROM users u
      WHERE u.role = 'student'
        AND u.id NOT IN (SELECT DISTINCT student_id FROM library_downloads)
        AND u.id NOT IN (SELECT DISTINCT student_id FROM library_time_tracking)
      ORDER BY u.name
      LIMIT 50
    `) as any).rows ?? [];

    res.json({ globalCounts, topSupports, timePerSubject, quizPerSubject, correlation, neverConnected });
  } catch (err) {
    console.error("[admin-stats]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /api/bibliotheque/quiz-has ──────────────────────────────────────────
// Check which resources have active quizzes (batch, for badge display)
router.get("/bibliotheque/quiz-has", requireAuth, async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) { res.json({ resourceIdsWithQuiz: [] }); return; }
    const idList = String(ids).split(",").map(Number).filter(Boolean);
    if (!idList.length) { res.json({ resourceIdsWithQuiz: [] }); return; }

    const rows = (await db.execute(
      sql`SELECT DISTINCT resource_id FROM library_quiz WHERE resource_id = ANY(${idList}) AND actif = true`
    ) as any).rows ?? [];
    res.json({ resourceIdsWithQuiz: rows.map((r: any) => r.resource_id) });
  } catch (err) {
    console.error("[quiz-has]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
