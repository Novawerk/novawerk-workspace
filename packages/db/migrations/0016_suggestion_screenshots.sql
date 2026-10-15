ALTER TABLE "tasks" ADD COLUMN "screenshot_pathname" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "screenshot_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_screenshot_pathname_key" ON "tasks" USING btree ("screenshot_pathname") WHERE "tasks"."screenshot_pathname" is not null;