import { pgTable, serial, integer, timestamp, text, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";

export const gradeSubmissionsTable = pgTable("grade_submissions", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teacherName: text("teacher_name").notNull(),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  subjectName: text("subject_name").notNull(),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  className: text("class_name").notNull(),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSubmission: unique().on(table.teacherId, table.subjectId, table.classId, table.semesterId),
}));

export type GradeSubmission = typeof gradeSubmissionsTable.$inferSelect;
