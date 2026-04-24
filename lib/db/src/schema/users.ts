import { pgTable, serial, text, varchar, timestamp, boolean, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("user_role", ["admin", "teacher", "student", "parent"]);
export const adminSubRoleEnum = pgEnum("admin_sub_role", ["scolarite", "planificateur", "directeur", "hebergement"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("student"),
  adminSubRole: adminSubRoleEnum("admin_sub_role"),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  phone: varchar("phone", { length: 50 }),
  firstLoginAt: timestamp("first_login_at"),
  activationKeyShown: boolean("activation_key_shown").default(false).notNull(),
  requiresActivationKey: boolean("requires_activation_key").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const studentProfilesTable = pgTable("student_profiles", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  matricule: varchar("matricule", { length: 100 }),
  dateNaissance: varchar("date_naissance", { length: 20 }),
  lieuNaissance: varchar("lieu_naissance", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  parentName: varchar("parent_name", { length: 255 }),
  parentPhone: varchar("parent_phone", { length: 50 }),
  parentEmail: varchar("parent_email", { length: 255 }),
  parentAddress: text("parent_address"),
  photoUrl: text("photo_url"),
  sexe: varchar("sexe", { length: 1 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type StudentProfile = typeof studentProfilesTable.$inferSelect;
