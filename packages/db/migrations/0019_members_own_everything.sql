ALTER TABLE "contributor_moderation" DROP CONSTRAINT "contributor_moderation_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "contributor_notices" DROP CONSTRAINT "contributor_notices_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "contributor_tokens" DROP CONSTRAINT "contributor_tokens_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "post_reports" DROP CONSTRAINT "post_reports_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT "task_events_actor_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT "task_events_subject_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "task_posts" DROP CONSTRAINT "task_posts_author_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "task_proposals" DROP CONSTRAINT "task_proposals_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "task_votes" DROP CONSTRAINT "task_votes_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_suggested_by_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "werk_ledger" DROP CONSTRAINT "werk_ledger_contributor_id_contributors_id_fk";
--> statement-breakpoint
ALTER TABLE "contributor_moderation" ALTER COLUMN "contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "contributor_notices" ALTER COLUMN "contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "contributor_tokens" ALTER COLUMN "contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "profile_handle" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "post_reports" ALTER COLUMN "contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "task_events" ALTER COLUMN "actor_contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "task_events" ALTER COLUMN "subject_contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "task_posts" ALTER COLUMN "author_contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "task_proposals" ALTER COLUMN "contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "task_votes" ALTER COLUMN "contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "assignee_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "suggested_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "werk_ledger" ALTER COLUMN "contributor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "contributor_moderation" ADD CONSTRAINT "contributor_moderation_contributor_id_members_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_notices" ADD CONSTRAINT "contributor_notices_contributor_id_members_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_tokens" ADD CONSTRAINT "contributor_tokens_contributor_id_members_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_contributor_id_members_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_contributor_id_members_id_fk" FOREIGN KEY ("actor_contributor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_subject_contributor_id_members_id_fk" FOREIGN KEY ("subject_contributor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_posts" ADD CONSTRAINT "task_posts_author_contributor_id_members_id_fk" FOREIGN KEY ("author_contributor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_contributor_id_members_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_votes" ADD CONSTRAINT "task_votes_contributor_id_members_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_suggested_by_members_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "werk_ledger" ADD CONSTRAINT "werk_ledger_contributor_id_members_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN "can_admin";