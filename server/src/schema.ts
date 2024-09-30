import {
	pgTable,
	serial,
	text,
	varchar,
	integer,
	smallint,
	customType,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Uint8Array; notNull: false; default: false }>({
	dataType() {
		return "bytea";
	},
});

export const stackerDbSlots = pgTable(
	"stacker_db_slots",
	{
		id: serial("id").primaryKey(),
		slotId: smallint("slot_id").notNull(),
		version: integer("version").notNull(),
		signature: bytea("signature").notNull(),
		data: bytea("data").notNull(),
		contractId: varchar("contract_id", { length: 255 }).notNull(),
		createdAt: timestamp("created_at").default(sql`now()`).notNull(),
		networkKey: varchar("network_key", { length: 20 }),
	},
	(table) => ({
		networkKeyIndex: index("network_key_idx").on(table.networkKey),
	}),
);
