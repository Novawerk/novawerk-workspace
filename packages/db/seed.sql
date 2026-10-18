-- First rows for a fresh database. Idempotent: safe to run more than once.
-- Apply after migrations:  psql "$DATABASE_URL" -f packages/db/seed.sql

insert into members (id, profile_handle, display_name, email, role, active)
values ('haodong', 'haodong', 'Haodong Ju', 'maintainer@example.com', 'maintainer', true)
on conflict (id) do nothing;
