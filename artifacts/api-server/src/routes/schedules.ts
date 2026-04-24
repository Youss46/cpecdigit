import { Router } from "express";
import { db } from "@workspace/db";
import {
  scheduleEntriesTable,
  schedulePublicationsTable,
  notificationsTable,
  usersTable,
  subjectsTable,
  classesTable,
  roomsTable,
  semestersTable,
  blockedDatesTable,
} from "@workspace/db";
import { eq, and, gte, lte, or, inArray } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { notifyStudentsOfClasses, notifyStudentsBySemester } from "./notifications.js";
import { sendPushToUser } from "./push.js";

const router = Router();

function requirePlanificateur(req: any, res: any, next: any) {
  if (req.session?.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const subRole = req.session.user.adminSubRole;
  if (subRole !== "planificateur" && subRole !== "directeur") {
    return res.status(403).json({ error: "Réservé au Responsable pédagogique ou au Directeur" });
  }
  next();
}

async function getEnrichedEntries(filters?: { semesterId?: number; classId?: number }) {
  const rows = await db
    .select({
      id: scheduleEntriesTable.id,
      teacherId: scheduleEntriesTable.teacherId,
      teacherName: usersTable.name,
      subjectId: scheduleEntriesTable.subjectId,
      subjectName: subjectsTable.name,
      classId: scheduleEntriesTable.classId,
      className: classesTable.name,
      roomId: scheduleEntriesTable.roomId,
      roomName: roomsTable.name,
      semesterId: scheduleEntriesTable.semesterId,
      semesterName: semestersTable.name,
      sessionDate: scheduleEntriesTable.sessionDate,
      startTime: scheduleEntriesTable.startTime,
      endTime: scheduleEntriesTable.endTime,
      notes: scheduleEntriesTable.notes,
      teamsLink: scheduleEntriesTable.teamsLink,
      published: scheduleEntriesTable.published,
      createdAt: scheduleEntriesTable.createdAt,
    })
    .from(scheduleEntriesTable)
    .innerJoin(usersTable, eq(usersTable.id, scheduleEntriesTable.teacherId))
    .innerJoin(subjectsTable, eq(subjectsTable.id, scheduleEntriesTable.subjectId))
    .innerJoin(classesTable, eq(classesTable.id, scheduleEntriesTable.classId))
    .innerJoin(roomsTable, eq(roomsTable.id, scheduleEntriesTable.roomId))
    .innerJoin(semestersTable, eq(semestersTable.id, scheduleEntriesTable.semesterId));

  let filtered = rows;
  if (filters?.semesterId) filtered = filtered.filter((r) => r.semesterId === filters.semesterId);
  if (filters?.classId) filtered = filtered.filter((r) => r.classId === filters.classId);

  return filtered.sort((a, b) =>
    a.sessionDate.localeCompare(b.sessionDate) || a.startTime.localeCompare(b.startTime)
  );
}

async function getActivePublications(classId?: number, semesterId?: number) {
  const now = new Date();
  const allPubs = await db
    .select()
    .from(schedulePublicationsTable);

  return allPubs.filter((p) => {
    const active = p.publishedFrom <= now && p.publishedUntil >= now;
    if (!active) return false;
    if (classId !== undefined && p.classId !== classId) return false;
    if (semesterId !== undefined && p.semesterId !== semesterId) return false;
    return true;
  });
}

router.get("/publications", requireRole("admin", "teacher", "student"), async (req, res) => {
  try {
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const activePubs = await getActivePublications(classId, semesterId);
    res.json(activePubs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId as string) : undefined;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const entries = await getEnrichedEntries({ semesterId, classId });
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/publish", requirePlanificateur, async (req, res) => {
  try {
    const { semesterId, published, classId } = req.body;
    if (!semesterId || published === undefined) {
      return res.status(400).json({ error: "semesterId et published requis" });
    }
    const conditions = classId
      ? and(eq(scheduleEntriesTable.semesterId, parseInt(semesterId)), eq(scheduleEntriesTable.classId, parseInt(classId)))
      : eq(scheduleEntriesTable.semesterId, parseInt(semesterId));
    await db
      .update(scheduleEntriesTable)
      .set({ published: Boolean(published) })
      .where(conditions);

    if (Boolean(published)) {
      const [sem] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, parseInt(semesterId))).limit(1);
      const semLabel = sem ? ` du semestre ${sem.name}` : "";

      await notifyStudentsBySemester(
        parseInt(semesterId),
        "schedule_published",
        "Emploi du temps disponible",
        `L'emploi du temps${semLabel} a été publié. Consultez votre planning.`
      ).catch(console.error);

      // Notify all teachers who have sessions in this semester
      const teacherRows = await db
        .selectDistinct({ teacherId: scheduleEntriesTable.teacherId })
        .from(scheduleEntriesTable)
        .where(eq(scheduleEntriesTable.semesterId, parseInt(semesterId)));
      const teacherIds = teacherRows.map((r) => r.teacherId);
      if (teacherIds.length > 0) {
        const title = "Emploi du temps publié";
        const message = `L'emploi du temps${semLabel} est maintenant visible par les étudiants. Consultez vos créneaux.`;
        await db.insert(notificationsTable).values(
          teacherIds.map((uid) => ({ userId: uid, type: "schedule_published" as any, title, message }))
        );
        teacherIds.forEach((uid) => sendPushToUser(uid, { title, body: message, type: "schedule_published" }).catch(() => {}));
      }
    }

    res.json({ message: published ? "Emploi du temps publié" : "Mis en brouillon" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── helpers ──────────────────────────────────────────────────────────────────
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMondayOfWeek(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPeriodRange(period: string): { from: Date; until: Date; fromISO: string; untilISO: string } {
  const now = new Date();

  if (period === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const until = new Date(now);
    until.setHours(23, 59, 59, 999);
    return { from, until, fromISO: isoDate(from), untilISO: isoDate(until) };
  }

  if (period === "1week") {
    const monday = getMondayOfWeek(now);
    const saturday = new Date(monday);
    saturday.setDate(saturday.getDate() + 5);
    saturday.setHours(23, 59, 59, 999);
    return { from: monday, until: saturday, fromISO: isoDate(monday), untilISO: isoDate(saturday) };
  }

  if (period === "2weeks") {
    const monday = getMondayOfWeek(now);
    const saturday2 = new Date(monday);
    saturday2.setDate(saturday2.getDate() + 12);
    saturday2.setHours(23, 59, 59, 999);
    return { from: monday, until: saturday2, fromISO: isoDate(monday), untilISO: isoDate(saturday2) };
  }

  // "1month" — current calendar month
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const until = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, until, fromISO: isoDate(from), untilISO: isoDate(until) };
}

// ─── publish-period ───────────────────────────────────────────────────────────
router.post("/publish-period", requirePlanificateur, async (req, res) => {
  try {
    const { classId, semesterId, period } = req.body;
    if (!classId || !semesterId || !period) {
      return res.status(400).json({ error: "classId, semesterId et period sont requis" });
    }

    const validPeriods = ["today", "1week", "2weeks", "1month"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: "Période invalide" });
    }

    const cid = parseInt(classId);
    const sid = parseInt(semesterId);
    const { from, until, fromISO, untilISO } = getPeriodRange(period);

    // 1. Reset all sessions in this class+semester to draft
    await db
      .update(scheduleEntriesTable)
      .set({ published: false })
      .where(and(
        eq(scheduleEntriesTable.classId, cid),
        eq(scheduleEntriesTable.semesterId, sid)
      ));

    // 2. Publish only sessions whose sessionDate falls within the range
    await db
      .update(scheduleEntriesTable)
      .set({ published: true })
      .where(and(
        eq(scheduleEntriesTable.classId, cid),
        eq(scheduleEntriesTable.semesterId, sid),
        gte(scheduleEntriesTable.sessionDate, fromISO),
        lte(scheduleEntriesTable.sessionDate, untilISO)
      ));

    // 3. Replace any existing publication record for this class+semester
    const existing = await db
      .select()
      .from(schedulePublicationsTable)
      .where(and(
        eq(schedulePublicationsTable.classId, cid),
        eq(schedulePublicationsTable.semesterId, sid)
      ));

    if (existing.length > 0) {
      await db.delete(schedulePublicationsTable).where(eq(schedulePublicationsTable.id, existing[0].id));
    }

    const [pub] = await db
      .insert(schedulePublicationsTable)
      .values({ classId: cid, semesterId: sid, publishedFrom: from, publishedUntil: until })
      .returning();

    // 4. Notifications
    const [cls] = await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, cid)).limit(1);
    const [sem] = await db.select({ name: semestersTable.name }).from(semestersTable).where(eq(semestersTable.id, sid)).limit(1);
    const periodLabels: Record<string, string> = { today: "aujourd'hui", "1week": "cette semaine", "2weeks": "les 2 prochaines semaines", "1month": "ce mois" };
    const clsLabel = cls ? ` de la classe ${cls.name}` : "";
    const semLabel = sem ? ` (${sem.name})` : "";
    const periodLabel = periodLabels[period] ?? period;

    await notifyStudentsOfClasses(
      [cid],
      "schedule_published",
      "Emploi du temps disponible",
      `L'emploi du temps${clsLabel}${semLabel} est publié pour ${periodLabel}.`
    ).catch(console.error);

    // Notify teachers assigned to sessions in this range
    const teacherRows = await db
      .selectDistinct({ teacherId: scheduleEntriesTable.teacherId })
      .from(scheduleEntriesTable)
      .where(and(
        eq(scheduleEntriesTable.classId, cid),
        eq(scheduleEntriesTable.semesterId, sid),
        eq(scheduleEntriesTable.published, true)
      ));
    const teacherIds = teacherRows.map((r) => r.teacherId);
    if (teacherIds.length > 0) {
      const title = "Emploi du temps publié";
      const message = `L'emploi du temps${clsLabel}${semLabel} est visible par les étudiants pour ${periodLabel}.`;
      await db.insert(notificationsTable).values(
        teacherIds.map((uid) => ({ userId: uid, type: "schedule_published" as any, title, message }))
      );
      teacherIds.forEach((uid) => sendPushToUser(uid, { title, body: message, type: "schedule_published" }).catch(() => {}));
    }

    res.json({
      message: "Emploi du temps publié",
      publication: pub,
      range: { fromISO, untilISO },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function notifyTeacherOfEntry(entryId: number, isNew: boolean) {
  try {
    const enriched = await getEnrichedEntries();
    const e = enriched.find((x) => x.id === entryId);
    if (!e || !e.teacherId) return;
    const dateLabel = new Date(e.sessionDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const timeLabel = `${e.startTime.slice(0, 5)} – ${e.endTime.slice(0, 5)}`;
    const title = isNew ? "Nouveau cours programmé" : "Cours modifié";
    const message = `${e.subjectName} · ${e.className}\n${dateLabel} de ${timeLabel}${e.roomName ? ` — Salle : ${e.roomName}` : ""}`;
    await db.insert(notificationsTable).values({
      userId: e.teacherId,
      type: "schedule_assigned",
      title,
      message,
    });
    sendPushToUser(e.teacherId, { title, body: message, type: "schedule_assigned" }).catch(() => {});
  } catch (_) {}
}

async function notifyTeacherOfDeletion(entry: { teacherId: number; subjectName: string; className: string; sessionDate: string; startTime: string; endTime: string }) {
  try {
    const dateLabel = new Date(entry.sessionDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const timeLabel = `${entry.startTime.slice(0, 5)} – ${entry.endTime.slice(0, 5)}`;
    const title = "Cours annulé";
    const message = `${entry.subjectName} · ${entry.className}\n${dateLabel} de ${timeLabel} a été supprimé de votre planning.`;
    await db.insert(notificationsTable).values({
      userId: entry.teacherId,
      type: "schedule_cancelled",
      title,
      message,
    });
    sendPushToUser(entry.teacherId, { title, body: message, type: "schedule_cancelled" }).catch(() => {});
  } catch (_) {}
}

// ─── helpers: time overlap ─────────────────────────────────────────────────────
function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  return toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1);
}

// ─── POST /period-preview ─────────────────────────────────────────────────────
router.post("/period-preview", requirePlanificateur, async (req, res) => {
  try {
    const { teacherIds, subjectId, classId, roomId, semesterId, startDate, endDate, days, startTime, endTime, frequency } = req.body;
    if (!teacherIds?.length || !subjectId || !classId || !roomId || !semesterId || !startDate || !endDate || !days?.length || !startTime || !endTime) {
      return res.status(400).json({ error: "Champs requis manquants" });
    }

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    if (start > end) return res.status(400).json({ error: "La date de début doit être avant la date de fin" });

    // Collect all candidate dates
    const daysSet = new Set((days as number[]));
    const candidates: string[] = [];
    const cur = new Date(start);
    let weekCount = 0;
    let lastWeekNum = -1;

    while (cur <= end) {
      const jsDay = cur.getDay(); // 0=Sun, 1=Mon...6=Sat
      const cpecDay = jsDay === 0 ? 7 : jsDay; // 1=Mon...6=Sat
      if (daysSet.has(cpecDay)) {
        // Compute iso week number for biweekly filtering
        const weekNum = Math.floor((cur.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
        if (frequency === "biweekly") {
          if (weekNum !== lastWeekNum) { weekCount++; lastWeekNum = weekNum; }
          if (weekCount % 2 === 0) { cur.setDate(cur.getDate() + 1); continue; }
        }
        candidates.push(cur.toISOString().slice(0, 10));
      }
      cur.setDate(cur.getDate() + 1);
    }

    // Load blocked dates
    const blocked = await db.select().from(blockedDatesTable);
    const blockedSet = new Set<string>();
    blocked.forEach((b) => {
      const from = new Date(b.date + "T00:00:00");
      const to = b.dateEnd ? new Date(b.dateEnd + "T23:59:59") : new Date(b.date + "T23:59:59");
      const d = new Date(from);
      while (d <= to) { blockedSet.add(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
    });

    // Load existing entries in the date range for conflict checking
    const existing = await db.select({
      teacherId: scheduleEntriesTable.teacherId,
      teacherName: usersTable.name,
      classId: scheduleEntriesTable.classId,
      className: classesTable.name,
      roomId: scheduleEntriesTable.roomId,
      roomName: roomsTable.name,
      sessionDate: scheduleEntriesTable.sessionDate,
      startTime: scheduleEntriesTable.startTime,
      endTime: scheduleEntriesTable.endTime,
    })
      .from(scheduleEntriesTable)
      .innerJoin(usersTable, eq(usersTable.id, scheduleEntriesTable.teacherId))
      .innerJoin(classesTable, eq(classesTable.id, scheduleEntriesTable.classId))
      .innerJoin(roomsTable, eq(roomsTable.id, scheduleEntriesTable.roomId))
      .where(and(gte(scheduleEntriesTable.sessionDate, startDate), lte(scheduleEntriesTable.sessionDate, endDate)));

    // Build session list per teacher
    const tids: number[] = (teacherIds as number[]);
    // Load teacher names
    const teacherRows = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, tids));
    const teacherMap = new Map(teacherRows.map((t) => [t.id, t.name]));

    const sessions: any[] = [];

    for (const date of candidates) {
      const isBlocked = blockedSet.has(date);
      const blockedInfo = isBlocked ? blocked.find((b) => {
        const from = b.date; const to = b.dateEnd ?? b.date;
        return date >= from && date <= to;
      }) : null;

      for (const tid of tids) {
        const conflicts: { type: string; message: string }[] = [];
        if (!isBlocked) {
          const sameDay = existing.filter((e) => e.sessionDate === date);
          sameDay.forEach((e) => {
            if (!timesOverlap(startTime, endTime, e.startTime, e.endTime)) return;
            if (e.teacherId === tid) conflicts.push({ type: "teacher", message: `${teacherMap.get(tid) ?? "Enseignant"} est déjà programmé le ${date} de ${e.startTime} à ${e.endTime}` });
            if (e.roomId === parseInt(roomId)) conflicts.push({ type: "room", message: `La salle est déjà occupée le ${date} de ${e.startTime} à ${e.endTime}` });
            if (e.classId === parseInt(classId)) conflicts.push({ type: "class", message: `La classe a déjà un cours le ${date} de ${e.startTime} à ${e.endTime}` });
          });
        }

        sessions.push({
          date,
          startTime,
          endTime,
          teacherId: tid,
          teacherName: teacherMap.get(tid) ?? "",
          isBlocked,
          blockedReason: blockedInfo?.reason ?? null,
          conflicts,
          selected: !isBlocked && conflicts.length === 0,
        });
      }
    }

    res.json({ sessions, total: sessions.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST /period-generate ────────────────────────────────────────────────────
router.post("/period-generate", requirePlanificateur, async (req, res) => {
  try {
    const { sessions, subjectId, classId, roomId, semesterId } = req.body;
    if (!sessions?.length || !subjectId || !classId || !roomId || !semesterId) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    const batchId = crypto.randomUUID();

    const toInsert = (sessions as any[]).map((s: any) => ({
      teacherId: parseInt(s.teacherId),
      subjectId: parseInt(subjectId),
      classId: parseInt(classId),
      roomId: parseInt(roomId),
      semesterId: parseInt(semesterId),
      sessionDate: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      notes: null,
      teamsLink: null,
      published: false,
      batchId,
    }));

    const created = await db.insert(scheduleEntriesTable).values(toInsert).returning({ id: scheduleEntriesTable.id });

    // Notify each teacher
    const teacherIds = [...new Set(toInsert.map((s) => s.teacherId))];
    for (const tid of teacherIds) {
      const count = toInsert.filter((s) => s.teacherId === tid).length;
      const title = "Nouvelles séances programmées";
      const message = `${count} séance(s) ont été ajoutées à votre emploi du temps.`;
      await db.insert(notificationsTable).values({ userId: tid, type: "schedule_published" as any, title, message });
      sendPushToUser(tid, { title, body: message, type: "schedule_published" }).catch(() => {});
    }

    res.status(201).json({ created: created.length, batchId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── DELETE /batch/:batchId ───────────────────────────────────────────────────
router.delete("/batch/:batchId", requirePlanificateur, async (req, res) => {
  try {
    const { batchId } = req.params;
    const { fromDate } = req.query;
    let whereClause: any = eq(scheduleEntriesTable.batchId, batchId);
    if (fromDate) {
      whereClause = and(eq(scheduleEntriesTable.batchId, batchId), gte(scheduleEntriesTable.sessionDate, fromDate as string));
    }
    const deleted = await db.delete(scheduleEntriesTable).where(whereClause).returning({ id: scheduleEntriesTable.id });
    res.json({ deleted: deleted.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST / (single entry) ───────────────────────────────────────────────────
router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { teacherId, subjectId, classId, roomId, semesterId, sessionDate, startTime, endTime, notes, teamsLink } = req.body;
    if (!teacherId || !subjectId || !classId || !roomId || !semesterId || !sessionDate || !startTime || !endTime) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    const [entry] = await db
      .insert(scheduleEntriesTable)
      .values({ teacherId, subjectId, classId, roomId, semesterId, sessionDate, startTime, endTime, notes: notes ?? null, teamsLink: teamsLink ?? null, published: false })
      .returning();
    notifyTeacherOfEntry(entry.id, true);
    const enriched = await getEnrichedEntries();
    res.status(201).json(enriched.find((e) => e.id === entry.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:entryId", requirePlanificateur, async (req, res) => {
  try {
    const entryId = parseInt(req.params.entryId);
    const { teacherId, subjectId, classId, roomId, sessionDate, startTime, endTime, notes, teamsLink } = req.body;
    // Modifying a session reverts it to draft — it must be explicitly re-published
    const [entry] = await db
      .update(scheduleEntriesTable)
      .set({
        teacherId, subjectId, classId, roomId, sessionDate, startTime, endTime,
        notes: notes ?? null, teamsLink: teamsLink ?? null,
        published: false,
      })
      .where(eq(scheduleEntriesTable.id, entryId))
      .returning();
    if (!entry) return res.status(404).json({ error: "Not Found" });
    notifyTeacherOfEntry(entry.id, false);
    const enriched = await getEnrichedEntries();
    res.json(enriched.find((e) => e.id === entry.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:entryId", requirePlanificateur, async (req, res) => {
  try {
    const entryId = parseInt(req.params.entryId);
    const enriched = await getEnrichedEntries();
    const toDelete = enriched.find((x) => x.id === entryId);
    await db.delete(scheduleEntriesTable).where(eq(scheduleEntriesTable.id, entryId));
    if (toDelete) {
      notifyTeacherOfDeletion({
        teacherId: toDelete.teacherId,
        subjectName: toDelete.subjectName,
        className: toDelete.className,
        sessionDate: toDelete.sessionDate,
        startTime: toDelete.startTime,
        endTime: toDelete.endTime,
      }).catch(() => {});
    }
    res.json({ message: "Créneau supprimé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
