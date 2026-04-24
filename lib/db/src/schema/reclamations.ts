import {
  pgTable, pgEnum, serial, integer, real, text, timestamp, boolean, unique, jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { semestersTable } from "./semesters";

export const reclamationTypeEnum = pgEnum("reclamation_type", [
  "erreur_saisie",
  "copie_non_corrigee",
  "bareme_conteste",
  "autre",
]);

export const reclamationStatusEnum = pgEnum("reclamation_status", [
  "soumise",
  "en_cours",
  "en_arbitrage",
  "acceptee",
  "rejetee",
  "cloturee",
]);

export const reclamationPeriodsTable = pgTable("reclamation_periods", {
  id: serial("id").primaryKey(),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  openDate: timestamp("open_date").notNull(),
  closeDate: timestamp("close_date").notNull(),
  teacherResponseDays: integer("teacher_response_days").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reclamationsTable = pgTable("reclamations", {
  id: serial("id").primaryKey(),
  claimNumber: text("claim_number").notNull().unique(),
  periodId: integer("period_id").notNull().references(() => reclamationPeriodsTable.id, { onDelete: "restrict" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").references(() => usersTable.id, { onDelete: "set null" }),
  contestedGrade: real("contested_grade").notNull(),
  contestedEvaluations: jsonb("contested_evaluations").$type<Array<{ evaluationNumber: number; currentGrade: number }>>(),
  proposedEvaluations: jsonb("proposed_evaluations").$type<Array<{ evaluationNumber: number; proposedGrade: number }>>(),
  type: reclamationTypeEnum("type").notNull(),
  motif: text("motif").notNull(),
  attachmentPath: text("attachment_path"),
  status: reclamationStatusEnum("status").notNull().default("soumise"),
  teacherComment: text("teacher_comment"),
  proposedGrade: real("proposed_grade"),
  adminComment: text("admin_comment"),
  finalGrade: real("final_grade"),
  resolvedBy: integer("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniqueStudentSubjectSemester: unique("reclamation_unique").on(t.studentId, t.subjectId, t.semesterId),
}));

export const reclamationHistoryTable = pgTable("reclamation_history", {
  id: serial("id").primaryKey(),
  reclamationId: integer("reclamation_id").notNull().references(() => reclamationsTable.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  detail: text("detail"),
  oldGrade: real("old_grade"),
  newGrade: real("new_grade"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReclamationPeriod = typeof reclamationPeriodsTable.$inferSelect;
export type Reclamation = typeof reclamationsTable.$inferSelect;
export type ReclamationHistory = typeof reclamationHistoryTable.$inferSelect;
