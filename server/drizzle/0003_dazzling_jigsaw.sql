ALTER TABLE "block_proposals" ADD COLUMN "index_block_hash" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "block_proposals_signer_signature_hash_network_key_idx" ON "block_proposals" USING btree ("signer_signature_hash");--> statement-breakpoint
CREATE INDEX "block_proposals_index_block_hash_idx" ON "block_proposals" USING btree ("index_block_hash");--> statement-breakpoint
CREATE INDEX "stacks_blocks_index_block_hash_idx" ON "stacks_blocks" USING btree ("index_block_hash");--> statement-breakpoint
CREATE INDEX "stacks_blocks_index_block_hash_network_key_idx" ON "stacks_blocks" USING btree ("network_key","index_block_hash");