---
name: nw-knowledge-base
description: Read canonical Novawerk organisational facts (identity, tagline, mission, brand voice and visual identity, the three principles, the pledge, the four-step process, open-by-default, ways to join, members and project roles, community channels/rhythm, the agent starter template for AI-agent projects). Use whenever the user or a task needs Novawerk's own words or facts. Inside novawerk-workspace the facts are in knowledge/; elsewhere, sparse-clone them.
---

# Novawerk knowledge base

Canonical facts about Novawerk live in the `knowledge/` folder of the public
`Novawerk/novawerk-workspace` repo (formerly the separate `nw-knowledge-base` repo).

## When to use this skill

- *What is Novawerk's tagline / mission / vision / brand voice?*
- *What are the three principles? What is the pledge?*
- *What is the Nova Star? What are the brand colours?*
- *How do projects move from idea to shipped? What does "open by default" mean?*
- *How do people join? What roles exist on a project?* (Everyone is a Member — there are no tiers.)
- *Community channels and rhythm.*
- *We want to build an AI agent — where do we start?* (`operations/agent-starter.md`)

Do **not** use it for:

- The current portfolio list or project details — those live in the `projects`
  table (Postgres), edited in the admin panel. Ask the API (`GET /public/projects`)
  or the database.
- Submissions, applications, members, partners, finance — Postgres, not the KB.
- Internal minutes, decisions and partner notes — `records/` in the private repo
  `Novawerk/novawerk` (confidential), not the KB.

## How to use it

### Inside novawerk-workspace

Read the files directly. Start with `knowledge/README.md` (the index), then open
only the files you need. Each file has YAML frontmatter (`title`, `category`,
`status`, `summary` when present, `source`, `updated`) followed by the canonical text.

### In another repo

Sparse-clone just the `knowledge/` folder into a local cache (the repo is public, so no
GitHub access is needed):

```bash
KB_DIR="${HOME}/.cache/novawerk-workspace"
if [ -d "${KB_DIR}/.git" ]; then
  git -C "${KB_DIR}" pull --quiet --ff-only
else
  git clone --quiet --depth 1 --filter=blob:none --sparse \
    https://github.com/Novawerk/novawerk-workspace.git "${KB_DIR}"
  git -C "${KB_DIR}" sparse-checkout set knowledge
fi
```

Then read `${KB_DIR}/knowledge/README.md` first. If the clone fails (offline, no
access), tell the user and stop — do not invent facts.

### Cite provenance

When you quote or paraphrase a fact, cite the file (e.g. `knowledge/brand/voice.md`).
If the file is `status: evolving`, mention its `updated:` date.

## Guarantees

- **Stable** facts (identity, principles, methodology) rarely change. Treat them as authoritative.
- **Evolving** facts (channels, rhythm, stats) may be stale; flag anything older than a quarter.
- The public website renders parts of `knowledge/` directly, so editing a file here changes the site on the next deploy.
