import { pgTable, serial, varchar, text, integer } from "drizzle-orm/pg-core";

export const ecolesInphbTable = pgTable("ecoles_inphb", {
  id: serial("id").primaryKey(),
  acronym: varchar("acronym", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export type EcoleInphb = typeof ecolesInphbTable.$inferSelect;
