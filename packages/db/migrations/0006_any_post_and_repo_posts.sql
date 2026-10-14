ALTER TYPE "public"."post_kind" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "langs" text[] DEFAULT '{zh,en}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "platforms" text[];--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "with_card" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "source_path" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "source_hash" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "source_commit" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_source_path_unique" UNIQUE("source_path");