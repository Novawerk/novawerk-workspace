// Answering a pitch: accepting and declining queue a fixed template (pending, never sent), once;
// a call invite is drafted by the model, or by the template when there is none.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockProvider } from "@nw/agent-harness";
import { members, outbox, projectSubmissions, type Database } from "@nw/db";

import { acceptedEmail, declinedEmail, inviteTemplate, pitchLanguage } from "../src/admin/pitch-emails.js";
import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

const PITCH = {
  name: "Tobias Krämer",
  email: "tobias@example.org",
  projectName: "Repair café calendar",
  product: "One calendar for every repair café in Berlin.",
  userJourney: "Someone with a broken toaster finds the nearest repair café.",
  referencesAndInnovation: "Dates live on ten websites today.",
  team: "Tobias and a friend.",
  timeline: "By spring.",
  consentAt: new Date(),
};

async function insertPitch(overrides: Partial<typeof PITCH> = {}) {
  const [row] = await db.insert(projectSubmissions).values({ ...PITCH, ...overrides }).returning();
  return row!;
}

const queued = () => db.select().from(outbox);

describe("templates", () => {
  it("answer in the pitch's language", () => {
    expect(pitchLanguage(PITCH)).toBe("en");
    const zh = { ...PITCH, name: "Lin Chen", projectName: "血压记录", product: "一个记录血压的小工具" };
    expect(pitchLanguage(zh)).toBe("zh");
    expect(acceptedEmail(zh, { addedAsMember: false }).subject).toBe("我们想和你一起做 血压记录");
    expect(declinedEmail(zh).body).toContain("这次我们先不接这个项目");
    expect(declinedEmail(zh).body).toContain("https://novawerk.io/tasks");
    expect(acceptedEmail(zh, { addedAsMember: true }).body).toContain("我们已经把你加为成员");
    expect(declinedEmail(PITCH).body).toContain("pick a task at https://novawerk.io/tasks. Anyone can contribute.");
    expect(declinedEmail(PITCH).body).not.toContain("Member");
  });

  it("say what happens next and how we work when we accept", () => {
    const { subject, body } = acceptedEmail(PITCH, { addedAsMember: true });
    expect(subject).toBe("We'd like to build Repair café calendar with you");
    expect(body).toContain("We set up a call with you");
    expect(body).toContain("1. Validate");
    expect(body).toContain("4. Build for real");
    // Accepting makes them a Member, so no version of the note sends them to /join.
    expect(body).not.toContain("/join");
    expect(body).toContain("We've added you as a Member and as the Initiator of Repair café calendar.");
    expect(body).toContain("Sign in at admin.novawerk.io with this email address (Google or an emailed code)");
    const member = acceptedEmail(PITCH, { addedAsMember: false }).body;
    expect(member).not.toContain("/join");
    expect(member).toContain("Sign in at admin.novawerk.io to edit your project.");
    expect(member).not.toContain("We've added you as a Member");
  });

  it("only take the first name and a flattened project name from the pitch", () => {
    const sneaky = { ...PITCH, name: "Eve\nBcc: everyone@example.org", projectName: "X\r\nSubject: hi" };
    const { subject, body } = declinedEmail(sneaky);
    expect(subject).toBe("About your pitch: X Subject: hi");
    expect(body.startsWith("Hi Eve,")).toBe(true);
    expect(body).not.toContain("everyone@example.org");
  });
});

describe("accepting", () => {
  it("queues the acceptance email once, pending, from the member", async () => {
    const pitch = await insertPitch();
    const { app } = makeApp(db);
    const first = await adminJson(app, "POST", `/admin/submissions/${pitch.id}/accept`, {});
    expect(first.emailQueued).toBe(true);
    const again = await adminJson(app, "POST", `/admin/submissions/${pitch.id}/accept`, {});
    expect(again.emailQueued).toBe(false);

    const rows = await queued();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      to: "tobias@example.org",
      subject: "We'd like to build Repair café calendar with you",
      status: "pending",
      draftedBy: "admin:ada",
      relatedTable: "project_submissions",
      relatedId: pitch.id,
    });
  });

  it("writes nothing when the member says so", async () => {
    const pitch = await insertPitch();
    const res = await adminJson(makeApp(db).app, "POST", `/admin/submissions/${pitch.id}/accept`, { email: false });
    expect(res.emailQueued).toBe(false);
    expect(await queued()).toEqual([]);
  });
});

describe("declining", () => {
  it("declines and queues the short no once", async () => {
    const pitch = await insertPitch();
    const { app } = makeApp(db);
    const res = await adminJson(app, "POST", `/admin/submissions/${pitch.id}/decline`, {});
    expect(res).toMatchObject({ submission: { id: pitch.id, status: "declined" }, emailQueued: true });
    expect((await adminJson(app, "POST", `/admin/submissions/${pitch.id}/decline`, {})).emailQueued).toBe(false);
    expect((await queued()).map((r) => r.subject)).toEqual(["About your pitch: Repair café calendar"]);
  });

  it("won't decline a pitch that is a project already", async () => {
    const pitch = await insertPitch();
    const { app } = makeApp(db);
    await adminJson(app, "POST", `/admin/submissions/${pitch.id}/accept`, { email: false });
    expect((await adminFetch(app, "POST", `/admin/submissions/${pitch.id}/decline`, {})).status).toBe(409);
  });
});

describe("inviting to a call", () => {
  const invite = { times: ["Wed 8 Oct, 18:00 (Berlin time)", "Thu 9 Oct, 12:30 (Berlin time)"], minutes: 30 };

  it("lets the model write it from the pitch, and queues nothing", async () => {
    const pitch = await insertPitch();
    const provider = new MockProvider([
      () => ({
        text: "",
        toolCalls: [
          {
            id: "t1",
            name: "write_email",
            args: { subject: "A call about your repair café calendar?", body: "Hi Tobias,\n\nWed 8 Oct, 18:00 works?\n\nNovawerk" },
          },
        ],
      }),
    ]);
    const { app } = makeApp(db, { adminChat: { provider } });
    const draft = await adminJson(app, "POST", `/admin/submissions/${pitch.id}/invite`, invite);
    expect(draft).toMatchObject({ to: "tobias@example.org", by: "ai", subject: "A call about your repair café calendar?" });

    const asked = provider.requests[0]!;
    expect(asked.tools.map((t) => t.name)).toEqual(["write_email"]);
    const prompt = (asked.messages[0] as { text: string }).text;
    expect(prompt).toContain("- Wed 8 Oct, 18:00 (Berlin time)");
    expect(prompt).toMatch(/<pitch>[\s\S]*One calendar for every repair café[\s\S]*<\/pitch>/);
    expect(await queued()).toEqual([]);
  });

  it("falls back to the template without a model, or when the model doesn't call the tool", async () => {
    const pitch = await insertPitch();
    const none = await adminJson(makeApp(db).app, "POST", `/admin/submissions/${pitch.id}/invite`, invite);
    expect(none).toMatchObject({ by: "template", subject: "A call about Repair café calendar?" });
    expect(none.body).toContain("- Thu 9 Oct, 12:30 (Berlin time)");
    expect(none.note).toMatch(/No language model/);

    const chatty = new MockProvider([() => ({ text: "Sure! Here is an email…", toolCalls: [] })]);
    const fallback = await adminJson(makeApp(db, { adminChat: { provider: chatty } }).app, "POST", `/admin/submissions/${pitch.id}/invite`, invite);
    expect(fallback).toMatchObject({ by: "template" });
    expect(fallback.body).toBe(inviteTemplate(pitch, invite).body);
  });

  it("needs at least one time", async () => {
    const pitch = await insertPitch();
    const res = await adminFetch(makeApp(db).app, "POST", `/admin/submissions/${pitch.id}/invite`, { times: [] });
    expect(res.status).toBe(400);
  });
});
