CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'chosen', 'not_chosen', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('task', 'improvement', 'bug');--> statement-breakpoint
CREATE TYPE "public"."task_size" AS ENUM('S', 'M', 'L', 'XL');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('draft', 'suggested', 'open', 'assigned', 'in_review', 'done', 'closed', 'declined', 'duplicate');--> statement-breakpoint
CREATE TABLE "contributor_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributor_tokens_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"about" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accent" text DEFAULT 'green' NOT NULL,
	"banner" text DEFAULT 'plain' NOT NULL,
	"avatar_url" text,
	"public" boolean DEFAULT false NOT NULL,
	"on_wall" boolean DEFAULT true NOT NULL,
	"github_id" bigint,
	"github_login" text,
	"email" text,
	"pledge_accepted_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"sessions_revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributors_handle_unique" UNIQUE("handle"),
	CONSTRAINT "contributors_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "contributors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "task_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"task_id" integer NOT NULL,
	"kind" text NOT NULL,
	"from_status" "task_status",
	"to_status" "task_status",
	"actor_contributor_id" uuid,
	"actor_member_id" text,
	"note" text,
	"pr_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" integer NOT NULL,
	"parent_id" uuid,
	"author_contributor_id" uuid,
	"author_member_id" text,
	"body" text NOT NULL,
	"via_token_id" uuid,
	"hidden_at" timestamp with time zone,
	"hidden_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" integer NOT NULL,
	"contributor_id" uuid NOT NULL,
	"approach" text NOT NULL,
	"testing" text DEFAULT '' NOT NULL,
	"eta" text NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"decline_note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"via_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_votes" (
	"task_id" integer NOT NULL,
	"contributor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_votes_task_id_contributor_id_pk" PRIMARY KEY("task_id","contributor_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "task_kind" DEFAULT 'task' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"area" text,
	"size" "task_size",
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"repo" text DEFAULT 'Novawerk/novawerk-workspace' NOT NULL,
	"status" "task_status" DEFAULT 'draft' NOT NULL,
	"assignee_id" uuid,
	"assigned_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"pr_url" text,
	"reviewer_id" text,
	"guide_template" text,
	"closed_reason" text,
	"suggested_by" uuid,
	"where" text,
	"where_path" text,
	"wants_it" boolean DEFAULT false NOT NULL,
	"needs_info" boolean DEFAULT false NOT NULL,
	"duplicate_of" integer,
	"thread_locked_at" timestamp with time zone,
	"created_by_member_id" text,
	"accepted_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "werk_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "werk_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"contributor_id" uuid,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"task_id" integer,
	"pr" text,
	"by_member_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "werk_ledger_task_pr_key" UNIQUE("task_id","pr")
);
--> statement-breakpoint
ALTER TABLE "sign_in_codes" ADD COLUMN "kind" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "contributor_tokens" ADD CONSTRAINT "contributor_tokens_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_contributor_id_contributors_id_fk" FOREIGN KEY ("actor_contributor_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_member_id_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_posts" ADD CONSTRAINT "task_posts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_posts" ADD CONSTRAINT "task_posts_parent_id_task_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_posts" ADD CONSTRAINT "task_posts_author_contributor_id_contributors_id_fk" FOREIGN KEY ("author_contributor_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_posts" ADD CONSTRAINT "task_posts_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_posts" ADD CONSTRAINT "task_posts_via_token_id_contributor_tokens_id_fk" FOREIGN KEY ("via_token_id") REFERENCES "public"."contributor_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_posts" ADD CONSTRAINT "task_posts_hidden_by_members_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_decided_by_members_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_via_token_id_contributor_tokens_id_fk" FOREIGN KEY ("via_token_id") REFERENCES "public"."contributor_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_votes" ADD CONSTRAINT "task_votes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_votes" ADD CONSTRAINT "task_votes_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_contributors_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_suggested_by_contributors_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duplicate_of_tasks_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "werk_ledger" ADD CONSTRAINT "werk_ledger_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "werk_ledger" ADD CONSTRAINT "werk_ledger_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "werk_ledger" ADD CONSTRAINT "werk_ledger_by_member_id_members_id_fk" FOREIGN KEY ("by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributor_tokens_contributor_idx" ON "contributor_tokens" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id","id");--> statement-breakpoint
CREATE INDEX "task_posts_task_idx" ON "task_posts" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_posts_author_idx" ON "task_posts" USING btree ("author_contributor_id","created_at");--> statement-breakpoint
CREATE INDEX "task_proposals_task_idx" ON "task_proposals" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_proposals_contributor_idx" ON "task_proposals" USING btree ("contributor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_proposals_one_pending_key" ON "task_proposals" USING btree ("task_id","contributor_id") WHERE "task_proposals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "task_votes_contributor_idx" ON "task_votes" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "tasks_status_updated_idx" ON "tasks" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_suggested_by_idx" ON "tasks" USING btree ("suggested_by");--> statement-breakpoint
CREATE INDEX "werk_ledger_contributor_idx" ON "werk_ledger" USING btree ("contributor_id","created_at");