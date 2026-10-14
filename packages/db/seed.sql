-- First rows for a fresh database. Idempotent: safe to run more than once.
-- Apply after migrations:  psql "$DATABASE_URL" -f packages/db/seed.sql

insert into members (id, display_name, email, can_admin, active)
values ('haodong', 'Haodong Ju', 'juhaodong@gmail.com', true, true)
on conflict (id) do nothing;
