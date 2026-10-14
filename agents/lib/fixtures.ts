// Sample data for --dry-run. Obviously fake; never real people.

import type { JiraIssue } from "@nw/jira";

export const SAMPLE_SUBMISSION = {
  name: "Ada Example",
  email: "ada@example.org",
  projectName: "Open Looms",
  product: "A free pattern library for hobby weavers.",
  userJourney: "A weaver searches a pattern, adjusts the size, prints it.",
  referencesAndInnovation: "Like Ravelry, but open data and no account needed.",
  team: "Ada (design) and a friend who codes on weekends.",
  timeline: "A first version in three months.",
  consentAt: new Date("2026-10-01T10:00:00Z"),
};

export const SAMPLE_APPLICATION = {
  name: "Grace Example",
  email: "grace@example.org",
  city: "Berlin",
  functions: ["Developer", "Research"],
  background: "Backend developer, five years, mostly Go.",
  motivation: "I want to build something useful with people, not for a client.",
  availability: "Four hours a week, weekends.",
  consentAt: new Date("2026-10-02T10:00:00Z"),
};

export const SAMPLE_ISSUES: JiraIssue[] = [
  { key: "NB-101", status: "In Progress", assignee: "Sample Member", summary: "Outbox approvals in the admin panel" },
  { key: "NB-102", status: "Blocked", assignee: "", summary: "Create the R2 bucket" },
  { key: "NB-103", status: "To Do", assignee: "", summary: "Write the onboarding deck" },
  { key: "NB-104", status: "Done", assignee: "Sample Member", summary: "Move agents to GitHub Actions" },
];

export const SAMPLE_PARTNER_RECORD = `---
title: Acme Foundation (example partner)
category: partners
status: draft
confidential: true
source: []
related: []
updated: 2026-06-04
---

# Acme Foundation — example partner record

## History

- _2026-06-04_ — record created as an example. No outreach sent.
`;
