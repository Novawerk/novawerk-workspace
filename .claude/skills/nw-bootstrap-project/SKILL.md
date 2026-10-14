---
name: nw-bootstrap-project
description: Scaffold a new Novawerk portfolio project repo — README in Novawerk brand voice, CLAUDE.md wired to the nw-knowledge-base skill, MIT LICENSE (open by default), .gitignore, and a docs/ skeleton (problem-statement.md). Also installs the nw-knowledge-base skill into .claude/skills/. Use when the user says "bootstrap a Novawerk project", "scaffold a Novawerk repo", "start a new portfolio project", "init a Novawerk app/tool/site", or similar — and the working directory is empty or a fresh git init.
---

# Bootstrap a new Novawerk project

Stand up a starter repo that already speaks Novawerk: brand voice, the four-step process, open by default, and the [`nw-knowledge-base`](https://github.com/Novawerk/nw-knowledge-base) skill pre-installed so the next agent that opens the repo can answer canonical questions without re-reading the website.

## When to use this skill

Use when the user is starting a **new** Novawerk portfolio codebase (app, tool, research microsite, event site) and wants the scaffolding done. Cues:

- "bootstrap a Novawerk project / repo"
- "start a new portfolio project"
- "scaffold a Novawerk app/tool/site"
- "init a Novawerk repo"

Do **not** use this skill for:

- Adding a new entry to `projects/overview.md` in the knowledge base. That is a content edit, not a scaffold.
- Scaffolding inside `nw-web-portal` itself. That repo already exists.
- Any non-empty repo where these files would collide. Stop and ask first.

**Building an AI agent?** Don't scaffold from empty. Create the repo from the public agent starter
template instead — it already has a README, `CLAUDE.md`, MIT `LICENSE`, CI and a working agent
(see `knowledge/operations/agent-starter.md`):

```bash
gh repo create Novawerk/{{SLUG}} --template Novawerk/agent-starter --public --clone
```

Then rewrite its README intro in the Novawerk framing below, and add `docs/problem-statement.md`
(step 3) and the `nw-knowledge-base` skill (step 4) from this skill. Skip the other files.

## What it creates

```
.
├── README.md                          # one-liner, status, links to KB principles, how to contribute
├── CLAUDE.md                          # agent guide — points at the nw-knowledge-base skill
├── LICENSE                            # MIT
├── .gitignore                         # language-agnostic baseline
├── docs/
│   └── problem-statement.md           # step 01 (Validate), written down
└── .claude/
    └── skills/
        └── nw-knowledge-base/
            └── SKILL.md               # copied from Novawerk/nw-knowledge-base
```

## How to run it

### 1. Sanity-check the directory

Before writing anything:

- If the working directory is not empty and is not a fresh `git init`, ask the user before continuing. They may be in the wrong place.
- If `README.md` or `CLAUDE.md` already exists, stop and ask.

### 2. Gather inputs

One round of `AskUserQuestion`, four fields:

- **Project name** — Title Case. Examples: *YIMA*, *Berlin Chinese Food Map*.
- **Slug** — kebab-case. Used for the repo name and portfolio URL. Examples: `yima`, `berlin-chinese-food-map`.
- **One-liner** — one plain sentence. No marketing words. This is the line that will land in the projects overview table.
- **Category** — `App` / `Tool` / `Research` / `Event`.
- **Initial status** — `Planning` (default) / `Building` / `Launching`. New repos almost always start at `Planning`.

`{{YEAR}}` below is the current calendar year.

### 3. Write the files

Use the templates below verbatim, substituting `{{NAME}}`, `{{SLUG}}`, `{{ONELINER}}`, `{{CATEGORY}}`, `{{STATUS}}`, `{{YEAR}}`.

#### `README.md`

Brand voice rules: short sentences, "we" not "the team", present tense, no *leverage / ecosystem / stakeholders / synergy / disrupt / transform*.

```markdown
# {{NAME}}

> {{ONELINER}}

**Status:** {{STATUS}} · **Category:** {{CATEGORY}} · **Year:** {{YEAR}}

{{NAME}} is part of the [Novawerk](https://novawerk.io) portfolio. We build
in the open and we build for real.

## Where we are

Novawerk projects move through four steps — Validate, Break Down, Collaborate,
Build for Real — and loop through them many times. See
[how-we-work](https://github.com/Novawerk/nw-knowledge-base/blob/main/operations/how-we-work.md)
for the long version.

Right now, this project is **{{STATUS}}**:

- [`docs/problem-statement.md`](./docs/problem-statement.md) — what we're
  validating.

## How to contribute

We work open by default. To join:

1. Read the [three principles](https://github.com/Novawerk/nw-knowledge-base/tree/main/culture/principles).
2. Open an issue with what you'd like to take on — one artifact, one owner,
   one done-by date.
3. Say hi on the [community channels](https://github.com/Novawerk/nw-knowledge-base/blob/main/community/channels.md).

We assume good faith. We make it cheap to try.

## Licence

MIT — see [LICENSE](./LICENSE).
```

#### `CLAUDE.md`

```markdown
# Agent guide — {{NAME}}

This repo is part of the [Novawerk](https://novawerk.io) portfolio. When you
need canonical facts about Novawerk (tagline, mission, the three principles,
brand voice, how-we-work, open-by-default, ways to join, titles and roles,
community), use the [`nw-knowledge-base`](./.claude/skills/nw-knowledge-base/SKILL.md)
skill already installed in this repo. Do not invent Novawerk facts — read the KB.

## What this project is

{{ONELINER}}

Status: **{{STATUS}}** · Category: **{{CATEGORY}}**.

See [README.md](./README.md) and [docs/](./docs/).

## House rules

- **Brand voice.** Short sentences. "We", present tense. No *leverage,
  ecosystem, stakeholders, synergy, disrupt, transform*.
- **Open by default.** Decisions get written down somewhere durable. If
  you make a call worth remembering, leave a trail.
- **Clear scope.** Every work item has one artifact, one owner, one done-by
  date. Reject items that don't fit that shape — keep cutting.
- **Build for real.** Step 04 is the only step that counts. A great
  validation that never gets built doesn't count.
```

#### `docs/problem-statement.md`

```markdown
# Problem statement — {{NAME}}

*Step 01 — Validate. Sharpen this into a clear problem worth solving.*

## Who has this problem

<one or two sentences — the actual people, not "users">

## What's the problem

<plain language, no jargon>

## Why it isn't already solved

<be honest — what's been tried, what's missing>

## What "solved" would look like

<the artifact that would let us say yes, this is done>

## What we are NOT trying to do

<scope cuts. these make the project finishable>
```

#### `LICENSE`

```
MIT License

Copyright (c) {{YEAR}} Novawerk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

#### `.gitignore`

Language-agnostic baseline. The user adds Node/Python/etc. lines after they pick a stack.

```
# OS
.DS_Store
Thumbs.db

# Editors
.idea/
.vscode/
*.swp

# Env / secrets
.env
.env.*
!.env.example
*.pem

# Build output
dist/
build/
out/
.next/
.cache/
coverage/

# Deps (covers the common cases)
node_modules/
.venv/
__pycache__/
```

### 4. Install the `nw-knowledge-base` skill

```bash
KB_DIR="${HOME}/.cache/nw-knowledge-base"
if [ -d "${KB_DIR}/.git" ]; then
  git -C "${KB_DIR}" fetch --quiet origin main \
    && git -C "${KB_DIR}" reset --quiet --hard origin/main
else
  git clone --quiet --depth 1 https://github.com/Novawerk/nw-knowledge-base.git "${KB_DIR}"
fi
mkdir -p .claude/skills/nw-knowledge-base
cp "${KB_DIR}/skills/nw-knowledge-base/SKILL.md" .claude/skills/nw-knowledge-base/SKILL.md
```

If the clone fails (offline, auth required), tell the user — do **not** fabricate a placeholder SKILL.md.

### 5. Initialise git

If the directory is not already a git repo:

```bash
git init -q
git add .
git commit -q -m "Bootstrap {{NAME}} — Novawerk portfolio project"
```

If it is already a git repo, just `git add .` and let the user commit when they're ready.

### 6. Next steps

Print this short list to the user:

1. Fill in [`docs/problem-statement.md`](./docs/problem-statement.md). Until it's honest, the rest is paperwork.
2. Create the repo on GitHub as `Novawerk/{{SLUG}}` and push.
3. Add `{{NAME}}` to [`projects/overview.md`](https://github.com/Novawerk/nw-knowledge-base/blob/main/projects/overview.md) in the knowledge base.

## Constraints

- **Stack-agnostic.** Don't add Next.js, FastAPI, Vite, etc. The user picks the stack after the docs are honest about what they're building. Adding a framework before the problem statement is written is exactly the kind of premature scope this skill pushes against.
- **Don't overwrite.** If any target file exists, stop and ask.
- **Don't invent facts.** The one-liner and problem statement come from the user, not from you. Empty placeholder sections are fine — fabricated content is not.
- **Don't add a CI workflow, CODEOWNERS, or issue templates** unless the user asks. Start small; add infrastructure when there's a reason.

## Installing this skill in a consumer repo

Copy the SKILL.md into the consumer repo's `.claude/skills/`:

```bash
mkdir -p .claude/skills/nw-bootstrap-project
curl -sSL https://raw.githubusercontent.com/Novawerk/nw-knowledge-base/main/skills/nw-bootstrap-project/SKILL.md \
  -o .claude/skills/nw-bootstrap-project/SKILL.md
```
