import { pgTable, serial, varchar, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";
import { teachingUnitsTable } from "./teaching_units";
import { tenantsTable } from "./tenants";

export const subjectsTable = pgTable("subjects", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  coefficient: real("coefficient").notNull().default(1),
  credits: real("credits").default(1),
  description: text("description"),
  ueId: integer("ue_id").references(() => teachingUnitsTable.id, { onDelete: "set null" }),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "set null" }),
  semesterId: integer("semester_id").references(() => semestersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubjectSchema = createInsertSchema(subjectsTable).omit({ id: true, createdAt: true });
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Subject = typeof subjectsTable.$inferSelect;
