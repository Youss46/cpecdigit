import { pgTable, serial, integer, text, varchar, date, real, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";

export const cahierDeTexteTable = pgTable("cahier_de_texte", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  sessionDate: date("session_date").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  contenu: text("contenu").notNull(),
  devoirs: text("devoirs"),
  heuresEffectuees: real("heures_effectuees"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CahierDeTexte = typeof cahierDeTexteTable.$inferSelect;
