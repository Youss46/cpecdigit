import { pgTable, serial, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const academicYearArchivesTable = pgTable("academic_year_archives", {
  id: serial("id").primaryKey(),
  academicYear: varchar("academic_year", { length: 20 }).notNull().unique(),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  archivedById: integer("archived_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  newAcademicYear: varchar("new_academic_year", { length: 20 }),
  initializedAt: timestamp("initialized_at"),
  initializedById: integer("initialized_by_id").references(() => usersTable.id, { onDelete: "set null" }),
});

export type AcademicYearArchive = typeof academicYearArchivesTable.$inferSelect;
