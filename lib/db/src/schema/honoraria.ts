import { pgTable, serial, integer, real, text, varchar, date, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const teacherHonorariaTable = pgTable("teacher_honoraria", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  totalAmount: real("total_amount").notNull().default(0),
  hourlyRate: real("hourly_rate"),
  periodLabel: varchar("period_label", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teacherPaymentsTable = pgTable("teacher_payments", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  description: varchar("description", { length: 255 }),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).default("especes"),
  recordedById: integer("recorded_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TeacherHonorarium = typeof teacherHonorariaTable.$inferSelect;
export type TeacherPayment = typeof teacherPaymentsTable.$inferSelect;
