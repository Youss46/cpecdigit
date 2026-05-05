import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  real,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { tenantsTable } from "./tenants";

export const devoirsTable = pgTable("devoirs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  matiereId: integer("matiere_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  enseignantId: integer("enseignant_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  titre: varchar("titre", { length: 255 }).notNull(),
  description: text("description"),
  durееMinutes: integer("duree_minutes").notNull().default(60),
  dateDebut: timestamp("date_debut").notNull(),
  dateFin: timestamp("date_fin").notNull(),
  nbTentatives: integer("nb_tentatives").notNull().default(1),
  noteSur: real("note_sur").notNull().default(20),
  typeDevoir: varchar("type_devoir", { length: 30 }).notNull().default("exercice"),
  optionsAntitiche: jsonb("options_antitiche").notNull().default({}),
  statut: varchar("statut", { length: 20 }).notNull().default("brouillon"),
  creeLe: timestamp("cree_le").defaultNow().notNull(),
});

export const devoirClassesTable = pgTable("devoir_classes", {
  id: serial("id").primaryKey(),
  devoirId: integer("devoir_id").notNull().references(() => devoirsTable.id, { onDelete: "cascade" }),
  classeId: integer("classe_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
});

export const devoirQuestionsTable = pgTable("devoir_questions", {
  id: serial("id").primaryKey(),
  devoirId: integer("devoir_id").notNull().references(() => devoirsTable.id, { onDelete: "cascade" }),
  texte: text("texte").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  points: real("points").notNull().default(1),
  ordre: integer("ordre").notNull().default(0),
  explication: text("explication"),
  valeurNumerique: real("valeur_numerique"),
  toleranceNumerique: real("tolerance_numerique").default(0),
});

export const devoirReponsesPossiblesTable = pgTable("devoir_reponses_possibles", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => devoirQuestionsTable.id, { onDelete: "cascade" }),
  texte: text("texte").notNull(),
  estCorrecte: boolean("est_correcte").notNull().default(false),
  ordre: integer("ordre").notNull().default(0),
});

export const devoirSessionsTable = pgTable("devoir_sessions", {
  id: serial("id").primaryKey(),
  devoirId: integer("devoir_id").notNull().references(() => devoirsTable.id, { onDelete: "cascade" }),
  etudiantId: integer("etudiant_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  debutLe: timestamp("debut_le").defaultNow().notNull(),
  finPrevue: timestamp("fin_prevue").notNull(),
  statut: varchar("statut", { length: 30 }).notNull().default("en_cours"),
  ordreQuestions: jsonb("ordre_questions").notNull().default([]),
  soumisLe: timestamp("soumis_le"),
  nbIncidents: integer("nb_incidents").notNull().default(0),
  tentativeNumero: integer("tentative_numero").notNull().default(1),
});

export const devoirReponsesEtudiantsTable = pgTable("devoir_reponses_etudiants", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => devoirSessionsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => devoirQuestionsTable.id, { onDelete: "cascade" }),
  reponseIds: jsonb("reponse_ids").notNull().default([]),
  reponseTexte: text("reponse_texte"),
  reponseNumerique: real("reponse_numerique"),
  estCorrecte: boolean("est_correcte"),
  pointsObtenus: real("points_obtenus"),
  sauvegarDeLe: timestamp("sauvegarde_le").defaultNow().notNull(),
});

export const devoirIncidentsTable = pgTable("devoir_incidents", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => devoirSessionsTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  occurreeLe: timestamp("occurree_le").defaultNow().notNull(),
  dureeSecondes: integer("duree_secondes"),
  questionEnCours: integer("question_en_cours"),
  details: text("details"),
});

export const devoirResultatsTable = pgTable("devoir_resultats", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => devoirSessionsTable.id, { onDelete: "cascade" }),
  etudiantId: integer("etudiant_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  scoreBrut: real("score_brut").notNull().default(0),
  scorePossible: real("score_possible").notNull().default(0),
  noteSur20: real("note_sur_20").notNull().default(0),
  statut: varchar("statut", { length: 30 }).notNull().default("corrige"),
  detailsCorrection: jsonb("details_correction").notNull().default([]),
  corrigeLe: timestamp("corrige_le").defaultNow().notNull(),
});

export type Devoir = typeof devoirsTable.$inferSelect;
export type DevoirQuestion = typeof devoirQuestionsTable.$inferSelect;
export type DevoirReponsePossible = typeof devoirReponsesPossiblesTable.$inferSelect;
export type DevoirSession = typeof devoirSessionsTable.$inferSelect;
export type DevoirReponseEtudiant = typeof devoirReponsesEtudiantsTable.$inferSelect;
export type DevoirIncident = typeof devoirIncidentsTable.$inferSelect;
export type DevoirResultat = typeof devoirResultatsTable.$inferSelect;
