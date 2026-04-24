import { pgTable, serial, varchar, text, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const blockedDatesTable = pgTable("blocked_dates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  dateEnd: date("date_end"),
  reason: varchar("reason", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("autre"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBlockedDateSchema = createInsertSchema(blockedDatesTable).omit({ id: true, createdAt: true });
export type InsertBlockedDate = z.infer<typeof insertBlockedDateSchema>;
export type BlockedDate = typeof blockedDatesTable.$inferSelect;
