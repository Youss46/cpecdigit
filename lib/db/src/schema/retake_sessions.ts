import { pgTable, serial, integer, varchar, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { semestersTable } from "./semesters";

export const retakeSessionStatusEnum = pgEnum("retake_session_status", ["open", "closed"]);

export const retakeSessionsTable = pgTable("retake_sessions", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 255 }).notNull(),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id, { onDelete: "cascade" }),
  status: retakeSessionStatusEnum("status").notNull().default("open"),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RetakeSession = typeof retakeSessionsTable.$inferSelect;
