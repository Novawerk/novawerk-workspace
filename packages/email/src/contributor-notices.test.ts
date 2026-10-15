import { describe, expect, it } from "vitest";

import { CONTRIBUTOR_NOTICE_KINDS } from "@nw/contracts";

import { contributorNoticeEmail, sendContributorNotice, type ContributorNoticeMail } from "./contributor-notices.js";

const WEB = "https://novawerk.io";
const task = { id: 42, title: "Sort the wall A–Z" };
const opts = { from: "Novawerk <info@novawerk.io>", webUrl: WEB };

/** One example of every kind. */
const EXAMPLES: ContributorNoticeMail[] = [
  { kind: "proposal_chosen", task },
  { kind: "proposal_not_chosen", task, note: "Thanks. We picked a smaller plan." },
  { kind: "replies", task, posts: 3, repliesToYou: 1 },
  { kind: "reminder", task, idleDays: 7, releaseOn: "2026-10-19" },
  { kind: "released", task, idle: true, note: "No activity for 14 days" },
  { kind: "task_closed", task, note: "We moved this into a bigger task." },
  { kind: "suggestion_accepted", task, yours: true },
  { kind: "suggestion_declined", task, note: "Out of scope for now." },
  { kind: "suggestion_duplicate", task, duplicateOf: { id: 41, title: "A–Z sort" } },
  { kind: "suggestion_needs_info", task, note: "Which page?" },
  { kind: "werk_awarded", task, werk: 3 },
  { kind: "account_deleted", handle: "lena-k" },
];

describe("contributorNoticeEmail", () => {
  it("has a template for every kind", () => {
    expect(EXAMPLES.map((m) => m.kind).sort()).toEqual([...CONTRIBUTOR_NOTICE_KINDS].sort());
    for (const mail of EXAMPLES) {
      const email = contributorNoticeEmail(mail, WEB);
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.html).toContain("<!doctype html>");
      expect(email.text).toContain("You get this email because");
    }
  });

  it("links the guide when a plan is chosen, and the settings in the footer", () => {
    const { subject, text, html } = contributorNoticeEmail({ kind: "proposal_chosen", task }, WEB);
    expect(subject).toBe("NW-42 is yours");
    expect(text).toContain("https://novawerk.io/tasks/NW-42#guide");
    expect(text).toContain("We always send this one.");
    expect(html).toContain('href="https://novawerk.io/settings"');
  });

  it("says replies and reminders can be turned off", () => {
    expect(contributorNoticeEmail(EXAMPLES[2]!, WEB).text).toContain("turn these emails off in Settings");
    const reminder = contributorNoticeEmail(EXAMPLES[3]!, WEB);
    expect(reminder.text).toContain("turn these emails off in Settings");
    expect(reminder.text).toContain("back on the board on Oct 19");
  });

  it("counts replies", () => {
    expect(contributorNoticeEmail(EXAMPLES[2]!, WEB).text).toContain("3 new posts on NW-42: Sort the wall A–Z, 1 reply to you.");
    expect(contributorNoticeEmail({ kind: "replies", task, posts: 1, repliesToYou: 1 }, WEB).text).toContain(
      "1 new post on NW-42: Sort the wall A–Z, a reply to you.",
    );
  });

  it("escapes what members and contributors wrote", () => {
    const { html, subject } = contributorNoticeEmail(
      { kind: "proposal_not_chosen", task: { id: 7, title: "<b>x</b>\r\nBcc: a@b.c" }, note: '<a href="https://evil.example">win</a>' },
      WEB,
    );
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    expect(html).not.toContain("<b>x</b>");
    expect(subject).toBe("About your plan for NW-7");
  });

  it("has no settings link once the account is gone", () => {
    const { text, html } = contributorNoticeEmail({ kind: "account_deleted", handle: "lena-k" }, WEB);
    expect(text).toContain("@lena-k");
    expect(html).not.toContain("/settings");
  });
});

describe("sendContributorNotice", () => {
  it("puts an unsubscribe URL only on the kinds people can turn off", async () => {
    const off = { ...opts, unsubscribeUrl: "https://api.novawerk.io/public/contributor-notices/off?x=1" };
    await expect(sendContributorNotice("a@example.org", EXAMPLES[0]!, off)).rejects.toThrow(/only goes on replies and reminders/);
    expect(await sendContributorNotice("a@example.org", EXAMPLES[2]!, off)).toEqual({ mode: "logged" });
  });

  it("takes one address and a known kind only", async () => {
    await expect(sendContributorNotice("a@example.org, b@example.org", EXAMPLES[0]!, opts)).rejects.toThrow(/single email address/);
    await expect(sendContributorNotice("a@example.org", { kind: "newsletter" } as never, opts)).rejects.toThrow(/not a contributor notice/);
    await expect(sendContributorNotice("a@example.org", EXAMPLES[0]!, { ...opts, webUrl: "javascript:alert(1)" })).rejects.toThrow();
  });

  it("logs instead of sending when no API key is set", async () => {
    expect(await sendContributorNotice("a@example.org", EXAMPLES[0]!, opts)).toEqual({ mode: "logged" });
  });
});
