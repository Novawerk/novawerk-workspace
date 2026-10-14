---
name: jira
description: Manage Novawerk's Jira issues, sprints, and the NB board via the `jira` CLI. Use when creating, updating, transitioning, searching, or commenting on Jira issues in the `NB` (Novawerk) project, listing sprints, moving issues across the board, running JQL queries, or logging work. Site is `novawerk-teams.atlassian.net`, board id is `34`.
---

# Jira CLI (`jira`)

Uses [`jira-cli`](https://github.com/ankitpokhrel/jira-cli) (the `ankitpokhrel/jira-cli` Go binary, installed via Homebrew at `/opt/homebrew/bin/jira`).

The Novawerk Jira lives at `https://novawerk-teams.atlassian.net`. The project key is **`NB`** (Novawerk) and the board id is **`34`** ([board link](https://novawerk-teams.atlassian.net/jira/software/projects/NB/boards/34)).

> **Note:** there is a *separate, unrelated* `novawerk.atlassian.net` site (no longer used — its hostname doesn't even resolve). The live instance is `novawerk-teams.atlassian.net`. If a command 404s on a valid `NB-*` key, you're almost certainly pointed at the wrong site — check `server:` in your config.

The global config (`~/.config/.jira/.config.yml`) is initialized against `novawerk-teams.atlassian.net` with `project: NB` / `board: 34`, so plain `jira issue ...` commands work without extra flags. If yours isn't, re-run the `jira init` under *Authentication* below.

## Authentication

`jira-cli` reads the API token from the `JIRA_API_TOKEN` env var (or a matching `~/.netrc` entry) — it does **not** use the macOS keychain.

On this machine, `JIRA_API_TOKEN` is already exported in `~/.zshrc`, so any interactive zsh inherits it. Non-interactive shells (including this skill's Bash calls) need to `source ~/.zshrc` first, or set the env var explicitly:

```bash
# Inside a scripted/non-interactive shell:
source ~/.zshrc                       # picks up JIRA_API_TOKEN from rc
# or:
export JIRA_API_TOKEN="ATATT..."       # paste from https://id.atlassian.com/manage-profile/security/api-tokens
```

First-time setup on a new machine — generate a token at the URL above, then:

```bash
jira init \
  --installation cloud \
  --server https://novawerk-teams.atlassian.net \
  --login <your-atlassian-email> \
  --project NB \
  --board "Novawerk" \
  --auth-type basic
# and add `export JIRA_API_TOKEN=...` to your shell rc (or a netrc entry)
```

Verify: `jira me` (should print your Atlassian email) and `jira serverinfo`.

## Issues

All commands need `-p NB` unless you've set up a local config.

```bash
# List (interactive TUI by default; add --plain for scripting, --raw for JSON)
jira issue list -p NB
jira issue list -p NB -a$(jira me)              # assigned to me
jira issue list -p NB -s"To Do" -s"In Progress" # status filter (repeatable)
jira issue list -p NB --plain --no-headers
jira issue list -p NB -q 'assignee = currentUser() AND status != Done ORDER BY updated DESC'

# View one
jira issue view NB-12 -p NB
jira issue view NB-12 -p NB --comments 10

# Create (-t type and -s summary are required; -b body, -a assignee, -y priority, -l label are optional)
jira issue create -p NB -t Task -s "Wire up KB skill in nw-web-portal" --no-input
jira issue create -p NB -t Bug  -s "Login fails on Safari" -b "Repro: ..." -y High -a <your-atlassian-email> -l frontend
jira issue create -p NB -t Story -s "Open-by-default checklist" -P NB-4   # -P attaches to an epic

# Edit fields on an existing issue
jira issue edit NB-12 -p NB -s "New title" --no-input
jira issue edit NB-12 -p NB -y Critical --no-input
jira issue edit NB-12 -p NB -l backend -l p0 --no-input
jira issue edit NB-12 -p NB -b "New description body" --no-input

# Transition state. The NB workflow uses mixed English + Chinese transition names:
#   '待办' (To Do) · '正在进行' (In Progress) · '完成' (Done — transitions to '已完成')
#   'Backlog' · 'Reviewing' · 'Blocked'
# Use the exact string — case- and language-sensitive.
jira issue move NB-12 -p NB "正在进行"
jira issue move NB-12 -p NB "完成"
jira issue move NB-12 -p NB "Reviewing"
# Or list available transitions for a specific issue via the API:
#   curl -s -u "$EMAIL:$JIRA_API_TOKEN" \
#     "https://novawerk-teams.atlassian.net/rest/api/3/issue/NB-12/transitions" | jq '.transitions[].name'

# Assign
jira issue assign NB-12 -p NB <your-atlassian-email>
jira issue assign NB-12 -p NB $(jira me)        # self
jira issue assign NB-12 -p NB x                 # unassign

# Comments
jira issue comment add NB-12 -p NB "Investigating now"
jira issue comment add NB-12 -p NB --template path/to/body.md
jira issue view NB-12 -p NB --comments 50

# Links
jira issue link    NB-12 NB-34 "blocks" -p NB
jira issue unlink  NB-12 NB-34 "blocks" -p NB

# Worklog (time tracking)
jira issue worklog add NB-12 "1h 30m" --comment "Paired with H on the schema" -p NB
jira issue worklog list NB-12 -p NB

# Watchers, clone, delete
jira issue watch NB-12 -p NB
jira issue clone NB-12 -p NB --summary "Follow-up: X"
jira issue delete NB-12 -p NB          # destructive — confirm before running

# Open in browser
jira open NB-12
```

## Board, Sprints, Epics, Releases

```bash
# Boards
jira board list -p NB

# Sprints — `jira sprint list` has NO --board flag; it reads the board id from
# the config file. The global config is already set to board 34, so these work
# as-is. To target a different board without touching the global config, point
# JIRA_CONFIG_FILE at a scoped config (see *Local config* below).
jira sprint list                       # all sprints on NB board 34
jira sprint list --state active        # active sprints only
jira sprint list --current             # issues in the current active sprint
jira sprint add 34 <sprintID> NB-12 NB-13   # add issues to a sprint (board id 34 is positional)
jira sprint close 34 <sprintID>

# Epics
jira epic list -p NB
jira epic create -p NB -n "Q3 launch" -s "Ship the launch site"
jira epic add NB-4 NB-12 NB-13                   # attach child issues to epic NB-4
jira epic remove NB-12

# Releases (project versions)
jira release list -p NB
```

## Search (JQL)

Pass JQL via `-q` on `issue list`. JQL is more expressive than the typed filters.

```bash
jira issue list -p NB -q 'sprint in openSprints() AND assignee = currentUser()'
jira issue list -p NB -q 'created >= -7d ORDER BY created DESC'
jira issue list -p NB -q 'labels = "p0" AND status != Done'
jira issue list -p NB -q 'project = NB AND statusCategory != Done' --plain --no-headers --columns 'KEY,STATUS,ASSIGNEE,SUMMARY'
```

Common JQL pieces:

- `assignee = currentUser()` · `assignee = "<your-atlassian-email>"` · `assignee is EMPTY`
- `status = "In Progress"` · `statusCategory in (new, indeterminate)` (= not Done)
- `sprint in openSprints()` · `sprint = "NB Sprint 3"`
- `created >= -7d` · `updated >= startOfWeek()` · `due <= endOfWeek()`
- `labels = "backend"` · `priority in (High, Critical)`
- `parent = NB-4` (children of an epic)
- `ORDER BY updated DESC` · `ORDER BY priority DESC, created`

## Project / Users / Me

```bash
jira project list
jira me                              # the configured user (email)
jira serverinfo                      # site URL, version, deployment type
```

## Output formats

Most list commands accept these scripting-friendly modes:

```bash
jira issue list -p NB --plain                    # tab-separated table, no TUI
jira issue list -p NB --plain --no-headers --no-truncate --columns 'KEY,STATUS,ASSIGNEE,SUMMARY'
jira issue list -p NB --raw                      # raw JSON (full Jira issue payload)
jira issue list -p NB --csv
```

For one issue, `jira issue view NB-12 -p NB --raw` returns the full JSON.

## Local config (optional — only to override the global config)

The global config already targets NB / board 34, so you usually don't need this. Use a `JIRA_CONFIG_FILE` only when you want repo-local defaults or to target a different board than the global config without editing it.

```bash
# In the repo root:
cat > .jira.yml <<'EOF'
installation: Cloud
server: https://novawerk-teams.atlassian.net
login: <your-atlassian-email>
auth_type: basic
project:
    key: NB
    type: next-gen
board:
    id: 34
    name: NB board
    type: simple
EOF

# Then for the session:
export JIRA_CONFIG_FILE="$(pwd)/.jira.yml"

# Sanity check:
jira me                    # should print <your-atlassian-email>
jira issue list --plain --no-headers --columns 'KEY,STATUS,ASSIGNEE,SUMMARY' | head
jira sprint list --state active
```

`.jira.yml` is config-only — the token stays in `JIRA_API_TOKEN`. Safe to commit if you want shared defaults across the team; otherwise `.gitignore` it.

## Novawerk house rules for Jira issues

Apply when creating or reviewing issues:

- **One artifact, one owner, one done-by date.** Every issue should name a concrete artifact in the summary (a doc, a button, an interview, a Figma frame), have exactly one assignee, and a due date. Reject "the team will…" framing.
- **Plain language.** Novawerk brand voice in summaries and descriptions: short sentences, "we", present tense, no *leverage / ecosystem / stakeholders / synergy / disrupt / transform*.
- **Open by default.** Decisions made on an issue get written into the description or a linked doc — comments are conversation, the description is the record.
- **Don't bypass validation.** A new feature issue without a linked problem statement (in the repo's `docs/problem-statement.md` or an epic) is a smell. Add the link or push back.

## Notes

- Project key: `NB`. Board id: `34`. The global config is set to NB/34, so `-p NB` is optional. Sprint commands have **no** `-p` or `--board` shortcut — they read `board.id` from the config file (now `34`), or from a `JIRA_CONFIG_FILE` if you point one at a different board.
- Transitions are named, not numbered, and the NB workflow names are mixed English + Chinese: `待办`, `正在进行`, `完成` (→ `已完成`), `Backlog`, `Reviewing`, `Blocked`. Use the exact string. `jira issue move NB-12 -p NB` with no transition shows an interactive picker. To list available transitions for an issue, hit `/rest/api/3/issue/<KEY>/transitions` directly.
- Issue statuses returned by `issue list` are also Chinese strings (`待办` = To Do, `正在进行` = In Progress, `已完成` = Done). When filtering with `-s`, pass the exact display string.
- Custom fields go via `--custom "FieldName=value"` (repeatable). For epic linking, prefer `-P <epic-key>` on create or `jira epic add`.
- Use `jira <command> <subcommand> --help` for the full flag list on any subcommand.
- Full docs: https://github.com/ankitpokhrel/jira-cli

## Installing this skill in a consumer repo

Copy this SKILL.md into the consumer repo's `.claude/skills/`:

```bash
mkdir -p .claude/skills/jira
curl -sSL https://raw.githubusercontent.com/Novawerk/nw-knowledge-base/main/skills/jira/SKILL.md \
  -o .claude/skills/jira/SKILL.md
```

Requires `jira-cli` installed locally (`brew install ankitpokhrel/jira-cli/jira-cli` on macOS) and a one-time `jira init` against `https://novawerk-teams.atlassian.net`.
