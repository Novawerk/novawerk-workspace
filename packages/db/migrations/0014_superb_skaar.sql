CREATE TABLE "contributor_moderation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contributor_moderation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"contributor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"member_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "contributors" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "task_posts" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "task_posts" ADD COLUMN "reports_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contributor_moderation" ADD CONSTRAINT "contributor_moderation_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_moderation" ADD CONSTRAINT "contributor_moderation_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributor_moderation_contributor_idx" ON "contributor_moderation" USING btree ("contributor_id","created_at");--> statement-breakpoint
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_suspended_by_members_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;