CREATE TABLE "chat_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"task_id" integer,
	"body" text NOT NULL,
	"status" "contributor_notice_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_notices_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "chat_notices" ADD CONSTRAINT "chat_notices_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_notices_status_idx" ON "chat_notices" USING btree ("status","created_at");