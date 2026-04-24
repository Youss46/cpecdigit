import { pgTable, serial, integer, real, text, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { retakeSessionsTable } from "./retake_sessions";

export const retakeGradesTable = pgTable("retake_grades", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => retakeSessionsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  value: real("value"),
  observation: text("observation"),
  submissionStatus: varchar("submission_status", { length: 20 }).notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueRetakeGrade: unique("retake_grades_unique").on(table.sessionId, table.studentId, table.subjectId),
}));

export type RetakeGrade = typeof retakeGradesTable.$inferSelect;
