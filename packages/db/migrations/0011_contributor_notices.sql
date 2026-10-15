CREATE TYPE "public"."contributor_notice_status" AS ENUM('pending', 'sending', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "contributor_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"contributor_id" uuid,
	"task_id" integer,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"to_email" text,
	"status" "contributor_notice_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributor_notices_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "notify_replies" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "notify_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN "subject_contributor_id" uuid;--> statement-breakpoint
ALTER TABLE "contributor_notices" ADD CONSTRAINT "contributor_notices_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_notices" ADD CONSTRAINT "contributor_notices_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributor_notices_status_idx" ON "contributor_notices" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contributor_notices_recipient_idx" ON "contributor_notices" USING btree ("contributor_id","task_id","kind","sent_at");--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_subject_contributor_id_contributors_id_fk" FOREIGN KEY ("subject_contributor_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;