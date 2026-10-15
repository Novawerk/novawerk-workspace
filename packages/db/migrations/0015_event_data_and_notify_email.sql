ALTER TABLE "contributors" ADD COLUMN "notify_email" text;--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN "data" jsonb;