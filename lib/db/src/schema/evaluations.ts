import { pgTable, serial, integer, boolean, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { semestersTable } from "./semesters";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";

export const evaluationPeriodsTable = pgTable("evaluation_periods", {
  id: serial("id").primaryKey(),
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
  a1: integer("a1").notNull(), // Contenu du cours (texte, illustration)
  a2: integer("a2").notNull(), // Prise en compte des objectifs fixés
  a3: integer("a3").notNull(), // Qualité de la progression de la formation
  a4: integer("a4").notNull(), // Clarté des concepts abordés
  a5: integer("a5").notNull(), // Alternance théorie / pratique

  // Section B — Formateur (poids 50%)
  b1: integer("b1").notNull(), // Maîtrise du contenu
  b2: integer("b2").notNull(), // Approche pédagogique
  b3: integer("b3").notNull(), // Organisation du cours
  b4: integer("b4").notNull(), // Qualité des échanges avec les apprenants
  b5: integer("b5").notNull(), // Comportement vis-à-vis des apprenants
  b6: integer("b6").notNull(), // Prise en compte des difficultés individuelles
  b7: integer("b7").notNull(), // Voix (articulation, qualité et portée)
  b8: integer("b8").notNull(), // Présentation physique (tenue vestimentaire, propreté)
  b9: integer("b9").notNull(), // Gestion du temps (rythme, durée)

  // Section C — Apprenants (poids 20%)
  c1: integer("c1").notNull(), // Satisfaction par rapport aux attentes
  c2: integer("c2").notNull(), // Satisfaction par rapport aux réponses aux questions
  c3: integer("c3").notNull(), // Utilité (richesse) de la documentation remise
  c4: integer("c4").notNull(), // Possibilité d'appliquer les thèmes abordés
  c5: integer("c5").notNull(), // Qualité des travaux dirigés
  c6: integer("c6").notNull(), // Qualité des évaluations (interrogations, devoirs)

  // Section D — Appréciations libres (texte)
  d1: text("d1"), // Thèmes les plus appréciés
  d2: text("d2"), // Thèmes les moins appréciés
  d3: text("d3"), // Éléments manquants ou à modifier
  d4: text("d4"), // Propositions d'amélioration

  // Question finale sur l'utilité globale
  utilite: integer("utilite"), // 1=Très utile, 2=Utile, 3=Peu utile, 4=Inutile

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
