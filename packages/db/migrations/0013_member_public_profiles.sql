ALTER TABLE "members" ADD COLUMN "public_profile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "profile_handle" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "profile_bio" text;--> statement-breakpoint
CREATE INDEX "project_members_member_role_idx" ON "project_members" USING btree ("member_id","role");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_profile_handle_unique" UNIQUE("profile_handle");