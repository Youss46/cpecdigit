import { pgTable, serial, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";
import { semestersTable } from "./semesters";

export const UE_CATEGORIES = ["culture_generale", "connaissances_fondamentales", "specialite"] as const;
export type UeCategory = typeof UE_CATEGORIES[number];

export const UE_CATEGORY_LABELS: Record<UeCategory, string> = {
  culture_generale: "UE CULTURE GÉNÉRALE",
  connaissances_fondamentales: "UE DE CONNAISSANCES FONDAMENTALES",
  specialite: "UE DE SPÉCIALITÉ",
};

export const teachingUnitsTable = pgTable("teaching_units", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }),
  credits: integer("credits").notNull().default(3),
  coefficient: real("coefficient").notNull().default(1),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "cascade" }),
  semesterId: integer("semester_id").references(() => semestersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeachingUnitSchema = createInsertSchema(teachingUnitsTable).omit({ id: true, createdAt: true });
export type InsertTeachingUnit = z.infer<typeof insertTeachingUnitSchema>;
export type TeachingUnit = typeof teachingUnitsTable.$inferSelect;
