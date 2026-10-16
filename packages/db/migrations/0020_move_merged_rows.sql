-- NB-ADR-0014: one account for everyone. Step 4 of 5.
-- Every row a merged contributor owned now belongs to the member they became part of (0018),
-- then the placeholders and the merge table go. 0021 drops the contributors table.

UPDATE "contributor_moderation" t SET "contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "contributor_notices" t SET "contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "contributor_tokens" t SET "contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "post_reports" t SET "contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "task_events" t SET "actor_contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."actor_contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "task_events" t SET "subject_contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."subject_contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "task_posts" t SET "author_contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."author_contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "task_proposals" t SET "contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "task_votes" t SET "contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."contributor_id" = x."contributor_id";--> statement-breakpoint
UPDATE "tasks" t SET "assignee_id" = x."member_id" FROM "_account_merge" x WHERE t."assignee_id" = x."contributor_id";--> statement-breakpoint
UPDATE "tasks" t SET "suggested_by" = x."member_id" FROM "_account_merge" x WHERE t."suggested_by" = x."contributor_id";--> statement-breakpoint
UPDATE "werk_ledger" t SET "contributor_id" = x."member_id" FROM "_account_merge" x WHERE t."contributor_id" = x."contributor_id";--> statement-breakpoint
DELETE FROM "members" WHERE "id" IN (SELECT "contributor_id" FROM "_account_merge");--> statement-breakpoint
DROP TABLE "_account_merge";
