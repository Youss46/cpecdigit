import { pgTable, serial, varchar, text, integer, boolean, timestamp, pgEnum, real } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { semestersTable } from "./semesters";

export const resourceTypeEnum = pgEnum("resource_type", [
  "pdf",
  "word",
  "powerpoint",
  "image",
  "archive",
  "youtube",
  "link",
]);

export const libraryResourcesTable = pgTable("library_resources", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  type: resourceTypeEnum("type").notNull(),
  subjectId: integer("subject_id").references(() => subjectsTable.id, { onDelete: "set null" }),
  semesterId: integer("semester_id").references(() => semestersTable.id, { onDelete: "set null" }),
  classIds: text("class_ids").notNull().default("[]"),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  fileUrl: text("file_url"),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  description: text("description"),
  availableFrom: timestamp("available_from"),
  suspended: boolean("suspended").default(false).notNull(),
  downloadCount: integer("download_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const libraryDownloadsTable = pgTable("library_downloads", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id").notNull().references(() => libraryResourcesTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  downloadedAt: timestamp("downloaded_at").defaultNow().notNull(),
});

/* ── Quiz tables ─────────────────────────────────────────────────────────── */

export const libraryQuizTable = pgTable("library_quiz", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id").notNull().references(() => libraryResourcesTable.id, { onDelete: "cascade" }),
  titre: varchar("titre", { length: 200 }).notNull(),
  durreeMinutes: integer("duree_minutes"),
  noteMinimale: real("note_minimale"),
  nbTentatives: integer("nb_tentatives").default(2).notNull(),
  actif: boolean("actif").default(true).notNull(),
  creePar: integer("cree_par").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  creeLe: timestamp("cree_le").defaultNow().notNull(),
});

export const libraryQuizQuestionsTable = pgTable("library_quiz_questions", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => libraryQuizTable.id, { onDelete: "cascade" }),
  texte: text("texte").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("qcm"), // qcm | qcm_multi | vrai_faux | libre
  explication: text("explication"),
  points: integer("points").default(1).notNull(),
  ordre: integer("ordre").notNull(),
});

export const libraryQuizReponsesTable = pgTable("library_quiz_reponses", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => libraryQuizQuestionsTable.id, { onDelete: "cascade" }),
  texte: varchar("texte", { length: 500 }).notNull(),
  estCorrecte: boolean("est_correcte").default(false).notNull(),
  ordre: integer("ordre").notNull(),
});

export const libraryQuizResultatsTable = pgTable("library_quiz_resultats", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => libraryQuizTable.id, { onDelete: "cascade" }),
  etudiantId: integer("etudiant_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  score: real("score").notNull(),
  maxScore: real("max_score").notNull(),
  durreeSecondes: integer("duree_secondes"),
  tentative: integer("tentative").default(1).notNull(),
  reponsesDonnees: text("reponses_donnees").default("{}").notNull(),
  termineLe: timestamp("termine_le").defaultNow().notNull(),
});

/* ── Time tracking ───────────────────────────────────────────────────────── */

export const libraryTimeTrackingTable = pgTable("library_time_tracking", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id").notNull().references(() => libraryResourcesTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  durreeSecondes: integer("duree_secondes").notNull(),
  trackedAt: timestamp("tracked_at").defaultNow().notNull(),
});

export type LibraryResource = typeof libraryResourcesTable.$inferSelect;
export type LibraryDownload = typeof libraryDownloadsTable.$inferSelect;
export type LibraryQuiz = typeof libraryQuizTable.$inferSelect;
export type LibraryQuizQuestion = typeof libraryQuizQuestionsTable.$inferSelect;
export type LibraryQuizReponse = typeof libraryQuizReponsesTable.$inferSelect;
export type LibraryQuizResultat = typeof libraryQuizResultatsTable.$inferSelect;
export type LibraryTimeTracking = typeof libraryTimeTrackingTable.$inferSelect;
