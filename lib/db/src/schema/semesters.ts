import { pgTable, serial, varchar, boolean, timestamp, date, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";

export const semestersTable = pgTable("semesters", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  academicYear: varchar("academic_year", { length: 20 }).notNull(),
  published: boolean("published").notNull().default(false),
  startDate: date("start_date"),
  endDate: date("end_date"),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "set null" }),
  semesterNumber: integer("semester_number"),
  niveauLmd: varchar("niveau_lmd", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_semester_class_year").on(table.classId, table.academicYear, table.semesterNumber),
]);

export const insertSemesterSchema = createInsertSchema(semestersTable).omit({ id: true, createdAt: true, published: true });
export type InsertSemester = z.infer<typeof insertSemesterSchema>;
export type Semester = typeof semestersTable.$inferSelect;
