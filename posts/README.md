# posts/ — posts written in the repo

A post can start in the admin panel (Posts → New post) or here, as a folder. Here you write it in
your editor with Claude Code (the `nw-posts` skill) or any other tool, for text and for pictures.
The folder is the source: when the pull request merges to `main`, the deploy workflow runs
`pnpm post sync` and the post appears in the admin panel **approved**: the pull request was the
review. A member still posts it by hand and presses **Mark as posted** there.

## A folder

```
posts/2026-10-18-open-day/
  post.yml     what it is and where it goes
  zh.md        the Chinese version (leave it out for an English-only post)
  en.md        the English version (leave it out for a Chinese-only post)
  poster.png   its own pictures, listed in post.yml
```

Name the folder `<date>-<what>`. `pnpm post new` makes one for you:

```bash
pnpm post new --name "Open day" --date 2026-10-18
pnpm post new --project berlin-food-map --kind progress --date 2026-10-19 --langs zh
```

### post.yml

```yaml
project: berlin-food-map   # the project's slug; leave it out for a post about Novawerk itself
kind: custom               # custom, or a lifecycle moment: kickoff, progress, behind_the_scenes,
                           # launch, ten_day, retro (those need a project)
name: Open day             # custom posts: what it is, for the board
week: 4                    # progress posts: which week of building
day: 30                    # retro: days after launch (30, 90)
date: 2026-10-18           # the day it goes out
platforms: [xiaohongshu, linkedin, discord]   # optional; default: the kind's usual platforms
                           # xiaohongshu, linkedin, discord, newsletter, blog, github
card: true                 # the template card goes first (default). false: only its own pictures
photo: photo.jpg           # optional: the photo on the card (a PNG, JPEG or GIF here, or the
                           # project's cover/gallery link)
images:                    # optional: its own pictures, after the card, in this order (up to 18)
  - poster.png
  - file: poster-zh.png
    alt: The open day poster
    lang: zh               # only in the Chinese version
  - url: https://…         # a picture that is already public
draft: true                # optional: land "to review" instead of approved
id: 3f0c…                  # set by `pnpm post pull`: this folder updates that post
```

### zh.md / en.md

The title and the card in frontmatter, then the text as it goes into the platform's composer
(plain text, not Markdown):

```markdown
---
title: 来工作坊坐坐：10 月开放日
card:
  eyebrow: Novawerk 开放日
  headline: 来工作坊坐坐
  lede: 10 月 18 日下午，看看我们正在做的东西，带上你的愿望。
  points:
    - 14:00–18:00 · Kreuzberg
  quote: { text: "", by: "" }
  stats: ["3 | 个项目"]
  footer: 不用报名，直接来
---

10 月 18 日下午，我们开放工作坊。
…
```

Every card field may be empty; the template leaves it out. Each kind has its own card (Posts →
Templates in the admin panel). Put a line break in `headline` or `quote.text` (`"来工作坊\n坐坐"`)
to choose where it breaks; otherwise the card sizes it and never leaves one character alone on a line. Two native versions, not
translations: Xiaohongshu titles stop at 20 characters, LinkedIn readers dislike marketing tone.

Xiaohongshu throttles a note that shows a web address or sends people off the platform
(`videos/BRAND.md`). When a post goes there, `zh.md` carries no link and no email, card
included; say who we are, what's next, or ask people to comment. `pnpm post check` refuses one.
The 3:4 card prints no address either. `en.md` may keep its links.

## The commands

```bash
pnpm post new …                      # make a folder (above)
pnpm post render <folder>            # the card as PNG in <folder>/.render/ (all sizes; --lang, --format)
pnpm post check [<folder>…]          # what is wrong, file by file; CI runs it on every pull request
pnpm post list                       # every folder and whether it checks out
pnpm post pull "<link>"              # a post from the admin panel (… → Continue in the repo)
pnpm post sync --local               # into your local database, to see it in the local admin panel
```

`check` fails on placeholders (【待补充：…】 / [To fill in: …]) unless the post has `draft: true`,
because a merged post is approved. It warns about titles and texts over a platform's limit.

## What the sync does

- A new folder creates a post; a changed folder (any file) rewrites it and approves it again.
  An unchanged folder is left alone, so edits made in the admin panel to marking it posted stay.
- A lifecycle post written here takes over the one the schedule planned (same project, kind,
  week or day).
- A post already marked posted keeps the text it went out with.
- A folder that is gone skips its post (restore it in the admin panel if that was a mistake).
  Once a post is out, you may delete its folder to keep the repo small: published posts stay.
- Pictures go to the public file store under `posts/<folder>/`, named by their content. Keep
  them small: compress before you commit (10 MB at most each).

`_`-folders (like `_example/`) are never synced. Decision: NB-ADR-0009.
