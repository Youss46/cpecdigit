import { pgTable, serial, integer, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const studentCardsTable = pgTable("student_cards", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  academicYear: varchar("academic_year", { length: 20 }).notNull(),
  hash: varchar("hash", { length: 64 }).notNull().unique(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  isValid: boolean("is_valid").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StudentCard = typeof studentCardsTable.$inferSelect;
