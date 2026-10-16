-- NB-ADR-0014: one account for everyone. Step 2 of 5 (0017 added the columns).
-- Copies every contributor into members. A contributor whose verified address (sign-in email,
-- or GitHub's primary email) is a member's becomes part of that member; every other contributor
-- becomes a member with its uuid as id. 0019 points the foreign keys at members; 0020 moves the
-- merged contributors' rows onto their member and removes the placeholders this step leaves.

-- Maintainers are the members who could admin; everyone else is a member.
UPDATE "members" SET "role" = 'maintainer' WHERE "can_admin";--> statement-breakpoint
UPDATE "members" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint

-- Which contributor becomes part of which member: one each way. Dropped by 0020.
CREATE TABLE "_account_merge" (
  "contributor_id" text PRIMARY KEY,
  "member_id" text NOT NULL UNIQUE
);--> statement-breakpoint
INSERT INTO "_account_merge" ("contributor_id", "member_id")
SELECT c."id"::text, m."id"
FROM "contributors" c
JOIN "members" m ON m."email" = c."email"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "_account_merge" ("contributor_id", "member_id")
SELECT DISTINCT ON (m."id") c."id"::text, m."id"
FROM "contributors" c
JOIN "members" m ON m."email" = lower(c."notify_email")
WHERE m."id" NOT IN (SELECT "member_id" FROM "_account_merge")
  AND c."id"::text NOT IN (SELECT "contributor_id" FROM "_account_merge")
ORDER BY m."id", c."last_sign_in_at" DESC NULLS LAST, c."created_at"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- A merged member takes the contributor's GitHub link, profile and settings; what the member
-- already had (handle, bio, a public profile) wins.
UPDATE "members" m SET
  "profile_handle" = coalesce(m."profile_handle", c."handle"),
  "profile_bio" = coalesce(m."profile_bio", c."bio"),
  "about" = c."about",
  "links" = c."links",
  "accent" = c."accent",
  "banner" = c."banner",
  "avatar_url" = c."avatar_url",
  "public_profile" = m."public_profile" OR c."public",
  "on_wall" = c."on_wall",
  "github_id" = c."github_id",
  "github_login" = c."github_login",
  "notify_email" = c."notify_email",
  "pledge_accepted_at" = c."pledge_accepted_at",
  "suspended_at" = c."suspended_at",
  "suspended_reason" = c."suspended_reason",
  "suspended_by" = c."suspended_by",
  "last_sign_in_at" = c."last_sign_in_at",
  "notify_replies" = c."notify_replies",
  "notify_reminders" = c."notify_reminders"
FROM "_account_merge" x
JOIN "contributors" c ON c."id"::text = x."contributor_id"
WHERE m."id" = x."member_id";--> statement-breakpoint

-- Every other contributor becomes a member.
INSERT INTO "members" (
  "id", "display_name", "email", "role", "joined_on", "active", "profile_handle", "profile_bio",
  "about", "links", "accent", "banner", "avatar_url", "public_profile", "on_wall", "github_id",
  "github_login", "notify_email", "pledge_accepted_at", "suspended_at", "suspended_reason",
  "suspended_by", "last_sign_in_at", "notify_replies", "notify_reminders", "sessions_revoked_at",
  "created_at", "updated_at"
)
SELECT
  c."id"::text, c."display_name", c."email", 'member', c."created_at"::date, true, c."handle", c."bio",
  c."about", c."links", c."accent", c."banner", c."avatar_url", c."public", c."on_wall", c."github_id",
  c."github_login", c."notify_email", c."pledge_accepted_at", c."suspended_at", c."suspended_reason",
  c."suspended_by", c."last_sign_in_at", c."notify_replies", c."notify_reminders", c."sessions_revoked_at",
  c."created_at", c."updated_at"
FROM "contributors" c
WHERE c."id"::text NOT IN (SELECT "contributor_id" FROM "_account_merge");--> statement-breakpoint

-- Placeholders, so the merged contributors' rows still have a member to point at while 0019
-- changes the foreign keys. 0020 moves those rows and deletes these.
INSERT INTO "members" ("id", "display_name", "active", "profile_handle")
SELECT x."contributor_id", 'merged', false, '_merged-' || x."contributor_id"
FROM "_account_merge" x;--> statement-breakpoint

-- Every account gets a handle: a member without one takes their id, with a number if taken.
DO $$
DECLARE
  r record;
  h text;
  n int;
BEGIN
  FOR r IN SELECT "id" FROM "members" WHERE "profile_handle" IS NULL ORDER BY "created_at", "id" LOOP
    h := r."id";
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "members" WHERE "profile_handle" = h) LOOP
      n := n + 1;
      h := r."id" || '-' || n;
    END LOOP;
    UPDATE "members" SET "profile_handle" = h WHERE "id" = r."id";
  END LOOP;
END $$;
