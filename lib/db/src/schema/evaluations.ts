import { pgTable, serial, integer, boolean, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { semestersTable } from "./semesters";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { tenantsTable } from "./tenants";

export const evaluationPeriodsTable = pgTable("evaluation_periods", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  deadline: timestamp("deadline").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  resultsVisible: boolean("results_visible").notNull().default(false),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teacherEvaluationsTable = pgTable("teacher_evaluations", {
  id: serial("id").primaryKey(),
  periodId: integer("period_id").notNull().references(() => evaluationPeriodsTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),

  // Section A — Contenu de la Formation (poids 30%)
  a1: integer("a1").notNull(),
  a2: integer("a2").notNull(),
  a3: integer("a3").notNull(),
  a4: integer("a4").notNull(),
  a5: integer("a5").notNull(),

  // Section B — Formateur (poids 50%)
  b1: integer("b1").notNull(),
  b2: integer("b2").notNull(),
  b3: integer("b3").notNull(),
  b4: integer("b4").notNull(),
  b5: integer("b5").notNull(),
  b6: integer("b6").notNull(),
  b7: integer("b7").notNull(),
  b8: integer("b8").notNull(),
  b9: integer("b9").notNull(),

  // Section C — Apprenants (poids 20%)
  c1: integer("c1").notNull(),
  c2: integer("c2").notNull(),
  c3: integer("c3").notNull(),
  c4: integer("c4").notNull(),
  c5: integer("c5").notNull(),
  c6: integer("c6").notNull(),

  // Section D — Appréciations libres
  d1: text("d1"),
  d2: text("d2"),
  d3: text("d3"),
  d4: text("d4"),

  utilite: integer("utilite"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const evaluationSubmissionsTable = pgTable("evaluation_submissions", {
  id: serial("id").primaryKey(),
  periodId: integer("period_id").notNull().references(() => evaluationPeriodsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
}, (t) => ({
  uniqueSubmission: unique("eval_submission_unique").on(t.periodId, t.studentId, t.teacherId),
}));

export type EvaluationPeriod = typeof evaluationPeriodsTable.$inferSelect;
export type TeacherEvaluation = typeof teacherEvaluationsTable.$inferSelect;
export type EvaluationSubmission = typeof evaluationSubmissionsTable.$inferSelect;
