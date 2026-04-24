import { pgTable, serial, integer, varchar, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const housingBuildingsTable = pgTable("housing_buildings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  floors: integer("floors").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const housingRoomsTable = pgTable("housing_rooms", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => housingBuildingsTable.id, { onDelete: "cascade" }),
  roomNumber: varchar("room_number", { length: 20 }).notNull().unique(),
  floor: integer("floor").notNull().default(0),
  capacity: integer("capacity").notNull().default(1),
  type: varchar("type", { length: 20 }).notNull().default("simple"),
  pricePerMonth: numeric("price_per_month", { precision: 10, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("available"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const housingAssignmentsTable = pgTable("housing_assignments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  roomId: integer("room_id").notNull().references(() => housingRoomsTable.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
