CREATE TABLE IF NOT EXISTS "stacker_db_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_id" smallint NOT NULL,
	"version" integer NOT NULL,
	"signature" "bytea" NOT NULL,
	"data" "bytea" NOT NULL,
	"contract_id" varchar(255) NOT NULL
);
