import { pgTable, serial, varchar, integer, timestamp, json } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { semestersTable } from "./semesters";

export const bulletinTokensTable = pgTable("bulletin_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  semesterId: integer("semester_id").notNull().references(() => semestersTable.id),
  snapshot: json("snapshot").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
});

export const bulletinVerificationLogsTable = pgTable("bulletin_verification_logs", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id").notNull().references(() => bulletinTokensTable.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
});
