import { pgTable, serial, integer, real, boolean, varchar, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { semestersTable } from "./semesters";

export const specialJurySessionsTable = pgTable("special_jury_sessions", {
  id: serial("id").primaryKey(),
  academicYear: varchar("academic_year", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  activatedBy: integer("activated_by").references(() => usersTable.id, { onDelete: "set null" }),
  closedBy: integer("closed_by").references(() => usersTable.id, { onDelete: "set null" }),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const specialJuryDecisionsTable = pgTable("special_jury_decisions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => specialJurySessionsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  decision: varchar("decision", { length: 30 }).notNull(),
  previousAverage: real("previous_average"),
  newAverage: real("new_average"),
  justification: text("justification").notNull(),
  source: varchar("source", { length: 30 }).notNull().default("jury_special"),
  decidedBy: integer("decided_by").references(() => usersTable.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at").defaultNow().notNull(),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniqueDecision: unique("jury_decision_unique").on(t.sessionId, t.studentId, t.semesterId),
}));

export type SpecialJurySession = typeof specialJurySessionsTable.$inferSelect;
export type SpecialJuryDecision = typeof specialJuryDecisionsTable.$inferSelect;
