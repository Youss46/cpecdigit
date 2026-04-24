import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { attendanceTable } from "./attendance";

export const absenceJustificationsTable = pgTable("absence_justifications", {
  id: serial("id").primaryKey(),
  attendanceId: integer("attendance_id").notNull().references(() => attendanceTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AbsenceJustification = typeof absenceJustificationsTable.$inferSelect;
