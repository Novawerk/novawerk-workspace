// Emails to contributors (NB-ADR-0013): what happens on the board becomes one notice per person,
// sent once, to their own address, with their settings respected.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proposalInput, suggestionInput } from "@nw/contracts";
import { contributorNotices, contributors, members, taskEvents, tasks, type Contributor, type Database } from "@nw/db";
import type { ContributorNoticeMail } from "@nw/email";
import { addPost, chooseProposal, propose, suggestTask, transitionTask } from "@nw/tasks";

import { collectNotices, dispatchNotices, noticeOffUrl, runContributorNotices } from "../src/contributor-notices.js";
import { TEST_MEMBERS, TEST_SECRET, contributorCookie, createTestDb, makeApp, resetDb } from "./helpers.js";

const CRON_SECRET = "cron-secret-0123456789";
const logger = { error: () => undefined, warn: () => undefined };

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

let lena: Contributor;
let jonas: Contributor;
let mila: Contributor;
let mails: { to: string; mail: ContributorNoticeMail }[];
let sendOpts: { idempotencyKey: string; unsubscribeUrl?: string }[];
const send = async (to: string, mail: ContributorNoticeMail, opts: { idempotencyKey: string; unsubscribeUrl?: string }) => {
  mails.push({ to, mail });
  sendOpts.push(opts);
  return { id: `re_${mails.length}` };
};
const kinds = () => mails.map((m) => `${m.mail.kind}→${m.to}`);

beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  mails = [];
  sendOpts = [];
  const person = (handle: string, githubId: number | null, email: string | null) =>
    db
      .insert(contributors)
      .values({ handle, displayName: handle, githubId, email, pledgeAcceptedAt: new Date() })
      .returning()
      .then((r) => r[0]!);
  lena = await person("lena-k", 1, "lena@example.org");
  jonas = await person("jonas", 2, "jonas@example.org");
  // GitHub only: no verified address.
  mila = await person("mila", 3, null);
});

async function openTask(title = "Sort the wall A–Z") {
  const [t] = await db.insert(tasks).values({ title, status: "open", area: "web", size: "M" }).returning();
  return t!;
}
const plan = proposalInput.parse({ approach: "Add a sort select to the wall.", eta: "days", readCriteria: true });
const ada = { kind: "member", id: "ada" } as const;

describe("collect and send", () => {
  it("tells the chosen proposer and the others, once each", async () => {
    const task = await openTask();
    const chosen = await propose(db, lena, task.id, plan);
    await propose(db, jonas, task.id, plan);
    await chooseProposal(db, { proposalId: chosen.id, memberId: "ada" });

    const run = await runContributorNotices(db, send, logger);
    expect(run).toMatchObject({ queued: 2, sent: 2, skipped: 0, failed: 0 });
    expect(kinds().sort()).toEqual(["proposal_chosen→lena@example.org", "proposal_not_chosen→jonas@example.org"]);
    const notChosen = mails.find((m) => m.mail.kind === "proposal_not_chosen")!.mail;
    expect(notChosen).toMatchObject({ task: { id: task.id, title: "Sort the wall A–Z" }, note: expect.stringContaining("another one") });

    // A second run queues and sends nothing new.
    expect(await runContributorNotices(db, send, logger)).toMatchObject({ queued: 0, sent: 0 });
    expect(mails).toHaveLength(2);
  });

  it("sends suggestion outcomes and Werk to the person they are about", async () => {
    const s1 = await suggestTask(db, lena, suggestionInput.parse({ title: "Dark mode", kind: "improvement", body: "Please add a dark mode to the board.", where: "site" }));
    const s2 = await suggestTask(db, jonas, suggestionInput.parse({ title: "Typo on /about", kind: "bug", body: "There is a typo in the second paragraph.", where: "site" }));
    await transitionTask(db, { taskId: s1.id, action: "decline", actor: ada, note: "Not this year." });
    await transitionTask(db, { taskId: s2.id, action: "request_info", actor: ada, note: "Which word?" });

    const task = await openTask("Wall sort");
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    await transitionTask(db, { taskId: task.id, action: "merge", actor: { kind: "system" }, prUrl: "https://github.com/Novawerk/novawerk-workspace/pull/9" });

    await runContributorNotices(db, send, logger);
    expect(kinds().sort()).toEqual([
      "proposal_chosen→lena@example.org",
      "suggestion_declined→lena@example.org",
      "suggestion_needs_info→jonas@example.org",
      "werk_awarded→lena@example.org",
    ]);
    expect(mails.find((m) => m.mail.kind === "werk_awarded")!.mail).toMatchObject({ werk: 3 });
    expect(mails.find((m) => m.mail.kind === "suggestion_declined")!.mail).toMatchObject({ note: "Not this year." });
  });

  it("batches replies: one mail per person and task, then at most one an hour", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    const first = await addPost(db, lena, task.id, { body: "Starting today." });
    await addPost(db, jonas, task.id, { body: "Nice!", replyTo: first.id });
    await addPost(db, jonas, task.id, { body: "One more thought." });
    // Lena's own post doesn't mail her.

    const now = new Date();
    await collectNotices(db, now);
    await dispatchNotices(db, send, logger, { now: now });
    const replies = mails.filter((m) => m.mail.kind === "replies");
    expect(replies).toEqual([
      { to: "lena@example.org", mail: { kind: "replies", task: { id: task.id, title: task.title }, posts: 2, repliesToYou: 1 } },
    ]);

    // Another reply within the hour waits…
    await addPost(db, jonas, task.id, { body: "And another." });
    await collectNotices(db, now);
    await dispatchNotices(db, send, logger, { now: new Date(now.getTime() + 10 * 60_000) });
    expect(mails.filter((m) => m.mail.kind === "replies")).toHaveLength(1);
    // …and goes out after it.
    await dispatchNotices(db, send, logger, { now: new Date(now.getTime() + 61 * 60_000) });
    expect(mails.filter((m) => m.mail.kind === "replies")).toHaveLength(2);
  });

  it("respects settings, suspensions and missing addresses", async () => {
    await db.update(contributors).set({ notifyReplies: false }).where(eq(contributors.id, lena.id));
    await db.update(contributors).set({ suspendedAt: new Date() }).where(eq(contributors.id, jonas.id));
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    await addPost(db, mila, task.id, { body: "How is it going?" });

    // Chosen always goes; the reply doesn't (turned off).
    const run = await runContributorNotices(db, send, logger);
    expect(kinds()).toEqual(["proposal_chosen→lena@example.org"]);
    expect(run.skipped).toBe(1);
    const reasons = await db.select({ kind: contributorNotices.kind, reason: contributorNotices.reason }).from(contributorNotices).where(eq(contributorNotices.status, "skipped"));
    expect(reasons).toEqual([{ kind: "replies", reason: "turned_off" }]);

    // A suspended account and one without an address get nothing.
    const t2 = await openTask("Second");
    await db.insert(contributorNotices).values([
      { key: "test:jonas", kind: "proposal_chosen", contributorId: jonas.id, taskId: t2.id },
      { key: "test:mila", kind: "proposal_chosen", contributorId: mila.id, taskId: t2.id },
    ]);
    await dispatchNotices(db, send, logger);
    expect(mails).toHaveLength(1);
    const skipped = await db.select({ key: contributorNotices.key, reason: contributorNotices.reason }).from(contributorNotices).where(eq(contributorNotices.status, "skipped"));
    expect(skipped).toEqual(expect.arrayContaining([{ key: "test:jonas", reason: "suspended" }, { key: "test:mila", reason: "no_address" }]));
  });

  it("turns the board's reminder and automatic release into mail, with dates from the task", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    const now = new Date();
    const idleSince = new Date(now.getTime() - 7 * 86_400_000 - 3_600_000);
    await db.update(tasks).set({ lastActivityAt: idleSince }).where(eq(tasks.id, task.id));
    // What the GitHub sync writes (@nw/tasks).
    await db.insert(taskEvents).values({ taskId: task.id, kind: "inactivity_reminder", note: "No activity since …", subjectContributorId: lena.id });
    await runContributorNotices(db, send, logger, { now, unsubscribe: { apiUrl: "https://api.novawerk.io", secret: TEST_SECRET } });
    expect(mails.find((m) => m.mail.kind === "reminder")!.mail).toEqual({
      kind: "reminder",
      task: { id: task.id, title: task.title },
      idleDays: 7,
      releaseOn: new Date(idleSince.getTime() + 14 * 86_400_000).toISOString().slice(0, 10),
    });
    // Replies and reminders carry a one-click "turn these off".
    expect(sendOpts[mails.findIndex((m) => m.mail.kind === "reminder")]!.unsubscribeUrl).toMatch(
      /^https:\/\/api\.novawerk\.io\/public\/contributor-notices\/off\?c=.+&s=notifyReminders&sig=/,
    );

    // The automatic release: the system releases it, and the person hears about it.
    await transitionTask(db, { taskId: task.id, action: "release", actor: { kind: "system" }, note: "No activity for 14 days" });
    await runContributorNotices(db, send, logger);
    expect(mails.at(-1)!.mail).toMatchObject({ kind: "released", idle: true });
    expect(kinds().sort()).toEqual(["proposal_chosen→lena@example.org", "released→lena@example.org", "reminder→lena@example.org"]);
  });

  it("sends a reminder without a subject to whoever holds the task", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    await db.insert(taskEvents).values({ taskId: task.id, kind: "inactivity_reminder", note: "Quiet for a while." });
    await runContributorNotices(db, send, logger);
    expect(mails.at(-1)).toMatchObject({ to: "lena@example.org", mail: { kind: "reminder", idleDays: 0 } });
  });

  it("doesn't mail someone about releasing their own task", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    await transitionTask(db, { taskId: task.id, action: "release", actor: { kind: "contributor", id: lena.id }, note: "No time" });
    await runContributorNotices(db, send, logger);
    // Nothing at all: not the release they did themselves, and no longer "it's yours" either.
    expect(kinds()).toEqual([]);
  });

  it("retries a failed send, then gives up after 3 tries", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    const failing = async () => {
      throw new Error("Resend down");
    };
    await runContributorNotices(db, failing, logger);
    expect((await db.select().from(contributorNotices))[0]).toMatchObject({ status: "pending", attempts: 1 });
    await dispatchNotices(db, failing, logger);
    const last = await dispatchNotices(db, failing, logger);
    expect(last.failed).toBe(1);
    expect((await db.select().from(contributorNotices))[0]).toMatchObject({ status: "failed", attempts: 3, reason: "Resend down" });
    await dispatchNotices(db, send, logger);
    expect(mails).toHaveLength(0);
  });

  it("never sends one row twice, even when two runs race", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    await collectNotices(db);
    await Promise.all([dispatchNotices(db, send, logger), dispatchNotices(db, send, logger)]);
    expect(mails).toHaveLength(1);
  });

  it("queues without a sender, and sends later", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    expect(await runContributorNotices(db, undefined, logger)).toMatchObject({ queued: 1, sent: 0 });
    expect(await runContributorNotices(db, send, logger)).toMatchObject({ queued: 0, sent: 1 });
  });
});

describe("review fixes", () => {
  async function chosenTask() {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    return task;
  }

  it("gives Resend the same idempotency key on every try", async () => {
    await chosenTask();
    let tries = 0;
    const flaky = async (to: string, mail: ContributorNoticeMail, o: { idempotencyKey: string }) => {
      sendOpts.push(o);
      if (++tries < 3) throw new Error("timeout");
      return send(to, mail, o);
    };
    await runContributorNotices(db, flaky, logger);
    await dispatchNotices(db, flaky, logger);
    await dispatchNotices(db, flaky, logger);
    const keys = new Set(sendOpts.map((o) => o.idempotencyKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toMatch(/^cn-event:\d+$/);
    expect(mails).toHaveLength(1);
  });

  it("doesn't count a 429 as a try, and stops the run", async () => {
    const task = await chosenTask();
    await db.insert(contributorNotices).values({ key: "test:second", kind: "werk_awarded", contributorId: lena.id, taskId: task.id, data: { werk: 1 } });
    let calls = 0;
    const limited = async () => {
      calls++;
      throw Object.assign(new Error("Too many requests"), { code: "rate_limit_exceeded" });
    };
    await runContributorNotices(db, limited, logger);
    expect(calls).toBe(1);
    const rows = await db.select().from(contributorNotices);
    expect(rows.every((r) => r.status === "pending" && r.attempts === 0)).toBe(true);
  });

  it("doesn't let waiting replies crowd out other kinds", async () => {
    const task = await chosenTask();
    const hourAgo = new Date(Date.now() - 10 * 60_000);
    await db.insert(contributorNotices).values({ key: "test:sent-replies", kind: "replies", contributorId: lena.id, taskId: task.id, status: "sent", sentAt: hourAgo });
    await db.insert(contributorNotices).values(
      Array.from({ length: 210 }, (_, i) => ({ key: `test:r${i}`, kind: "replies", contributorId: lena.id, taskId: task.id, data: { toYou: false } })),
    );
    await runContributorNotices(db, send, logger);
    expect(kinds()).toEqual(["proposal_chosen→lena@example.org"]);
  });

  it("skips stale notices, and 'yours' or reminders for a task that changed hands", async () => {
    const task = await chosenTask();
    await db.insert(contributorNotices).values([
      { key: "test:old", kind: "werk_awarded", contributorId: lena.id, taskId: task.id, data: { werk: 1 }, createdAt: new Date(Date.now() - 3 * 86_400_000) },
      { key: "test:not-yours", kind: "proposal_chosen", contributorId: jonas.id, taskId: task.id },
    ]);
    await db.update(contributors).set({ suspendedAt: null }).where(eq(contributors.id, jonas.id));
    await runContributorNotices(db, send, logger);
    const skipped = await db.select({ key: contributorNotices.key, reason: contributorNotices.reason }).from(contributorNotices).where(eq(contributorNotices.status, "skipped"));
    expect(skipped).toEqual(expect.arrayContaining([{ key: "test:old", reason: "stale" }, { key: "test:not-yours", reason: "outdated" }]));
    expect(kinds()).toEqual(["proposal_chosen→lena@example.org"]);
  });

  it("marks rows stuck in sending as failed, and prunes and forgets", async () => {
    const task = await chosenTask();
    const ago = (ms: number) => new Date(Date.now() - ms);
    await db.insert(contributorNotices).values([
      { key: "test:stuck", kind: "werk_awarded", contributorId: lena.id, taskId: task.id, status: "sending", claimedAt: ago(20 * 60_000) },
      { key: "test:sending", kind: "werk_awarded", contributorId: lena.id, taskId: task.id, status: "sending", claimedAt: ago(60_000) },
      { key: "test:ancient", kind: "werk_awarded", contributorId: lena.id, taskId: task.id, status: "sent", createdAt: ago(31 * 86_400_000) },
      { key: "deleted:x", kind: "account_deleted", toEmail: "gone@example.org", status: "failed", createdAt: ago(8 * 86_400_000) },
    ]);
    const run = await runContributorNotices(db, send, logger);
    expect(run).toMatchObject({ stuck: 1, pruned: 1 });
    const byKey = Object.fromEntries((await db.select().from(contributorNotices)).map((r) => [r.key, r]));
    expect(byKey["test:stuck"]).toMatchObject({ status: "failed", reason: expect.stringContaining("unknown_outcome") });
    expect(byKey["test:sending"]!.status).toBe("sending");
    expect(byKey["test:ancient"]).toBeUndefined();
    expect(byKey["deleted:x"]!.toEmail).toBeNull();
  });

  it("moves the reminder's release date by a week after an extension", async () => {
    const task = await chosenTask();
    const now = new Date();
    const idleSince = new Date(now.getTime() - 14 * 86_400_000);
    await db.update(tasks).set({ lastActivityAt: idleSince, extendedAt: new Date(now.getTime() - 86_400_000) }).where(eq(tasks.id, task.id));
    await db.insert(taskEvents).values({ taskId: task.id, kind: "inactivity_reminder", subjectContributorId: lena.id });
    await runContributorNotices(db, send, logger, { now });
    expect(mails.find((m) => m.mail.kind === "reminder")!.mail).toMatchObject({
      idleDays: 14,
      releaseOn: new Date(idleSince.getTime() + 21 * 86_400_000).toISOString().slice(0, 10),
    });
  });

  it("tells the person on a task when a member closes it", async () => {
    const task = await chosenTask();
    await transitionTask(db, { taskId: task.id, action: "close", actor: ada, note: "Folded into NW-50" });
    await runContributorNotices(db, send, logger);
    expect(mails.at(-1)).toEqual({ to: "lena@example.org", mail: { kind: "task_closed", task: { id: task.id, title: task.title }, note: "Folded into NW-50" } });
  });

  it("turns replies off with the signed one-click link, and refuses a forged one", async () => {
    const { app } = makeApp(db);
    const url = new URL(noticeOffUrl("https://api.novawerk.io", lena.id, "notifyReplies", TEST_SECRET));
    const forged = new URL(noticeOffUrl("https://api.novawerk.io", lena.id, "notifyReplies", "another-secret-0123456789-abcdefgh"));
    expect((await app.request(`${forged.pathname}${forged.search}`, { method: "POST" })).status).toBe(400);
    expect((await app.request(`${url.pathname}${url.search}`)).headers.get("location")).toBe("https://novawerk.io/settings");
    expect((await app.request(`${url.pathname}${url.search}`, { method: "POST", body: "List-Unsubscribe=One-Click" })).status).toBe(200);
    expect((await db.select().from(contributors).where(eq(contributors.id, lena.id)))[0]!.notifyReplies).toBe(false);
  });
});

describe("over HTTP", () => {
  it("runs on GET /cron/contributor-notices with the cron secret", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan);
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    const { app } = makeApp(db, { env: { cronSecret: CRON_SECRET }, sendContributorNotice: send });
    expect((await app.request("/cron/contributor-notices")).status).toBe(401);
    const res = await app.request("/cron/contributor-notices", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: 1, sent: 1, skipped: 0, failed: 0, stuck: 0, pruned: 0 });
  });

  it("sends one last mail when an account is deleted, then forgets the address", async () => {
    const { app } = makeApp(db, { env: { cronSecret: CRON_SECRET }, sendContributorNotice: send });
    const res = await app.request("/contrib/me", {
      method: "DELETE",
      headers: { Cookie: await contributorCookie(lena.id), "Content-Type": "application/json", Origin: "https://novawerk.io" },
      body: JSON.stringify({ confirmHandle: "lena-k" }),
    });
    expect(res.status).toBe(200);
    await app.request("/cron/contributor-notices", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(mails).toEqual([{ to: "lena@example.org", mail: { kind: "account_deleted", handle: "lena-k" } }]);
    const [row] = await db.select().from(contributorNotices);
    expect(row).toMatchObject({ kind: "account_deleted", status: "sent", toEmail: null, contributorId: null });
  });
});
