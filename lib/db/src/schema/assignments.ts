import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";

export const teacherAssignmentsTable = pgTable("teacher_assignments", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  plannedHours: integer("planned_hours").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeacherAssignmentSchema = createInsertSchema(teacherAssignmentsTable).omit({ id: true, createdAt: true });
export type InsertTeacherAssignment = z.infer<typeof insertTeacherAssignmentSchema>;
export type TeacherAssignment = typeof teacherAssignmentsTable.$inferSelect;
