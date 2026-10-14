ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirm_token_hash" text;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirm_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirm_window_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "confirm_send_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_confirm_token_hash_unique" UNIQUE("confirm_token_hash");--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token");