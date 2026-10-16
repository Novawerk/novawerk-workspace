// The agents that help run Novawerk. A static list on purpose: the source of truth is
// agents/<id>/index.ts and .github/workflows/agent-<id>.yml; `pnpm agent --list` prints the same.
// Keep this in step when an agent is added or its schedule changes.

import { GITHUB_REPOSITORY } from "./env"

export type AgentEffect = "outbox" | "records" | "jira" | "database"

export interface AgentInfo {
  id: string
  name: string
  description: string
  /** When it runs, in words. */
  when: string
  effects: AgentEffect[]
  /** False for agents that run inside apps/api instead of GitHub Actions. */
  onGitHub: boolean
}

export const AGENTS: AgentInfo[] = [
  {
    id: "intake",
    name: "Intake",
    description: "Summarises each new pitch and application, and queues a short acknowledgement.",
    when: "Right after a form or chat is sent; every 6 hours as a safety net",
    effects: ["database", "outbox"],
    onGitHub: true,
  },
  {
    id: "promo",
    name: "Promo",
    description:
      "Plans each project's posts from its lifecycle and drafts them in Chinese and English. A maintainer reviews and posts them by hand.",
    when: "Right after a project changes stage or a member asks for a draft; daily for posts that come due",
    effects: ["database"],
    onGitHub: true,
  },
  {
    id: "sponsor-discovery",
    name: "Sponsor discovery",
    description: "Finds sponsor candidates and adds them as intro-stage partners, with a record. Sends nothing.",
    when: "Tuesdays",
    effects: ["database", "records"],
    onGitHub: true,
  },
  {
    id: "sponsor-outreach",
    name: "Sponsor outreach",
    description: "Drafts an email to one partner in our voice and queues it for approval.",
    when: "On demand (Run workflow)",
    effects: ["outbox"],
    onGitHub: true,
  },
  {
    id: "standup-digest",
    name: "Standup digest",
    description: "Writes Done / Next / Blocked from the NB board.",
    when: "Every 2 days, around 08:00 Berlin",
    effects: ["records"],
    onGitHub: true,
  },
  {
    id: "all-hands-prep",
    name: "All-hands prep",
    description: "Drafts the fortnightly all-hands agenda and pre-read: blockers first, then the timeline, then new ideas.",
    when: "Mondays in all-hands weeks",
    effects: ["records"],
    onGitHub: true,
  },
  {
    id: "jira-automation",
    name: "Jira nudges",
    description: "Leaves a friendly comment on NB issues that have no owner. Never changes a status.",
    when: "Weekdays around 09:00 Berlin",
    effects: ["jira"],
    onGitHub: true,
  },
]

export const EFFECT_LABELS: Record<AgentEffect, string> = {
  outbox: "Queues email for approval",
  records: "Writes records/",
  jira: "Comments in Jira",
  database: "Updates the database",
}

const repo = `https://github.com/${GITHUB_REPOSITORY}`

/** The workflow's run history on GitHub. */
export const workflowUrl = (id: string) => `${repo}/actions/workflows/agent-${id}.yml`
/** The agent's wiring in this repo. */
export const sourceUrl = (id: string) => `${repo}/tree/main/agents/${id}`
