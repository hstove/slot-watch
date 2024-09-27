import {
	pgTable,
	serial,
	text,
	varchar,
	integer,
	smallint,
	customType,
	timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

const bytea = customType<{ data: Uint8Array; notNull: false; default: false }>({
	dataType() {
		return "bytea";
	},
});

export const stackerDbSlots = pgTable("stacker_db_slots", {
	id: serial("id").primaryKey(),
	slotId: smallint("slot_id").notNull(),
	version: integer("version").notNull(),
	signature: bytea("signature").notNull(),
	data: bytea("data").notNull(),
	contractId: varchar("contract_id", { length: 255 }).notNull(),
	createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});
