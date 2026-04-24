import { pgTable, serial, integer, varchar, text, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { roomsTable } from "./rooms";
import { semestersTable } from "./semesters";

export const scheduleEntriesTable = pgTable("schedule_entries", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  roomId: integer("room_id").notNull().references(() => roomsTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  sessionDate: date("session_date").notNull(), // "2025-01-15" — date précise, indépendante
  startTime: varchar("start_time", { length: 5 }).notNull(), // "08:00"
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "10:00"
  notes: text("notes"),
  teamsLink: text("teams_link"),
  published: boolean("published").notNull().default(false),
  batchId: varchar("batch_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScheduleEntrySchema = createInsertSchema(scheduleEntriesTable).omit({ id: true, createdAt: true });
export type InsertScheduleEntry = z.infer<typeof insertScheduleEntrySchema>;
export type ScheduleEntry = typeof scheduleEntriesTable.$inferSelect;

export const schedulePublicationsTable = pgTable("schedule_publications", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  publishedFrom: timestamp("published_from").notNull(),
  publishedUntil: timestamp("published_until").notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
});

export type SchedulePublication = typeof schedulePublicationsTable.$inferSelect;
