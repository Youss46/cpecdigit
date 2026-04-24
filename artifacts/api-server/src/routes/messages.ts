import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { messagesTable, usersTable, classesTable, classEnrollmentsTable, notificationsTable } from "@workspace/db";
import { eq, and, or, desc, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { sendPushToUsers, sendPushToUser } from "./push.js";
import { emitToUser, emitToUsers } from "../lib/socket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const ALLOWED_MIMETYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Type de fichier non autorisé"));
  },
});

const router = Router();

// ─── Get all conversations for current user ──────────────────────────────────
router.get("/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;

    const rows = await db
      .select({
        id: messagesTable.id,
        senderId: messagesTable.senderId,
        senderName: sql<string>`sender.name`,
        senderRole: sql<string>`sender.role`,
        senderSubRole: sql<string>`sender.admin_sub_role`,
        recipientId: messagesTable.recipientId,
        recipientName: sql<string>`recipient.name`,
        recipientRole: sql<string>`recipient.role`,
        recipientSubRole: sql<string>`recipient.admin_sub_role`,
        content: messagesTable.content,
        readAt: messagesTable.readAt,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .innerJoin(sql`users sender`, sql`sender.id = ${messagesTable.senderId}`)
      .innerJoin(sql`users recipient`, sql`recipient.id = ${messagesTable.recipientId}`)
      .where(
        or(
          eq(messagesTable.senderId, userId),
          eq(messagesTable.recipientId, userId)
        )
      )
      .orderBy(desc(messagesTable.createdAt));

    const convMap = new Map<number, any>();
    for (const r of rows) {
      const otherId = r.senderId === userId ? r.recipientId : r.senderId;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, {
          userId: otherId,
          userName: r.senderId === userId ? r.recipientName : r.senderName,
          userRole: r.senderId === userId ? r.recipientRole : r.senderRole,
          userSubRole: r.senderId === userId ? r.recipientSubRole : r.senderSubRole,
          lastMessage: r.content,
          lastAt: r.createdAt,
          unreadCount: 0,
        });
      }
      if (r.recipientId === userId && !r.readAt) {
        convMap.get(otherId)!.unreadCount++;
      }
    }

    res.json(Array.from(convMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Get unread count (MUST be before /:userId) ──────────────────────────────
router.get("/messages/unread/count", requireAuth, async (req, res) => {
  try {
    const userId = req.session!.userId!;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(and(eq(messagesTable.recipientId, userId), isNull(messagesTable.readAt)));
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Get contacts list (MUST be before /:userId) ─────────────────────────────
router.get("/messages/contacts/list", requireAuth, async (req, res) => {
  try {
    const contacts = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, adminSubRole: usersTable.adminSubRole })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.role, "student"),
          eq(usersTable.role, "teacher")
        )
      )
      .orderBy(usersTable.name);
    res.json(contacts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Get classes list for broadcast (MUST be before /:userId) ────────────────
router.get("/messages/classes/list", requireAuth, async (req, res) => {
  try {
    const classes = await db
      .select({
        id: classesTable.id,
        name: classesTable.name,
        studentCount: sql<number>`count("class_enrollments"."id")::int`,
      })
      .from(classesTable)
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.classId, classesTable.id))
      .groupBy(classesTable.id, classesTable.name)
      .orderBy(classesTable.name);
    res.json(classes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Broadcast message to all students in a class ────────────────────────────
router.post("/messages/class/:classId", requireAuth, async (req, res) => {
  try {
    const senderId = req.session!.userId!;
    const classId = parseInt(req.params.classId);
    const { content, fileUrl, fileName, fileType, fileSize } = req.body as {
      content?: string; fileUrl?: string; fileName?: string; fileType?: string; fileSize?: number;
    };

    if (!content?.trim() && !fileUrl) {
      res.status(400).json({ error: "content ou fichier requis" });
      return;
    }

    // Students are not allowed to broadcast
    const [senderUser] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, senderId))
      .limit(1);
    if (senderUser?.role === "student") {
      res.status(403).json({ error: "Les étudiants ne sont pas autorisés à envoyer des messages" });
      return;
    }

    // Get all students enrolled in this class
    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.classId, classId));

    if (enrollments.length === 0) {
      res.status(404).json({ error: "Aucun étudiant dans cette classe" });
      return;
    }

    // Get sender name
    const [sender] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, senderId))
      .limit(1);

    const trimmedContent = content?.trim() || (fileName ? `📎 ${fileName}` : "");
    const preview = trimmedContent.length > 80 ? trimmedContent.slice(0, 80) + "…" : trimmedContent;
    const senderName = sender?.name ?? "l'administration";

    // Insert a message for each student
    const messageValues = enrollments.map((e) => ({
      senderId,
      recipientId: e.studentId,
      content: trimmedContent,
      fileUrl: fileUrl ?? null,
      fileName: fileName ?? null,
      fileType: fileType ?? null,
      fileSize: fileSize ?? null,
    }));
    await db.insert(messagesTable).values(messageValues);

    // Create a notification for each student
    const notifValues = enrollments.map((e) => ({
      userId: e.studentId,
      type: "message",
      title: `Nouveau message de ${senderName}`,
      message: preview,
    }));
    await db.insert(notificationsTable).values(notifValues);

    const studentIds = enrollments.map(e => e.studentId);
    sendPushToUsers(studentIds, { title: `Nouveau message de ${senderName}`, body: preview, type: "message" }).catch(() => {});
    emitToUsers(studentIds, "message:new", { senderId });
    emitToUsers(studentIds, "notification:new");

    res.json({ sent: enrollments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Download file (authenticated, forces attachment download) ────────────────
router.get("/messages/download/:filename", requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);
  const originalName = (req.query.name as string) || filename;

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Fichier introuvable" });
    return;
  }

  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
  res.sendFile(filePath);
});

// ─── Upload file for message attachment (MUST be before /:userId) ─────────────
router.post("/messages/upload", requireAuth, async (req, res) => {
  const senderId = req.session!.userId!;
  const [sender] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, senderId))
    .limit(1);
  if (sender?.role === "student") {
    res.status(403).json({ error: "Les étudiants ne sont pas autorisés à envoyer des messages" });
    return;
  }
  upload.single("file")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Aucun fichier reçu" });
      return;
    }
    res.json({
      fileUrl: `/api/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    });
  });
});

// ─── Get messages with a specific user ───────────────────────────────────────
router.get("/messages/:userId", requireAuth, async (req, res) => {
  try {
    const currentUserId = req.session!.userId!;
    const otherId = parseInt(req.params.userId);

    const messages = await db
      .select({
        id: messagesTable.id,
        senderId: messagesTable.senderId,
        senderName: sql<string>`sender.name`,
        recipientId: messagesTable.recipientId,
        content: messagesTable.content,
        fileUrl: messagesTable.fileUrl,
        fileName: messagesTable.fileName,
        fileType: messagesTable.fileType,
        fileSize: messagesTable.fileSize,
        readAt: messagesTable.readAt,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .innerJoin(sql`users sender`, sql`sender.id = ${messagesTable.senderId}`)
      .where(
        or(
          and(eq(messagesTable.senderId, currentUserId), eq(messagesTable.recipientId, otherId)),
          and(eq(messagesTable.senderId, otherId), eq(messagesTable.recipientId, currentUserId))
        )
      )
      .orderBy(messagesTable.createdAt);

    await db
      .update(messagesTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messagesTable.senderId, otherId),
          eq(messagesTable.recipientId, currentUserId),
          isNull(messagesTable.readAt)
        )
      );

    const [other] = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, adminSubRole: usersTable.adminSubRole })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);

    res.json({ messages, other });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Send a message ───────────────────────────────────────────────────────────
router.post("/messages", requireAuth, async (req, res) => {
  try {
    const senderId = req.session!.userId!;
    const { recipientId, content, fileUrl, fileName, fileType, fileSize } = req.body as {
      recipientId: number; content: string;
      fileUrl?: string; fileName?: string; fileType?: string; fileSize?: number;
    };

    if (!recipientId || (!content?.trim() && !fileUrl)) {
      res.status(400).json({ error: "recipientId et content ou fichier requis" });
      return;
    }

    // Get sender info (name + role)
    const [sender] = await db
      .select({ name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, senderId))
      .limit(1);

    // Students are not allowed to send messages
    if (sender?.role === "student") {
      res.status(403).json({ error: "Les étudiants ne sont pas autorisés à envoyer des messages" });
      return;
    }

    const [msg] = await db
      .insert(messagesTable)
      .values({
        senderId, recipientId,
        content: content?.trim() || (fileName ? `📎 ${fileName}` : ""),
        fileUrl: fileUrl ?? null,
        fileName: fileName ?? null,
        fileType: fileType ?? null,
        fileSize: fileSize ?? null,
      })
      .returning();

    // Create notification for recipient
    const contentStr = content?.trim() || "";
    const preview = (contentStr.length > 80 ? contentStr.slice(0, 80) + "…" : contentStr) || `📎 ${fileName}`;
    const msgTitle = `Nouveau message de ${sender?.name ?? "l'administration"}`;
    await db.insert(notificationsTable).values({
      userId: recipientId,
      type: "message",
      title: msgTitle,
      message: preview,
    });

    sendPushToUser(recipientId, { title: msgTitle, body: preview, type: "message" }).catch(() => {});
    emitToUser(recipientId, "message:new", { senderId });
    emitToUser(recipientId, "notification:new");

    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
