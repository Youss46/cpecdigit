import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";

export const subjectApprovalsTable = pgTable("subject_approvals", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  approvedById: integer("approved_by_id").notNull().references(() => usersTable.id),
  approvedAt: timestamp("approved_at").defaultNow().notNull(),
}, (table) => ({
  uniqueApproval: unique().on(table.subjectId, table.classId, table.semesterId),
}));

export type SubjectApproval = typeof subjectApprovalsTable.$inferSelect;
