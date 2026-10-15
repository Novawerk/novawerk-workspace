ALTER TYPE "public"."proposal_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN "via_token_id" uuid;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_via_token_id_contributor_tokens_id_fk" FOREIGN KEY ("via_token_id") REFERENCES "public"."contributor_tokens"("id") ON DELETE set null ON UPDATE no action;