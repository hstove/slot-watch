ALTER TABLE "block_proposals" DROP CONSTRAINT "block_proposals_chunk_id_stacker_db_slots_id_fk";
--> statement-breakpoint
ALTER TABLE "block_pushes" DROP CONSTRAINT "block_pushes_chunk_id_stacker_db_slots_id_fk";
--> statement-breakpoint
ALTER TABLE "block_responses" DROP CONSTRAINT "block_responses_chunk_id_stacker_db_slots_id_fk";
--> statement-breakpoint
ALTER TABLE "state_machine_updates" DROP CONSTRAINT "state_machine_updates_chunk_id_stacker_db_slots_id_fk";
