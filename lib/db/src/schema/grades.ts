import { pgTable, serial, integer, real, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { semestersTable } from "./semesters";

export const gradesTable = pgTable("grades", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  evaluationNumber: integer("evaluation_number").notNull().default(1),
  value: real("value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueGrade: unique("grades_unique_eval").on(table.studentId, table.subjectId, table.semesterId, table.evaluationNumber),
}));

export const insertGradeSchema = createInsertSchema(gradesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGrade = z.infer<typeof insertGradeSchema>;
export type Grade = typeof gradesTable.$inferSelect;
