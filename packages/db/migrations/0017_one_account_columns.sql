CREATE TYPE "public"."member_role" AS ENUM('member', 'maintainer');--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "role" "member_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "accent" text DEFAULT 'green' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "banner" text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "on_wall" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "github_id" bigint;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "github_login" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_email" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "pledge_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "last_sign_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_replies" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "sessions_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_suspended_by_members_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_github_id_unique" UNIQUE("github_id");