// The Intake Agent conversation behind a pitch or application, read-only and text-only.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Message } from "@nw/agent-harness";
import { agentMessages, agentSessions, memberApplications, members, projectSubmissions, type Database } from "@nw/db";

import { TEST_MEMBERS, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

async function seedSession(link: { submissionId?: string; applicationId?: string }, history: [string, Message][]) {
  const [session] = await db
    .insert(agentSessions)
    .values({ agent: "intake", systemPrompt: "SECRET SYSTEM PROMPT", draft: {}, status: "submitted", ...link })
    .returning();
  for (const [turnId, payload] of history) {
    await db.insert(agentMessages).values({ sessionId: session!.id, turnId, payload });
  }
  return session!;
}

describe("GET /admin/submissions/:id/transcript", () => {
  it("returns user and assistant text only, one bubble per turn", async () => {
    const [pitch] = await db
      .insert(projectSubmissions)
      .values({
        name: "Lena",
        email: "lena@example.org",
        projectName: "Kiez Pantry",
        product: "p",
        userJourney: "u",
        referencesAndInnovation: "r",
        team: "t",
        timeline: "tl",
        consentAt: new Date(),
      })
      .returning();
    const session = await seedSession({ submissionId: pitch!.id }, [
      ["greeting", { role: "assistant", text: "Hi! What do you want to build?", toolCalls: [] }],
      ["t1", { role: "user", text: "A food sharing app", context: "INTERNAL CONTEXT BLOCK" }],
      [
        "t1",
        {
          role: "assistant",
          text: "",
          toolCalls: [{ id: "c1", name: "update_draft", args: { pitch: { projectName: "Kiez Pantry" } } }],
        },
      ],
      ["t1", { role: "tool", toolCallId: "c1", name: "update_draft", content: '{"ok":true}' }],
      ["t1", { role: "assistant", text: "Nice. Who is it for?", toolCalls: [] }],
      ["t1", { role: "assistant", text: "And who is on the team?", toolCalls: [] }],
    ]);

    const { transcript } = await adminJson(makeApp(db).app, "GET", `/admin/submissions/${pitch!.id}/transcript`);
    expect(transcript).toMatchObject({ sessionId: session.id, startedAt: expect.any(String) });
    expect(transcript.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([
      ["assistant", "Hi! What do you want to build?"],
      ["user", "A food sharing app"],
      ["assistant", "Nice. Who is it for?\n\nAnd who is on the team?"],
    ]);
    const raw = JSON.stringify(transcript);
    expect(raw).not.toContain("INTERNAL CONTEXT BLOCK");
    expect(raw).not.toContain("SECRET SYSTEM PROMPT");
    expect(raw).not.toContain("update_draft");
  });

  it("is null for a pitch from the plain form", async () => {
    const { app } = makeApp(db);
    expect(await adminJson(app, "GET", "/admin/submissions/00000000-0000-0000-0000-000000000000/transcript")).toEqual({
      transcript: null,
    });
  });
});

describe("GET /admin/applications/:id/transcript", () => {
  it("finds the session that sent the application", async () => {
    const [app1] = await db
      .insert(memberApplications)
      .values({
        name: "Noor",
        email: "noor@example.org",
        functions: ["design"],
        background: "b",
        motivation: "m",
        availability: "2to5",
        consentAt: new Date(),
      })
      .returning();
    await seedSession({ applicationId: app1!.id }, [
      ["greeting", { role: "assistant", text: "Welcome!", toolCalls: [] }],
      ["t1", { role: "user", text: "I design things" }],
    ]);
    const { transcript } = await adminJson(makeApp(db).app, "GET", `/admin/applications/${app1!.id}/transcript`);
    expect(transcript.messages).toHaveLength(2);
    expect(transcript.messages[1]).toMatchObject({ role: "user", text: "I design things" });
  });
});
