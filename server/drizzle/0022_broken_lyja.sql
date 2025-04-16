CREATE TABLE "state_machine_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"signer_public_key" varchar(66) NOT NULL,
	"network_key" varchar(20) NOT NULL,
	"local_signer_protocol_version" integer NOT NULL,
	"active_signer_protocol_version" integer NOT NULL,
	"update_content" json NOT NULL,
	"chunk_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "state_machine_updates" ADD CONSTRAINT "state_machine_updates_chunk_id_stacker_db_slots_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."stacker_db_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "state_machine_updates_network_key_idx" ON "state_machine_updates" USING btree ("network_key");--> statement-breakpoint
CREATE INDEX "state_machine_updates_signer_public_key_idx" ON "state_machine_updates" USING btree ("signer_public_key");--> statement-breakpoint
CREATE INDEX "state_machine_updates_by_signer_latest_idx" ON "state_machine_updates" USING btree ("signer_public_key","created_at" DESC NULLS LAST,"network_key");