---
name: nw-posts
description: Write a Novawerk post in the repo (posts/<folder>/ — post.yml, zh.md, en.md, pictures) for Xiaohongshu, LinkedIn, Discord, the newsletter, the blog or GitHub, then render its card, check it and open a pull request; merging syncs it to the admin panel as approved. Use when asked to write, draft, revise or pull a post, an announcement, a launch/progress/kickoff post, a call for builders, an open day, a thank-you, or "something for Xiaohongshu/LinkedIn", in either language.
---

# Writing a Novawerk post in the repo

A post is a folder under `posts/`. The folder is the source: when its pull request merges, the
deploy workflow runs `pnpm post sync` and the post shows up in the admin panel **approved**, so
what you write must be ready to go out. A member then posts it by hand. Read `posts/README.md`
for the full format; this is the workflow.

## 1. Know what it is

Ask (or find in the request) before you write: which project (or Novawerk itself), which kind,
the date, the languages, the platforms, and **the facts**: what happened, who did it, real
quotes, real numbers, links, the date and place. Never invent names, numbers, quotes, dates or
links. If a fact is missing, ask; if the person wants a draft anyway, write a placeholder
(【待补充：…】 / [To fill in: …]) and set `draft: true` in post.yml so it lands "to review".

Kinds: `custom` (anything: an open day, a call for builders, a thank-you, a round-up; needs a
`name`) or a lifecycle moment that needs a `project`: `kickoff`, `progress` (`week:`),
`behind_the_scenes`, `launch`, `ten_day`, `retro` (`day:`).

## 2. Read before you write

- `knowledge/brand/voice.md`: short sentences, "we", present tense. No leverage / ecosystem /
  stakeholders / synergy / disrupt / transform; in Chinese no 赋能 / 生态 / 颠覆 / 抓手 / 闭环.
- `knowledge/community/promotion/post-templates.md`: the fields each lifecycle post carries.
- `knowledge/community/promotion/README.md`: which platform gets which language and why.
- A project's facts (its description, team, deliverables) live in the database, not in the
  repo: ask for them, or `pnpm post pull` one of its posts from the admin panel.
- Earlier posts in `posts/` for tone and continuity.

## 3. Make the folder and write it

```bash
pnpm post new --name "Open day" --date 2026-10-18                      # custom, Novawerk itself
pnpm post new --project berlin-food-map --kind progress --date 2026-10-19 --langs zh
pnpm post pull "<link from the admin panel: … → Continue in the repo>"  # continue an existing post
```

Then edit `post.yml`, `zh.md`, `en.md`:

- **Two native versions, not translations.** `zh` for Xiaohongshu and Discord #cn: personal,
  everyday Chinese, title at most 20 characters, text at most ~900 characters, short paragraphs,
  a few emoji at most. `en` for LinkedIn, Discord #en, GitHub: restrained, no marketing tone,
  title at most 70 characters, text at most ~1300 characters. Keep "wish" / "wished by" in English.
- **Xiaohongshu: no address, no off-platform CTA.** If the post goes to Xiaohongshu, `zh.md` (text,
  title and card) has no URL and no email, and doesn't send people elsewhere (官网, 私信加群,
  Discord); Xiaohongshu throttles notes that do (`videos/BRAND.md`). Say who we are or what's next,
  or ask people to comment. `pnpm post check` refuses a link there; `en.md` may keep its links.
- **Xiaohongshu: nothing that reads as recruiting.** No 招募 / 加入 / 成为成员 / 缺技术 / 找合伙人,
  no list of roles wanted, no 报酬 / 股份 / 薪资 / token, and don't put Europe / Germany / Berlin
  next to work or roles: Xiaohongshu flagged a Novawerk note as 境外招工 for exactly that. Share
  what was built and how; a call for builders goes to LinkedIn, Discord or GitHub instead.
- **The card** (frontmatter `card:`) is short: headline ≤ 24 Chinese / 48 English characters,
  lede ≤ 60 / 110, up to 4 points ≤ 28 / 60. Leave fields empty when the kind doesn't use them.
  Quotes and numbers on the card only if they are real. Each kind has its own card design
  (`CARD_DESIGNS` / `POST_TEMPLATES` in packages/contracts): points read best as `label: value`
  ("首个交付：20 家店 · Yu"), credits as `role — name`, progress lines starting with 完成 / Done or
  下一个 / Next. A `\n` in a headline or quote sets the line break; use it where the meaning
  breaks ("来工作坊\n坐坐").
- **Pictures**: real photos and screenshots first. You may make a picture with another tool
  (an image model, Figma); follow `knowledge/community/promotion/visual-assets.md` and never draw
  the Nova Star with a model: the template card already carries it. Put files in the folder, list
  them under `images:` (with `lang:` when a picture has text in one language), keep each under
  10 MB and compress them. `card: false` drops the template card.

## 4. Look, check, ship

```bash
pnpm post render posts/<folder>          # writes posts/<folder>/.render/<lang>-<format>.png
pnpm post check posts/<folder>
```

Open the rendered PNGs (Read them) and look: does the headline fit, is anything cut, does the
photo sit well? Fix and render again. `check` must pass with no errors (CI runs it too). Then
commit the folder and open a pull request; its review is the approval. To see it in the local
admin panel first: `pnpm post sync --local` with the local API running.

## Don'ts

- Don't merge a post with placeholders unless it has `draft: true`.
- Don't rename a folder of a post that is already synced unless post.yml has its `id:` (from
  `pnpm post pull`); otherwise the sync makes a new post and skips the old one.
- Don't edit a post that was marked posted: the record keeps what went out.
- Nothing here publishes. Posting stays a member's job in the admin panel.
