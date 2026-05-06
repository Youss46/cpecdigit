import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  usersTable,
  subjectsTable,
  classesTable,
  semestersTable,
  teacherAssignmentsTable,
  classEnrollmentsTable,
  attendanceTable,
  attendanceSessionsTable,
  notificationsTable,
  parentStudentLinksTable,
} from "@workspace/db";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();

// ─── Teacher: get attendance for a session ───────────────────────────────────
router.get("/teacher/attendance", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, sessionDate } = req.query as Record<string, string>;
    if (!subjectId || !classId || !sessionDate) {
      res.status(400).json({ error: "subjectId, classId, sessionDate requis" });
      return;
    }
    const sId = parseInt(subjectId);
    const cId = parseInt(classId);

    const records = await db
      .select({
        studentId: attendanceTable.studentId,
        status: attendanceTable.status,
        note: attendanceTable.note,
        startTime: attendanceTable.startTime,
        endTime: attendanceTable.endTime,
      })
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.teacherId, teacherId),
          eq(attendanceTable.subjectId, sId),
          eq(attendanceTable.classId, cId),
          eq(attendanceTable.sessionDate, sessionDate)
        )
      );

    const [session] = await db
      .select()
      .from(attendanceSessionsTable)
      .where(
        and(
          eq(attendanceSessionsTable.teacherId, teacherId),
          eq(attendanceSessionsTable.subjectId, sId),
          eq(attendanceSessionsTable.classId, cId),
          eq(attendanceSessionsTable.sessionDate, sessionDate)
        )
      )
      .limit(1);

    res.json({ records, sentAt: session?.sentAt ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher: history of submitted sessions ───────────────────────────────────
router.get("/teacher/attendance/history", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;

    const sessions = await db
      .select({
        id: attendanceSessionsTable.id,
        sessionDate: attendanceSessionsTable.sessionDate,
        sentAt: attendanceSessionsTable.sentAt,
        subjectId: attendanceSessionsTable.subjectId,
        subjectName: subjectsTable.name,
        classId: attendanceSessionsTable.classId,
        className: classesTable.name,
        semesterId: attendanceSessionsTable.semesterId,
        semesterName: semestersTable.name,
      })
      .from(attendanceSessionsTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, attendanceSessionsTable.subjectId))
      .innerJoin(classesTable, eq(classesTable.id, attendanceSessionsTable.classId))
      .innerJoin(semestersTable, eq(semestersTable.id, attendanceSessionsTable.semesterId))
      .where(eq(attendanceSessionsTable.teacherId, teacherId))
      .orderBy(desc(attendanceSessionsTable.sessionDate));

    // For each session, compute attendance stats
    const result = await Promise.all(sessions.map(async (s) => {
      const records = await db
        .select({ status: attendanceTable.status })
        .from(attendanceTable)
        .where(
          and(
            eq(attendanceTable.teacherId, teacherId),
            eq(attendanceTable.subjectId, s.subjectId),
            eq(attendanceTable.classId, s.classId),
            eq(attendanceTable.sessionDate, s.sessionDate),
          )
        );
      const presentCount = records.filter(r => r.status === "present").length;
      const absentCount = records.filter(r => r.status === "absent").length;
      const lateCount = records.filter(r => r.status === "late").length;
      return { ...s, presentCount, absentCount, lateCount, totalCount: records.length };
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher: save attendance for a session ───────────────────────────────────
router.post("/teacher/attendance/save", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, semesterId, sessionDate, records } = req.body as {
      subjectId: number;
      classId: number;
      semesterId: number;
      sessionDate: string;
      records: { studentId: number; status: string; note?: string; startTime?: string; endTime?: string }[];
    };
    if (!subjectId || !classId || !semesterId || !sessionDate || !Array.isArray(records)) {
      res.status(400).json({ error: "Données manquantes" });
      return;
    }

    for (const r of records) {
      await db
        .insert(attendanceTable)
        .values({
          teacherId,
          subjectId,
          classId,
          semesterId,
          sessionDate,
          studentId: r.studentId,
          status: r.status || "present",
          note: r.note ?? null,
          startTime: r.startTime ?? null,
          endTime: r.endTime ?? null,
        })
        .onConflictDoUpdate({
          target: [
            attendanceTable.teacherId,
            attendanceTable.subjectId,
            attendanceTable.classId,
            attendanceTable.sessionDate,
            attendanceTable.studentId,
          ],
          set: { status: r.status || "present", note: r.note ?? null, startTime: r.startTime ?? null, endTime: r.endTime ?? null },
        });
    }

    res.json({ message: "Présences enregistrées" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher + Admin: get tenant GPS settings (lecture seule pour enseignant) ──
router.get("/teacher/attendance/location-settings", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { rows } = await pool.query(
      `SELECT latitude, longitude, rayon_metres FROM tenants WHERE id = $1`,
      [tenantId]
    );
    res.json(rows[0] ?? { latitude: null, longitude: null, rayon_metres: 200 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: get / update tenant GPS settings ─────────────────────────────────
router.get("/admin/attendance/location-settings", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { rows } = await pool.query(
      `SELECT latitude, longitude, rayon_metres FROM tenants WHERE id = $1`,
      [tenantId]
    );
    res.json(rows[0] ?? { latitude: null, longitude: null, rayon_metres: 200 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/admin/attendance/location-settings", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { latitude, longitude, rayon_metres } = req.body as {
      latitude: number; longitude: number; rayon_metres: number;
    };
    if (latitude == null || longitude == null || !rayon_metres) {
      res.status(400).json({ error: "latitude, longitude et rayon_metres sont requis" });
      return;
    }
    await pool.query(
      `UPDATE tenants SET latitude = $1, longitude = $2, rayon_metres = $3 WHERE id = $4`,
      [latitude, longitude, rayon_metres, tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher: log out-of-zone attempt ────────────────────────────────────────
router.post("/teacher/attendance/location-incident", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const tenantId = req.session!.tenantId!;
    const { subjectId, classId, sessionDate, latitude, longitude, distance_metres, precision_metres } = req.body;
    await pool.query(
      `INSERT INTO attendance_location_incidents
         (teacher_id, subject_id, class_id, session_date, latitude, longitude,
          distance_metres, precision_metres, type, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SOUMISSION_HORS_ZONE',$9)`,
      [teacherId, subjectId, classId, sessionDate, latitude, longitude,
       distance_metres, precision_metres, tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: list GPS incidents ────────────────────────────────────────────────
router.get("/admin/attendance/location-incidents", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { rows } = await pool.query(
      `SELECT ali.*, u.name AS teacher_name, s.name AS subject_name, c.name AS class_name
       FROM attendance_location_incidents ali
       JOIN users u ON u.id = ali.teacher_id
       JOIN subjects s ON s.id = ali.subject_id
       JOIN classes c ON c.id = ali.class_id
       WHERE ali.tenant_id = $1
       ORDER BY ali.created_at DESC
       LIMIT 200`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Teacher: send session to scolarité ──────────────────────────────────────
router.post("/teacher/attendance/send", requireRole("teacher", "admin"), async (req, res) => {
  try {
    const teacherId = req.session!.userId!;
    const { subjectId, classId, semesterId, sessionDate,
            latitude, longitude, precision_metres, distance_etablissement, localisation_validee
          } = req.body as {
      subjectId: number; classId: number; semesterId: number; sessionDate: string;
      latitude?: number; longitude?: number; precision_metres?: number;
      distance_etablissement?: number; localisation_validee?: boolean;
    };

    if (!subjectId || !classId || !semesterId || !sessionDate) {
      res.status(400).json({ error: "Données manquantes" });
      return;
    }

    // La feuille ne peut être soumise que pour la date du jour
    const today = new Date().toISOString().split("T")[0];
    if (sessionDate !== today) {
      res.status(400).json({ error: "La feuille de présence ne peut être soumise que pour la date du jour." });
      return;
    }

    const now = new Date();

    await pool.query(
      `INSERT INTO attendance_sessions
         (teacher_id, subject_id, class_id, semester_id, session_date, sent_at,
          latitude, longitude, precision_metres, distance_etablissement, localisation_validee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (teacher_id, subject_id, class_id, session_date)
       DO UPDATE SET
         sent_at = EXCLUDED.sent_at,
         latitude = COALESCE(EXCLUDED.latitude, attendance_sessions.latitude),
         longitude = COALESCE(EXCLUDED.longitude, attendance_sessions.longitude),
         precision_metres = COALESCE(EXCLUDED.precision_metres, attendance_sessions.precision_metres),
         distance_etablissement = COALESCE(EXCLUDED.distance_etablissement, attendance_sessions.distance_etablissement),
         localisation_validee = COALESCE(EXCLUDED.localisation_validee, attendance_sessions.localisation_validee)`,
      [teacherId, subjectId, classId, semesterId, sessionDate, now,
       latitude ?? null, longitude ?? null, precision_metres ?? null,
       distance_etablissement ?? null, localisation_validee ?? false]
    );

    const [teacher] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, teacherId)).limit(1);
    const [subject] = await db.select({ name: subjectsTable.name }).from(subjectsTable).where(eq(subjectsTable.id, subjectId)).limit(1);
    const [classe] = await db.select({ name: classesTable.name }).from(classesTable).where(eq(classesTable.id, classId)).limit(1);

    const scolariteAdmins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "admin"), eq(usersTable.adminSubRole, "scolarite")));

    const msgTitle = `Feuille de présence — ${subject?.name ?? ""}`;
    const msgBody = `${teacher?.name ?? "L'enseignant"} a transmis la feuille de présence pour ${classe?.name ?? ""} (${sessionDate}).`;

    for (const admin of scolariteAdmins) {
      await db.insert(notificationsTable).values({
        userId: admin.id,
        type: "attendance_submitted",
        title: msgTitle,
        message: msgBody,
        read: false,
      });
    }

    // Notify parents of absent/late students
    const absentRecords = await db
      .select({ studentId: attendanceTable.studentId, status: attendanceTable.status })
      .from(attendanceTable)
      .where(and(eq(attendanceTable.subjectId, subjectId), eq(attendanceTable.classId, classId), eq(attendanceTable.sessionDate, sessionDate)));

    for (const rec of absentRecords) {
      if (rec.status !== "absent" && rec.status !== "late") continue;
      const parentLinks = await db.select({ parentId: parentStudentLinksTable.parentId })
        .from(parentStudentLinksTable).where(eq(parentStudentLinksTable.studentId, rec.studentId));
      const statusLabel = rec.status === "absent" ? "absent(e)" : "en retard";
      const notifTitle = `Absence — ${subject?.name ?? ""}`;
      const notifMsg = `Votre enfant a été signalé(e) ${statusLabel} en ${subject?.name ?? "cours"} le ${sessionDate}.`;
      for (const link of parentLinks) {
        await db.insert(notificationsTable).values({ userId: link.parentId, type: "absence_alert", title: notifTitle, message: notifMsg, read: false });
        sendPushToUser(link.parentId, { title: notifTitle, body: notifMsg, type: "absence_alert" }).catch(() => {});
      }
    }

    res.json({ message: "Feuille transmise à la scolarité", sentAt: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: list all sent sessions ───────────────────────────────────────────
router.get("/admin/attendance/sessions", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.session!.tenantId!;
    const { rows: sessions } = await pool.query(
      `SELECT
         ats.id,
         ats.teacher_id        AS "teacherId",
         u.name                AS "teacherName",
         ats.subject_id        AS "subjectId",
         s.name                AS "subjectName",
         ats.class_id          AS "classId",
         c.name                AS "className",
         ats.semester_id       AS "semesterId",
         sem.name              AS "semesterName",
         ats.session_date      AS "sessionDate",
         ats.sent_at           AS "sentAt",
         ats.latitude,
         ats.longitude,
         ats.precision_metres  AS "precisionMetres",
         ats.distance_etablissement AS "distanceEtablissement",
         ats.localisation_validee   AS "localisationValidee"
       FROM attendance_sessions ats
       JOIN users u    ON u.id  = ats.teacher_id
       JOIN subjects s ON s.id  = ats.subject_id
       JOIN classes c  ON c.id  = ats.class_id
       JOIN semesters sem ON sem.id = ats.semester_id
       WHERE ats.sent_at IS NOT NULL
         AND u.tenant_id = $1
       ORDER BY ats.sent_at DESC`,
      [tenantId]
    );

    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: get records for a specific session ───────────────────────────────
router.get("/admin/attendance/sessions/:id", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [session] = await db
      .select()
      .from(attendanceSessionsTable)
      .where(eq(attendanceSessionsTable.id, sessionId))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session introuvable" }); return; }

    const records = await db
      .select({
        studentId: attendanceTable.studentId,
        studentName: usersTable.name,
        status: attendanceTable.status,
        note: attendanceTable.note,
        startTime: attendanceTable.startTime,
        endTime: attendanceTable.endTime,
        justified: attendanceTable.justified,
      })
      .from(attendanceTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceTable.studentId))
      .where(
        and(
          eq(attendanceTable.teacherId, session.teacherId),
          eq(attendanceTable.subjectId, session.subjectId),
          eq(attendanceTable.classId, session.classId),
          eq(attendanceTable.sessionDate, session.sessionDate)
        )
      )
      .orderBy(usersTable.name);

    res.json({ session, records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: absence summary by semester ──────────────────────────────────────
router.get("/admin/attendance/summary", requireRole("admin"), async (req, res) => {
  try {
    const { semesterId, classId } = req.query as Record<string, string>;
    if (!semesterId) { res.status(400).json({ error: "semesterId requis" }); return; }

    const conditions: any[] = [eq(attendanceTable.semesterId, parseInt(semesterId))];
    if (classId) conditions.push(eq(attendanceTable.classId, parseInt(classId)));

    const records = await db
      .select({
        studentId: attendanceTable.studentId,
        studentName: usersTable.name,
        classId: attendanceTable.classId,
        className: classesTable.name,
        status: attendanceTable.status,
        startTime: attendanceTable.startTime,
        endTime: attendanceTable.endTime,
        sessionDate: attendanceTable.sessionDate,
      })
      .from(attendanceTable)
      .innerJoin(usersTable, eq(usersTable.id, attendanceTable.studentId))
      .innerJoin(classesTable, eq(classesTable.id, attendanceTable.classId))
      .where(and(...conditions))
      .orderBy(usersTable.name);

    // Group by student and compute totals
    const map = new Map<number, any>();
    for (const r of records) {
      if (r.status === "present") continue;
      if (!map.has(r.studentId)) {
        map.set(r.studentId, {
          studentId: r.studentId,
          studentName: r.studentName,
          classId: r.classId,
          className: r.className,
          absenceCount: 0,
          lateCount: 0,
          totalMinutes: 0,
        });
      }
      const entry = map.get(r.studentId)!;
      if (r.status === "absent") entry.absenceCount++;
      if (r.status === "late") entry.lateCount++;
      if (r.startTime && r.endTime) {
        const [sh, sm] = r.startTime.split(":").map(Number);
        const [eh, em] = r.endTime.split(":").map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) entry.totalMinutes += diff;
      }
    }

    res.json(Array.from(map.values()).sort((a, b) => a.studentName.localeCompare(b.studentName)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Admin: update a student's attendance record in a session ─────────────────
router.patch("/admin/attendance/sessions/:sessionId/student/:studentId", requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const studentId = parseInt(req.params.studentId);

    const [session] = await db
      .select()
      .from(attendanceSessionsTable)
      .where(eq(attendanceSessionsTable.id, sessionId))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session introuvable" }); return; }

    const { status, note, startTime, endTime, justified } = req.body as {
      status?: string;
      note?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      justified?: boolean;
    };

    const updateSet: Record<string, any> = {};
    if (status !== undefined) updateSet.status = status;
    if (note !== undefined) updateSet.note = note;
    if (startTime !== undefined) updateSet.startTime = startTime;
    if (endTime !== undefined) updateSet.endTime = endTime;
    if (justified !== undefined) updateSet.justified = justified;

    if (Object.keys(updateSet).length === 0) {
      res.status(400).json({ error: "Aucun champ à mettre à jour" });
      return;
    }

    await db
      .update(attendanceTable)
      .set(updateSet)
      .where(
        and(
          eq(attendanceTable.teacherId, session.teacherId),
          eq(attendanceTable.subjectId, session.subjectId),
          eq(attendanceTable.classId, session.classId),
          eq(attendanceTable.sessionDate, session.sessionDate),
          eq(attendanceTable.studentId, studentId)
        )
      );

    res.json({ message: "Enregistrement mis à jour" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── Student: get my own attendance records ───────────────────────────────────
router.get("/student/attendance/my", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session!.userId!;

    const records = await db
      .select({
        id: attendanceTable.id,
        sessionDate: attendanceTable.sessionDate,
        status: attendanceTable.status,
        note: attendanceTable.note,
        startTime: attendanceTable.startTime,
        endTime: attendanceTable.endTime,
        justified: attendanceTable.justified,
        subjectName: subjectsTable.name,
        subjectCoefficient: subjectsTable.coefficient,
        semesterName: semestersTable.name,
        semesterId: semestersTable.id,
      })
      .from(attendanceTable)
      .innerJoin(subjectsTable, eq(subjectsTable.id, attendanceTable.subjectId))
      .innerJoin(semestersTable, eq(semestersTable.id, attendanceTable.semesterId))
      .where(eq(attendanceTable.studentId, studentId))
      .orderBy(desc(attendanceTable.sessionDate));

    // Compute summary stats
    const absences = records.filter(r => r.status === "absent");
    const justified = absences.filter(r => r.justified);
    const unjustified = absences.filter(r => !r.justified);

    const calcHours = (r: typeof absences[number]) => {
      if (r.startTime && r.endTime) {
        const [sh, sm] = r.startTime.split(":").map(Number);
        const [eh, em] = r.endTime.split(":").map(Number);
        return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
      }
      return 1;
    };

    const totalAbsenceHours = absences.reduce((sum, r) => sum + calcHours(r), 0);
    const justifiedHours = justified.reduce((sum, r) => sum + calcHours(r), 0);
    const unjustifiedHours = unjustified.reduce((sum, r) => sum + calcHours(r), 0);

    res.json({
      records,
      summary: {
        totalSessions: records.length,
        totalAbsences: absences.length,
        totalPresences: records.filter(r => r.status === "present").length,
        totalLate: records.filter(r => r.status === "late").length,
        totalAbsenceHours: Math.round(totalAbsenceHours * 10) / 10,
        justifiedHours: Math.round(justifiedHours * 10) / 10,
        unjustifiedHours: Math.round(unjustifiedHours * 10) / 10,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
