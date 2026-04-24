import { pgTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  subdomain: varchar("subdomain", { length: 100 }).notNull().unique(),
  domain: varchar("domain", { length: 255 }),
  country: varchar("country", { length: 100 }),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 20 }).default("#1778c2"),
  active: boolean("active").notNull().default(true),
  contactEmail: varchar("contact_email", { length: 255 }),
  planType: varchar("plan_type", { length: 50 }).default("standard"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
