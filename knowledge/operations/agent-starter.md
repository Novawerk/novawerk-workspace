---
title: Agent starter
category: operations
status: evolving
summary: Building an AI agent? Start from our public template, Novawerk/agent-starter — a harness you can read end to end, a chat UI with a debug panel, evals, and a one-container deploy.
source:
  - https://github.com/Novawerk/agent-starter
updated: 2026-10-03
---

# Agent starter

When a project needs an AI agent — an assistant, a chatbot, anything where a
model talks to people and calls tools — we start from
[`Novawerk/agent-starter`](https://github.com/Novawerk/agent-starter). It is a
public GitHub template under the MIT licence, like the rest of our open work.

## How to start

```bash
gh repo create my-agent --template Novawerk/agent-starter --public --clone
```

Or click **Use this template** on GitHub. Then `pnpm install && pnpm dev`: it
runs on a mock model with no API key, so anyone can try it in two minutes. The
README's **Make it yours** list takes it from there: name, persona, skills,
tools, evals, and a go-live checklist.

## What is in it

- **A harness, not a framework.** The whole backend is about 2,500 lines of
  TypeScript. One person can read it in an afternoon and change any part of it.
- **Behaviour in Markdown.** The persona lives in `prompts/system.md` and
  procedures in `skills/*/SKILL.md`. People who know the domain shape the agent
  without touching code.
- **Memory.** Working memory for one session, long-term memory per user, and
  context compaction for long conversations.
- **Any model.** Claude, OpenAI, DeepSeek, Qwen, or a local model through one
  OpenAI-compatible adapter.
- **A chat UI with a debug panel.** It shows the exact context the model saw
  and a trace of every step.
- **Tests and evals.** Tests run free on a scripted mock model. Evals check
  behaviour on a real model with an LLM judge.
- **One container to ship.** CI checks every PR. An optional deploy to our own
  server backs up the database and rolls back on a failed health check.

## Why we start here

- **Build for real.** A demo agent is easy. The starter already carries what a
  handed-over agent needs: tests, evals, a deploy, and a checklist before real
  users arrive. See [How we work](./how-we-work.md).
- **Open by default.** No framework magic means the next contributor can read
  how it works instead of asking. See [Open by default](./open-by-default.md).
- **Build, learn, together.** Designers, researchers and community folk can
  improve an agent through its prompts and skills, not only engineers. See
  [Principle 02](../culture/principles/02-build-learn-together.md).

## When not to use it

- **One model call in a script.** Call the provider's SDK directly.
- **Agents inside the novawerk monorepo.** The org's own agents (`agents/`, run
  on GitHub Actions, built on `@nw/agent-core`) and the admin assistant (in
  `apps/api`, built on `@nw/agent-harness`) follow the monorepo's rules — for
  example, all outbound email waits in the outbox for a member's approval.

## Keeping it good

A repo made from a template is a copy; it does not receive later changes. When
we fix something every agent needs, we send it upstream as a PR to
`Novawerk/agent-starter` first, then pull it into our own projects by hand.

## Related

- [How we work](./how-we-work.md)
- [Open by default](./open-by-default.md)
- [Members and project roles](./titles-and-roles.md)
