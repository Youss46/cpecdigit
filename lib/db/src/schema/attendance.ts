import { pgTable, serial, integer, varchar, text, timestamp, date, unique, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  sessionDate: date("session_date").notNull(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().default("present"),
  note: text("note"),
  startTime: varchar("start_time", { length: 5 }),
  endTime: varchar("end_time", { length: 5 }),
  justified: boolean("justified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.teacherId, t.subjectId, t.classId, t.sessionDate, t.studentId)]);

export const attendanceSessionsTable = pgTable("attendance_sessions", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  sessionDate: date("session_date").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.teacherId, t.subjectId, t.classId, t.sessionDate)]);

export type Attendance = typeof attendanceTable.$inferSelect;
export type AttendanceSession = typeof attendanceSessionsTable.$inferSelect;
