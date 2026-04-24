import { pgTable, serial, text, varchar, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const keyDurationEnum = pgEnum("key_duration", ["lifetime", "1year", "2years", "5years", "10years"]);
export const keyStatusEnum = pgEnum("key_status", ["available", "assigned", "revoked"]);

export const activationKeysTable = pgTable("activation_keys", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  duration: keyDurationEnum("duration").notNull(),
  status: keyStatusEnum("status").notNull().default("available"),
  assignedToUserId: text("assigned_to_user_id"),
  assignedAt: timestamp("assigned_at"),
  shownAt: timestamp("shown_at"),
  expiresAt: timestamp("expires_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ActivationKey = typeof activationKeysTable.$inferSelect;
