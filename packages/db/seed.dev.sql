-- Local development data. Never run against production.
-- Apply with `pnpm db:seed:dev` after `pnpm db:migrate`. Idempotent. Besides the two real projects
-- it adds a demo lifecycle (fictional people and progress) so every board column has cards.

\i /seed/seed.sql

insert into projects (slug, title, tagline, description, status, year, link, featured, sort_order)
values
  ('berlin-food-map', 'Berlin Chinese Food Map',
   'A community-curated guide to eating well in Berlin.',
   'An open, non-profit digital guide to Chinese restaurants in Berlin — built and edited by the people who actually eat there.',
   'building', 2026, 'https://berlinfoodmap.novawerk.io/', true, 10),
  ('yima-app', 'YIMA',
   'Privacy-first period calendar.',
   'A small tool, designed without profit as a constraint — to see whether the experience can become good again.',
   'launched', 2026, 'https://novawerk.github.io/YIMA/', true, 20)
on conflict (slug) do nothing;

-- ─── Demo lifecycle: projects at every stage, with pitches, teams, deliverables and posts ──
-- Fictional people (example.com) and made-up progress, so the Projects and Posts boards have
-- something on every column. Dates are relative to today. Safe to re-run.

insert into members (id, display_name, email, can_admin, joined_on, active)
values
  ('mara', 'Mara Lindqvist', 'mara@example.com', false, current_date - 300, true),
  ('jonas', 'Jonas Weber', 'jonas@example.com', false, current_date - 260, true),
  ('aiko', 'Aiko Tanaka', 'aiko@example.com', false, current_date - 200, true),
  ('lin', 'Lin Chen', 'lin@example.com', false, current_date - 90, true),
  ('yu', 'Yu Wang', 'yu@example.com', false, current_date - 150, true)
on conflict (id) do nothing;

-- Pitches: one new, one under discussion, one declined, two accepted (they became projects).
insert into project_submissions
  (id, name, email, project_name, product, user_journey, references_and_innovation, team, timeline,
   consent_at, ai_summary, status, reviewer_id, created_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'Tobias Krämer', 'tobias@example.com', 'Repair café calendar',
   'One calendar for every repair café in Berlin, with what each one can fix.',
   'Someone with a broken toaster finds the nearest repair café that fixes small appliances this week.',
   'Today the dates live on ten different websites and Facebook pages.',
   'Tobias, who runs a repair café in Neukölln, and a friend who builds websites.',
   'A first list in a month; the calendar by spring.',
   now() - interval '1 day',
   'Tobias runs a repair café and wants one shared calendar for all of Berlin. Clear need, small first step. Open question: who keeps the dates up to date?',
   'new', null, now() - interval '1 day'),
  ('a1000000-0000-4000-8000-000000000002', 'Wei Zhang', 'wei@example.com', '爱看车 AI car-buying helper',
   'An assistant that reads used-car listings and flags the ones worth a test drive.',
   'A first-time buyer pastes ten listings and gets three to look at, with reasons.',
   'Car portals rank by ads; nobody explains the trade-offs in plain words.',
   'Wei (data analyst) and one friend who repairs cars.',
   'Prototype in two months.',
   now() - interval '6 days',
   'Wei wants an honest helper for buying a used car. Interesting, but close to a commercial product; we should talk about what keeps it non-profit.',
   'discussing', 'haodong', now() - interval '6 days'),
  ('a1000000-0000-4000-8000-000000000003', 'Sam Hofer', 'sam@example.com', 'Cheapest chicken breast nearby',
   'A price map for chicken breast in nearby supermarkets.',
   'Open the app, see the cheapest price within 2 km.',
   'Price apps exist but cover few shops.',
   'Just Sam.',
   'A weekend.',
   now() - interval '20 days',
   'A narrow price comparison. Fun, but it needs scraping supermarket prices, which is fragile and legally unclear.',
   'declined', 'haodong', now() - interval '20 days'),
  ('a1000000-0000-4000-8000-000000000004', 'Lin Chen', 'lin@example.com', '血压记录 BP Log',
   'A simple log and reminder for people who measure their blood pressure at home.',
   'My mother measures twice a day; the app reminds her and shows the doctor a clean chart.',
   'Health apps are full of ads and upsells; older people get lost in them.',
   'Lin, plus her cousin who is a nurse.',
   'A first version in three months.',
   now() - interval '3 days',
   'A small, clear tool for a real person. Lin is already a member. Good fit.',
   'accepted', 'haodong', now() - interval '3 days'),
  ('a1000000-0000-4000-8000-000000000005', 'Mara Lindqvist', 'mara@example.com', '德国华人故事 Chinese stories in Germany',
   'Short interviews with Chinese people who made a life in Germany, in their own words.',
   'Readers find a story like theirs and a name they can write to.',
   'Media stories are about statistics, not people.',
   'Mara (journalist) and Yu (researcher).',
   'Five stories by winter.',
   now() - interval '22 days',
   'A storytelling project with a clear format. Needs consent and editing rules before the first interview.',
   'accepted', 'haodong', now() - interval '22 days')
on conflict (id) do nothing;

-- Projects at each stage.
insert into projects (id, slug, title, tagline, description, status, year, featured, sort_order, launch_date, submission_id)
values
  ('b1000000-0000-4000-8000-000000000001', 'bp-log', '血压记录 BP Log', 'A blood pressure log for home.',
   'Reminders and a clean chart for people who measure their blood pressure at home.',
   'draft', 2026, false, 60, null, 'a1000000-0000-4000-8000-000000000004'),
  ('b1000000-0000-4000-8000-000000000002', 'chinese-stories-de', '德国华人故事', 'Chinese stories in Germany, in their own words.',
   'Short interviews with Chinese people who made a life in Germany.',
   'planning', 2026, false, 50, null, 'a1000000-0000-4000-8000-000000000005'),
  ('b1000000-0000-4000-8000-000000000003', 'quiet-desk', 'Quiet Desk', 'Find a not-so-busy place to work.',
   'Cafés and libraries in Berlin where you can work in peace, kept up to date by the people who sit there.',
   'launching', 2026, true, 30, current_date + 6, null),
  ('b1000000-0000-4000-8000-000000000004', 'open-transit-board', 'Open Transit Board', 'Departure boards for any screen.',
   'An open-source departure board for cafés, shops and hallways, fed by public transit data.',
   'launched', 2026, false, 40, current_date - 12, null),
  ('b1000000-0000-4000-8000-000000000005', 'kiez-tool-library', 'Kiez Tool Library', 'Borrow a drill from your neighbours.',
   'A shared tool shelf for one street. Paused when the shop that hosted it closed.',
   'archived', 2025, false, 90, null, null)
on conflict (id) do nothing;

update project_submissions set status = 'accepted'
where id in ('a1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000005');

insert into project_members (project_id, member_id, role)
select p.id, m.member_id, m.role
from (values
  ('berlin-food-map', 'haodong', 'Initiator'), ('berlin-food-map', 'yu', 'Developer'), ('berlin-food-map', 'lin', 'Content'),
  ('bp-log', 'lin', 'Initiator'),
  ('chinese-stories-de', 'mara', 'Initiator'), ('chinese-stories-de', 'yu', 'Researcher'),
  ('quiet-desk', 'jonas', 'Initiator'), ('quiet-desk', 'aiko', 'Design'), ('quiet-desk', 'haodong', 'Developer'),
  ('open-transit-board', 'aiko', 'Initiator'), ('open-transit-board', 'jonas', 'Developer'),
  ('kiez-tool-library', 'mara', 'Initiator')
) as m(slug, member_id, role)
join projects p on p.slug = m.slug
on conflict do nothing;

-- Each project's timeline, written once (skipped for projects that already have one).
insert into project_status_changes (project_id, from_status, to_status, changed_by, changed_at)
select p.id, h.from_status::project_status, h.to_status::project_status, h.changed_by, now() - make_interval(days => h.days_ago)
from (values
  ('berlin-food-map', null, 'planning', 'haodong', 60), ('berlin-food-map', 'planning', 'building', 'haodong', 30),
  ('bp-log', null, 'draft', 'haodong', 3),
  ('chinese-stories-de', null, 'draft', 'haodong', 20), ('chinese-stories-de', 'draft', 'planning', 'mara', 12),
  ('quiet-desk', null, 'draft', 'jonas', 70), ('quiet-desk', 'draft', 'planning', 'jonas', 60),
  ('quiet-desk', 'planning', 'building', 'jonas', 45), ('quiet-desk', 'building', 'launching', 'jonas', 8),
  ('open-transit-board', null, 'draft', 'aiko', 120), ('open-transit-board', 'draft', 'planning', 'aiko', 100),
  ('open-transit-board', 'planning', 'building', 'aiko', 80), ('open-transit-board', 'building', 'launching', 'aiko', 25),
  ('open-transit-board', 'launching', 'launched', 'aiko', 12),
  ('kiez-tool-library', null, 'draft', 'mara', 400), ('kiez-tool-library', 'draft', 'building', 'mara', 380),
  ('kiez-tool-library', 'building', 'archived', 'mara', 30)
) as h(slug, from_status, to_status, changed_by, days_ago)
join projects p on p.slug = h.slug
where not exists (select 1 from project_status_changes c where c.project_id = p.id);

insert into project_deliverables (id, project_id, title, owner_id, done_when, due_on, done_on)
select d.id::uuid, p.id, d.title, d.owner_id, d.done_when, current_date + d.due_in, case when d.done_ago is null then null else current_date - d.done_ago end
from (values
  ('c1000000-0000-4000-8000-000000000001', 'berlin-food-map', 'Seed list of 20 restaurants', 'yu', 'Public on Notion, one line per place', -22, 24),
  ('c1000000-0000-4000-8000-000000000002', 'berlin-food-map', 'Map front end prototype', 'haodong', 'Clickable on a phone', 5, null),
  ('c1000000-0000-4000-8000-000000000003', 'berlin-food-map', 'Review tags (up to 5 per place)', 'lin', 'All 60 places tagged', 19, null),
  ('c1000000-0000-4000-8000-000000000004', 'chinese-stories-de', 'Interview guide and consent form', 'yu', 'Reviewed by two members', 3, null),
  ('c1000000-0000-4000-8000-000000000005', 'chinese-stories-de', 'Five people who said yes', 'mara', 'Dates in the calendar', 10, null),
  ('c1000000-0000-4000-8000-000000000006', 'quiet-desk', 'List of 30 quiet places', 'aiko', 'Each with opening hours and a photo', -12, 10),
  ('c1000000-0000-4000-8000-000000000007', 'quiet-desk', 'Public beta', 'jonas', 'Anyone can open it without an invite', 6, null),
  ('c1000000-0000-4000-8000-000000000008', 'open-transit-board', 'v1.0 on GitHub', 'jonas', 'Tagged release with install guide', -12, 12),
  ('c1000000-0000-4000-8000-000000000009', 'open-transit-board', 'Board in three cafés', 'aiko', 'Running for a week without help', 9, null)
) as d(id, slug, title, owner_id, done_when, due_in, done_ago)
join projects p on p.slug = d.slug
on conflict do nothing;
insert into posts (id, project_id, kind, seq, due_on, status, brief, content, drafted_at, approved_by, approved_at, published_at)
select 'd1000000-0000-4000-8000-000000000001', id, 'kickoff', 0, current_date + -30, 'published', null, '{"zh": {"title": "又有人许愿了：柏林中餐地图", "body": "在柏林想吃口靠谱的中餐，每次都要在朋友圈问一圈。\n\n我们想做一份由真实吃过的人维护的地图。\n\n许愿人：Haodong\n首个交付：20 家店的种子清单 · Yu\n\n招募：1 位写过 Next.js 的 Builder，2–3 位住在柏林的 Supporter。\n\n——\nNovawerk 是一个非盈利社区，我们一起把愿望做成真的东西。", "card": {"eyebrow": "Novawerk 又有人许愿了", "headline": "柏林中餐地图", "lede": "在柏林想吃口靠谱的中餐，不用每次都在朋友圈问一圈。", "points": ["首个交付：20 家店的种子清单 · Yu", "招募 1 位 Builder：写过 Next.js"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "许愿人 Haodong"}}, "en": {"title": "Someone wished for it: Berlin Chinese Food Map", "body": "Finding decent Chinese food in Berlin should not take a group chat every weekend. We are building a map kept by the people who eat there.\n\nWished by: Haodong\nFirst deliverable: a seed list of 20 places, by Yu.\n\nWe are looking for one Builder who has shipped Next.js.", "card": {"eyebrow": "Someone wished for it", "headline": "Berlin Chinese Food Map", "lede": "A map of Chinese restaurants in Berlin, kept by the people who eat there.", "points": ["First deliverable: 20 places · Yu", "Looking for a Builder who has shipped Next.js"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "Wished by Haodong"}}}'::jsonb, now() - interval '30 days', 'haodong', now() - interval '29 days', now() - interval '29 days'
from projects where slug = 'berlin-food-map'
on conflict do nothing;
insert into posts (id, project_id, kind, seq, due_on, status, brief, content, drafted_at, approved_by, approved_at, published_at)
select 'd1000000-0000-4000-8000-000000000002', id, 'progress', 4, current_date + -2, 'drafted', 'Yu finished the seed list. Lin joined to review the notes.', '{"zh": {"title": "柏林中餐地图 · 第 4 周", "body": "完成：20 家店的种子清单（Yu 交付）\n新加入：欢迎 Lin，之后负责评价审核\n\n这周的小困难：【待补充：这周遇到的一个小困难或小决定】\n\n下一个交付：地图前端原型 · Haodong · 5 天后", "card": {"eyebrow": "第 4 周进展", "headline": "柏林中餐地图", "lede": "【待补充：这周的小故事，一句话】", "points": ["完成：20 家店的种子清单 · Yu", "下一个：地图前端原型 · Haodong"], "quote": {"text": "", "by": ""}, "stats": [], "footer": ""}}, "en": {"title": "Berlin Chinese Food Map · week 4", "body": "Done: the seed list of 20 places (Yu).\nJoined: Lin, who reviews the notes.\nNext: a clickable map prototype (Haodong).", "card": {"eyebrow": "Week 4", "headline": "Berlin Chinese Food Map", "lede": "", "points": ["Done: 20 places · Yu", "Next: map prototype · Haodong"], "quote": {"text": "", "by": ""}, "stats": [], "footer": ""}}}'::jsonb, now() - interval '1 days', null, null, null
from projects where slug = 'berlin-food-map'
on conflict do nothing;
insert into posts (id, project_id, kind, seq, due_on, status, brief, content, drafted_at, approved_by, approved_at, published_at)
select 'd1000000-0000-4000-8000-000000000003', id, 'kickoff', 0, current_date + -45, 'published', null, '{"zh": {"title": "又有人许愿了：Quiet Desk", "body": "想找个安静的地方写东西，结果每家咖啡馆都坐满了。\n\n我们想做一份清单：柏林哪些咖啡馆和图书馆，在什么时间能安静地坐下来工作。\n\n许愿人：Jonas\n首个交付：30 个安静的地方 · Aiko", "card": {"eyebrow": "Novawerk 又有人许愿了", "headline": "Quiet Desk", "lede": "柏林哪里能安静地坐下来工作？", "points": ["首个交付：30 个地方 · Aiko", "招募：住在柏林、愿意写两句的人"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "许愿人 Jonas"}}, "en": {"title": "Someone wished for it: Quiet Desk", "body": "Every café was full when Jonas needed a quiet hour to write. We are making a list of places in Berlin where you can work in peace, and when.\n\nWished by: Jonas\nFirst deliverable: 30 quiet places, by Aiko.", "card": {"eyebrow": "Someone wished for it", "headline": "Quiet Desk", "lede": "Where in Berlin can you work in peace?", "points": ["First deliverable: 30 places · Aiko"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "Wished by Jonas"}}}'::jsonb, now() - interval '45 days', 'jonas', now() - interval '44 days', now() - interval '44 days'
from projects where slug = 'quiet-desk'
on conflict do nothing;
insert into posts (id, project_id, kind, seq, due_on, status, brief, content, drafted_at, approved_by, approved_at, published_at)
select 'd1000000-0000-4000-8000-000000000004', id, 'behind_the_scenes', 0, current_date + -4, 'approved', 'We almost added live occupancy from Google, then chose people''s own notes: it is honest and needs no tracking.', '{"zh": {"title": "Quiet Desk 上线之前", "body": "我们差点接 Google 的实时人流数据，后来选了大家自己写的备注：更真实，也不用追踪任何人。\n\n制作团队：\n· 设计 —— Aiko\n· 工程 —— Haodong\n· 许愿人 —— Jonas\n\n6 天后上线。", "card": {"eyebrow": "上线之前", "headline": "Quiet Desk", "lede": "我们没用实时人流数据，选了大家自己写的备注。", "points": ["设计 —— Aiko", "工程 —— Haodong", "许愿人 —— Jonas"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "6 天后上线"}}, "en": {"title": "Before Quiet Desk launches", "body": "We almost used live occupancy data from Google. We chose people''s own notes instead: more honest, and nobody gets tracked.\n\nBuilt by Aiko (design), Haodong (engineering) and Jonas, who wished for it.\n\nIt launches in six days.", "card": {"eyebrow": "Before launch", "headline": "Quiet Desk", "lede": "No live tracking. People''s own notes instead.", "points": ["Design — Aiko", "Engineering — Haodong", "Wished by — Jonas"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "Launches in 6 days"}}}'::jsonb, now() - interval '5 days', 'jonas', now() - interval '4 days', null
from projects where slug = 'quiet-desk'
on conflict do nothing;
insert into posts (id, project_id, kind, seq, due_on, status, brief, content, drafted_at, approved_by, approved_at, published_at)
select 'd1000000-0000-4000-8000-000000000005', id, 'launch', 0, current_date + 6, 'planned', 'Launch on the date. Link: quietdesk.example.com (placeholder until the domain is set).', null, null, null, null, null
from projects where slug = 'quiet-desk'
on conflict do nothing;
insert into posts (id, project_id, kind, seq, due_on, status, brief, content, drafted_at, approved_by, approved_at, published_at)
select 'd1000000-0000-4000-8000-000000000006', id, 'launch', 0, current_date + -12, 'published', null, '{"zh": {"title": "Novawerk 新项目上线 · Open Transit Board", "body": "任何一块屏幕都能变成公交到站牌。\n\n咖啡馆、小店、楼道，装上就能显示附近的车次。开源、免费、不收集任何数据。\n\n制作团队：Aiko · Jonas\n\n下一个就是你：novawerk.io/submit", "card": {"eyebrow": "Novawerk 新项目上线", "headline": "Open Transit Board", "lede": "任何一块屏幕都能变成公交到站牌。", "points": ["咖啡馆、小店、楼道都能用", "开源、免费", "不收集任何数据"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "github.com/novawerk/open-transit-board"}}, "en": {"title": "New from Novawerk: Open Transit Board", "body": "Any screen can be a departure board. Cafés, shops and hallways can show the next trams and buses nearby. Open source, free, and it collects no data.\n\nBuilt by Aiko and Jonas.\n\nYou could be next: novawerk.io/submit", "card": {"eyebrow": "New from Novawerk", "headline": "Open Transit Board", "lede": "Any screen can be a departure board.", "points": ["For cafés, shops and hallways", "Open source and free", "Collects no data"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "github.com/novawerk/open-transit-board"}}}'::jsonb, now() - interval '13 days', 'aiko', now() - interval '12 days', now() - interval '12 days'
from projects where slug = 'open-transit-board'
on conflict do nothing;
insert into posts (id, project_id, kind, seq, due_on, status, brief, content, drafted_at, approved_by, approved_at, published_at)
select 'd1000000-0000-4000-8000-000000000007', id, 'ten_day', 0, current_date + -2, 'drafted', 'Three cafés run it. 41 GitHub stars.', '{"zh": {"title": "Open Transit Board 上线十天", "body": "上线十天，三家咖啡馆在用，GitHub 上 41 颗星。\n\n我们听到的：【待补充：两三条真实反馈】\n\n已经改了：夜间模式（第 4 天）。\n准备改：支持 S-Bahn 延误提示。", "card": {"eyebrow": "上线十天", "headline": "Open Transit Board", "lede": "已经加了夜间模式。", "points": [], "quote": {"text": "【待补充：一条真实反馈】", "by": "【待补充：谁说的】"}, "stats": [{"value": "3", "label": "家咖啡馆在用"}, {"value": "41", "label": "GitHub stars"}], "footer": ""}}, "en": {"title": "Open Transit Board, ten days in", "body": "Ten days in: three cafés run it, 41 stars on GitHub.\n\nWhat we heard: [To fill in: two or three real quotes]\n\nAlready changed: a night mode (day 4). Next: S-Bahn delay notes.", "card": {"eyebrow": "Ten days in", "headline": "Open Transit Board", "lede": "We added a night mode.", "points": [], "quote": {"text": "[To fill in: one real quote]", "by": "[To fill in: who said it]"}, "stats": [{"value": "3", "label": "cafés run it"}, {"value": "41", "label": "GitHub stars"}], "footer": ""}}}'::jsonb, now() - interval '1 days', null, null, null
from projects where slug = 'open-transit-board'
on conflict do nothing;
-- Posts beyond the lifecycle: one about Novawerk itself (no project, its own platforms), one for a
-- project in Chinese only and without the template card.
insert into posts (id, project_id, kind, label, seq, due_on, status, langs, platforms, with_card, brief, content, drafted_at)
values ('d1000000-0000-4000-8000-000000000008', null, 'custom', 'Call for builders', 1, current_date + 3, 'drafted', '{zh,en}', '{xiaohongshu,linkedin,discord}', true, 'Two builders who have shipped a web app, 3–5 hours a week.', '{"zh": {"title": "一起来做：我们在找两位 Builder", "body": "我们是 Novawerk，柏林的一个非营利社区。有人带着愿望来，我们一起把它做成真的、能用的东西。\n\n现在我们在找两位 Builder：做过一个上线的 Web 应用，每周能拿出几个小时。\n\n想一起做，就来 novawerk.io/join 说说你自己。", "card": {"eyebrow": "Novawerk 招募", "headline": "一起来做", "lede": "两位 Builder，每周几个小时，一个真的会上线的项目。", "points": ["做过一个上线的 Web 应用", "每周 3–5 小时", "在柏林或远程"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "novawerk.io/join"}}, "en": {"title": "Build with us", "body": "Novawerk is a non-profit community in Berlin. People bring a wish, and we build it together into a real, working thing.\n\nWe are looking for two builders who have shipped a web app and can give a few hours a week.\n\nTell us about yourself at novawerk.io/join.", "card": {"eyebrow": "Call for builders", "headline": "Build with us", "lede": "Two builders, a few hours a week, one project that ships.", "points": ["You have shipped a web app", "3–5 hours a week", "In Berlin or remote"], "quote": {"text": "", "by": ""}, "stats": [], "footer": "novawerk.io/join"}}}'::jsonb, now() - interval '2 hours')
on conflict do nothing;
insert into posts (id, project_id, kind, label, seq, due_on, status, langs, platforms, with_card, brief, content)
select 'd1000000-0000-4000-8000-000000000009', id, 'custom', 'Tasting evening', 1, current_date + 9, 'planned', '{zh}', '{xiaohongshu}', false, 'Ten of us try five places from the map in one evening. Photos from the night go here.', null
from projects where slug = 'berlin-food-map'
on conflict do nothing;


-- ─── Contributor task board: open tasks about our own software ──────────────
-- Real work on this repo, so the board and the API have something to show. Two demo contributors
-- (fictional, example.com): Lena with a public profile and one merged task, Mira who signed in by
-- email and has no GitHub yet. Task numbers are fixed so links like /tasks/NW-3 stay stable.

insert into contributors (id, handle, display_name, bio, public, github_id, github_login, email, created_at)
values
  ('c1000000-0000-4000-8000-000000000001', 'lena-k', 'Lena Krause', 'Frontend, accessibility, small fixes.', true,
   90000001, 'lena-k', null, now() - interval '40 days'),
  ('c1000000-0000-4000-8000-000000000002', 'mira', 'Mira', null, false,
   null, null, 'mira@example.com', now() - interval '3 days')
on conflict do nothing;

insert into tasks (id, kind, title, summary, body, criteria, area, size, skills, status, assignee_id, assigned_at,
                   pr_url, suggested_by, "where", accepted_at, done_at, created_at, updated_at)
overriding system value
values
  (1, 'task', 'Add /.well-known/security.txt to the website',
   'Tell security researchers where to write, in the standard place.',
   'People who find a security problem look for `/.well-known/security.txt` (RFC 9116). We have none. Add it to `apps/web` as a static file with a contact and an expiry date, and link it from the footer of `/privacy`.',
   '["GET /.well-known/security.txt answers 200 with Contact and Expires", "Expires is less than a year ahead", "The privacy page links to it"]',
   'web', 'S', '{nextjs}', 'open', null, null, null, null, null, null, null, now() - interval '9 days', now() - interval '9 days'),
  (2, 'task', 'Paginate the admin lists',
   'Inbox, outbox and subscribers load every row at once.',
   'The admin routes for submissions, applications, the outbox and newsletter subscribers return every row. Add cursor pagination in the API (newest first) and a "Load more" button in `apps/admin`, the way `GET /public/tasks` pages.',
   '["Each list loads 50 rows and a cursor", "Load more appends the next page", "API tests cover the last page and a bad cursor"]',
   'api', 'M', '{hono,drizzle,react}', 'open', null, null, null, null, null, null, null, now() - interval '7 days', now() - interval '2 days'),
  (3, 'task', 'Move the public rate limits to Postgres',
   'Today each serverless instance counts on its own.',
   '`FixedWindowLimiter` in `apps/api/src/intake-chat/rate-limit.ts` lives in memory, so the real limit is "N per warm instance". Store the windows in Postgres (one small table, cleaned up by a cron route) and keep the same interface.',
   '["The CV ticket, newsletter and chat limits hold across instances", "A cron route deletes old windows, like /cron/sign-in-cleanup", "Schema change with a generated migration"]',
   'api', 'L', '{postgres,drizzle}', 'open', null, null, null, null, null, null, null, now() - interval '6 days', now() - interval '6 days'),
  (4, 'task', 'Write agents/README.md: running an agent offline',
   'Newcomers don''t know every agent runs without secrets.',
   'Every agent has `dryRunServices`: PGlite, a stubbed Claude and in-memory records. There is no `agents/README.md` yet. Write one: how `pnpm agent --list` and `pnpm agent <id> --dry-run` work, and what each fake does.',
   '["agents/README.md shows pnpm agent <id> --dry-run", "Each fake service is named once", "No secrets needed to follow it"]',
   'docs', 'S', '{markdown}', 'assigned', 'c1000000-0000-4000-8000-000000000001', now() - interval '2 days',
   null, null, null, null, null, now() - interval '5 days', now() - interval '2 days'),
  (5, 'task', 'Dark mode for the public site',
   'A light and a dark token set, following the visitor''s system setting.',
   'The prototype defines the dark tokens (lighter green #4cb07a on #0c0c0e). Add them to `apps/web` with `prefers-color-scheme`, check every page, and keep the green button fill #1f7a4a in both themes.',
   '["Every page reads well in both themes", "Contrast passes AA", "No flash of the wrong theme on load"]',
   'web', 'L', '{css,tailwind}', 'open', null, null, null, null, null, null, null, now() - interval '4 days', now() - interval '1 day'),
  (6, 'task', 'Show the post card''s size next to the download button',
   'Members can''t tell which format they are about to download.',
   'The post editor in `apps/admin` offers card downloads per format. Show the pixel size (for example 1080 × 1440) next to each button.',
   '["Each download button shows its size", "Sizes come from CARD_FORMATS in @nw/contracts"]',
   'admin', 'S', '{react}', 'done', 'c1000000-0000-4000-8000-000000000001', now() - interval '20 days',
   'https://github.com/Novawerk/novawerk-workspace/pull/4', null, null, null, now() - interval '14 days', now() - interval '25 days', now() - interval '14 days'),
  (7, 'bug', 'Status chips overflow on a phone',
   '', 'On /tasks on a 375 px wide phone the status chips run off the screen instead of scrolling sideways. Expected: one row that scrolls. Steps: open /tasks on a phone, look at the filters.',
   '[]', null, null, '{}', 'suggested', null, null, null, 'c1000000-0000-4000-8000-000000000002', 'site', null, null,
   now() - interval '1 day', now() - interval '1 day')
on conflict do nothing;

select setval(pg_get_serial_sequence('tasks', 'id'), greatest((select max(id) from tasks), 1));

insert into task_proposals (id, task_id, contributor_id, approach, testing, eta, created_at)
values ('c2000000-0000-4000-8000-000000000001', 2, 'c1000000-0000-4000-8000-000000000001',
        'Cursor pagination in the four admin routes, reusing the board''s cursor helper; a Load more button in each table.',
        'API tests for the first, middle and last page; I''ll click through the admin lists by hand.',
        'week', now() - interval '1 day')
on conflict do nothing;

insert into task_posts (id, task_id, author_contributor_id, body, created_at)
values ('c3000000-0000-4000-8000-000000000001', 5, 'c1000000-0000-4000-8000-000000000001',
        'Should the admin panel follow later, or only the public site?', now() - interval '20 hours')
on conflict do nothing;
insert into task_posts (id, task_id, parent_id, author_member_id, body, created_at)
select 'c3000000-0000-4000-8000-000000000002', 5, 'c3000000-0000-4000-8000-000000000001', 'mara',
       'Only the public site. The admin panel has its own theme already.', now() - interval '18 hours'
on conflict do nothing;

insert into task_events (task_id, kind, from_status, to_status, actor_member_id, actor_contributor_id, pr_url, note, created_at)
select * from (values
  (4, 'assigned', 'open'::task_status, 'assigned'::task_status, 'mara', null::uuid, null, null, now() - interval '2 days'),
  (6, 'assigned', 'open'::task_status, 'assigned'::task_status, 'mara', null::uuid, null, null, now() - interval '20 days'),
  (6, 'pr_linked', 'assigned'::task_status, 'in_review'::task_status, null, 'c1000000-0000-4000-8000-000000000001'::uuid,
   'https://github.com/Novawerk/novawerk-workspace/pull/4', null, now() - interval '16 days'),
  (6, 'merged', 'in_review'::task_status, 'done'::task_status, null, null::uuid,
   'https://github.com/Novawerk/novawerk-workspace/pull/4', null, now() - interval '14 days'),
  (7, 'suggested', null, 'suggested'::task_status, null, 'c1000000-0000-4000-8000-000000000002'::uuid, null, null, now() - interval '1 day')
) as e(task_id, kind, from_status, to_status, actor_member_id, actor_contributor_id, pr_url, note, created_at)
where not exists (select 1 from task_events);

insert into werk_ledger (contributor_id, delta, reason, task_id, pr, created_at)
values ('c1000000-0000-4000-8000-000000000001', 1, 'Merged NW-6: Show the post card''s size next to the download button', 6,
        'https://github.com/Novawerk/novawerk-workspace/pull/4', now() - interval '14 days')
on conflict do nothing;
