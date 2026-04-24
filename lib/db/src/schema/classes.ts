import { pgTable, serial, varchar, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  filiere: varchar("filiere", { length: 255 }),
  description: text("description"),
  nextClassId: integer("next_class_id").references((): any => classesTable.id, { onDelete: "set null" }),
  orderIndex: integer("order_index").notNull().default(0),
  isTerminal: boolean("is_terminal").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const classEnrollmentsTable = pgTable("class_enrollments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
});

export const insertClassSchema = createInsertSchema(classesTable).omit({ id: true, createdAt: true });
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classesTable.$inferSelect;

export const insertClassEnrollmentSchema = createInsertSchema(classEnrollmentsTable).omit({ id: true, enrolledAt: true });
export type InsertClassEnrollment = z.infer<typeof insertClassEnrollmentSchema>;
