// Mail to the info@ group, relayed to Slack: the Svix signature, the Slack message, and
// POST /webhooks/resend end to end with Resend and Slack faked.

import { createHmac, randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { Database } from "@nw/db";

import {
  bodyText,
  cameThroughList,
  htmlToText,
  slackMessage,
  unwrap,
  verifyResendSignature,
  type ReceivedEmail,
} from "../src/inbound-mail.js";
import type { InboundMailOptions } from "../src/types.js";
import { makeApp } from "./helpers.js";

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const SLACK_URL = "https://hooks.slack.com/services/T000/B000/xyz";
const now = Date.parse("2026-10-03T12:00:00Z");

function sign(body: string, { secret = SECRET, id = "msg_1", at = Math.floor(Date.now() / 1000) } = {}) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${at}.${body}`).digest("base64");
  return { id, timestamp: String(at), signature: `v1,${signature}` };
}

/** Shaped like what Resend returned for a real email through the group (2026-10-03). */
const LIST_HEADER = JSON.stringify({
  id: { name: "info.novawerk.io" },
  post: { url: "https://groups.google.com/a/novawerk.io/group/info/post", mail: "info@novawerk.io" },
});
const email = (overrides: Partial<ReceivedEmail> = {}): ReceivedEmail => ({
  id: "em_1",
  from: "ada@example.com",
  to: ["info-slack@abc.resend.app"],
  subject: "Can we pitch a climbing app?",
  text: "Hi Novawerk,\n\nWe'd like to pitch a project.\n\nAda\n\nTo unsubscribe from this group and stop receiving emails from it, send an email to info+unsubscribe@novawerk.io.\n",
  html: null,
  headers: {
    from: '"Ada Lovelace" <ada@example.com>',
    to: "info@novawerk.io",
    "mailing-list": "list info@novawerk.io; contact info+owners@novawerk.io",
    list: LIST_HEADER,
  },
  message_id: "<abc-123@mail.example.com>",
  attachments: [],
  ...overrides,
});

describe("verifyResendSignature", () => {
  const body = '{"type":"email.received"}';
  const at = Math.floor(now / 1000);

  it("accepts Resend's signature, also among several", () => {
    expect(verifyResendSignature(SECRET, sign(body, { at }), body, now)).toBe(true);
    const headers = sign(body, { at });
    headers.signature = `v1,bm90LWl0 ${headers.signature}`;
    expect(verifyResendSignature(SECRET, headers, body, now)).toBe(true);
  });

  it("refuses another secret, a changed body, an old delivery or missing headers", () => {
    const other = `whsec_${randomBytes(24).toString("base64")}`;
    expect(verifyResendSignature(SECRET, sign(body, { at, secret: other }), body, now)).toBe(false);
    expect(verifyResendSignature(SECRET, sign(body, { at }), body.replace("received", "sent"), now)).toBe(false);
    expect(verifyResendSignature(SECRET, sign(body, { at: at - 6 * 60 }), body, now)).toBe(false);
    expect(verifyResendSignature(SECRET, { ...sign(body, { at }), id: undefined }, body, now)).toBe(false);
    const v2 = sign(body, { at });
    v2.signature = v2.signature.replace("v1,", "v2,");
    expect(verifyResendSignature(SECRET, v2, body, now)).toBe(false);
  });
});

describe("cameThroughList", () => {
  it("finds the group's list id in Resend's parsed `list` header, or in a plain List-ID", () => {
    expect(cameThroughList(email(), "info.novawerk.io")).toBe(true);
    expect(cameThroughList(email({ headers: { list: { id: { name: "info.novawerk.io" } } } }), "info.novawerk.io")).toBe(
      true,
    );
    expect(cameThroughList(email({ headers: { list: "not json" } }), "info.novawerk.io")).toBe(false);
    expect(cameThroughList(email({ headers: { list: JSON.stringify({ id: { name: "x.example" } }) } }), "info.novawerk.io")).toBe(
      false,
    );
    expect(cameThroughList(email({ headers: { "List-Id": "Novawerk Info <INFO.novawerk.io>" } }), "info.novawerk.io")).toBe(
      true,
    );
    expect(cameThroughList(email({ headers: { "list-id": "<other.novawerk.io>" } }), "info.novawerk.io")).toBe(false);
    expect(cameThroughList(email({ headers: null }), "info.novawerk.io")).toBe(false);
  });
});

describe("the Slack message", () => {
  /** The card, its body (rich text) and its last line (mrkdwn). */
  const card = (m: ReturnType<typeof slackMessage>) => {
    const container = m.blocks[0] as any;
    const children = container.child_blocks as any[];
    const body = children.find((b) => b.type === "rich_text")?.elements[0].elements[0].text as string | undefined;
    const footer = children.find((b) => b.type === "context").elements[0].text as string;
    return { container, children, body, footer };
  };

  it("is one card: subject, sender → recipient, body, and a link back to Gmail", () => {
    const m = slackMessage(email());
    expect(m.text).toBe("📬 Can we pitch a climbing app? (from Ada Lovelace <ada@example.com>)");
    const { container, children, body, footer } = card(m);
    expect(m.blocks).toHaveLength(1);
    expect(container).toMatchObject({
      type: "container",
      title: { type: "plain_text", text: "Can we pitch a climbing app?" },
      subtitle: { type: "plain_text", text: "Ada Lovelace <ada@example.com> → info@novawerk.io" },
      has_header_divider: true,
    });
    expect(body).toBe("Hi Novawerk,\n\nWe'd like to pitch a project.\n\nAda");
    expect(footer).toBe(
      "<https://mail.google.com/mail/#search/rfc822msgid%3Aabc-123%40mail.example.com|Open in Gmail> and reply from there",
    );
    // No buttons: without interactivity Slack flags a click with a warning.
    expect(children.some((b) => b.type === "actions")).toBe(false);
  });

  it("shows what the sender wrote as typed, so nobody can ping the channel or fake a link", () => {
    const text = "<!channel> look at <https://evil.example|your bank> & more";
    const m = slackMessage(email({ text, attachments: [{ filename: "<!here>.pdf" }] }));
    // Rich text is never parsed for mentions or links.
    expect(card(m).body).toBe(text);
    expect(card(m).footer).toContain("📎 1 attachment: &lt;!here&gt;.pdf");
    expect(JSON.stringify(card(m).children.filter((b) => b.type !== "rich_text"))).not.toMatch(/<!(channel|here)/);
  });

  it("cuts long emails and stays inside Slack's limits", () => {
    const m = slackMessage(email({ subject: "S".repeat(400), text: "x".repeat(5_000) }));
    const { container, body } = card(m);
    expect(container.title.text).toHaveLength(150);
    expect(container.subtitle.text.length).toBeLessThanOrEqual(150);
    expect(body).toHaveLength(1_501);
    expect(body).toMatch(/x…$/);
  });

  it("lists attachments by name, and leaves out an empty body", () => {
    const m = slackMessage(email({ text: "", attachments: [{ filename: "deck.pdf" }, { filename: null }] }));
    expect(card(m).body).toBeUndefined();
    expect(card(m).footer).toContain("📎 2 attachments: deck.pdf, unnamed");
  });

  it("names a Reply-To that differs from the sender, e.g. when Google rewrote From", () => {
    const m = slackMessage(
      email({
        headers: { from: "'Ada' via Novawerk Info <info@novawerk.io>", list: LIST_HEADER },
        reply_to: ["ada@example.com"],
      }),
    );
    expect(card(m).footer).toContain("*Reply-To:* ada@example.com");
    expect(card(slackMessage(email({ reply_to: ["ada@example.com"] }))).footer).not.toContain("Reply-To");
  });
});

describe("the email body", () => {
  it("drops the Google Groups footer, in either form", () => {
    expect(bodyText(email())).toBe("Hi Novawerk,\n\nWe'd like to pitch a project.\n\nAda");
    const text =
      "Hello\r\n\r\n-- \r\nYou received this message because you are subscribed to the Google Groups \"Novawerk Info\" group.\r\nTo unsubscribe…";
    expect(bodyText(email({ text }))).toBe("Hello");
  });

  it("joins lines a mail client wrapped, and keeps paragraphs, lists and quotes", () => {
    const wrapped =
      "This is a test of the new relay: email to info@novawerk.io should show up\nin #info-inbox on Slack.\nThanks,\nHaodong";
    expect(unwrap(wrapped)).toBe(
      "This is a test of the new relay: email to info@novawerk.io should show up in #info-inbox on Slack.\nThanks,\nHaodong",
    );
    const kept = [
      "We'd like to pitch three things that we have been working on this year:",
      "- a map of bouldering routes",
      "> On Monday, Ada wrote: a quoted line that is long enough to have been wrapped",
      "> by her mail client",
      "-- ",
      "Ada",
    ].join("\n");
    expect(unwrap(kept)).toBe(kept);
    expect(bodyText(email({ text: wrapped, html: "<p>ignored</p>" }))).toContain("show up in #info-inbox");
  });

  it("reads HTML-only emails as text", () => {
    expect(
      htmlToText(
        "<html><head><style>p{color:red}</style></head><body><p>Hi&nbsp;there &amp; welcome</p><div>Line<br>two &#127755;</div></body></html>",
      ),
    ).toBe("Hi there & welcome\nLine\ntwo 🌋");
    expect(bodyText(email({ text: null, html: "<p>Only HTML</p>" }))).toBe("Only HTML");
  });
});

describe("POST /webhooks/resend", () => {
  const db = {} as Database;
  const received = JSON.stringify({ type: "email.received", data: { email_id: "em_1" } });

  function setup(resend: () => Response = () => Response.json(email()), slack: () => Response = () => new Response("ok")) {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).startsWith("https://api.resend.com/") ? resend() : slack(),
    );
    const inboundMail: InboundMailOptions = {
      webhookSecret: SECRET,
      resendApiKey: "re_full",
      slackWebhookUrl: SLACK_URL,
      listId: "info.novawerk.io",
      fetch: fetchMock as typeof fetch,
    };
    return { ...makeApp(db, { inboundMail }), fetchMock };
  }

  const post = (app: ReturnType<typeof setup>["app"], body: string, headers = sign(body)) =>
    app.request("/webhooks/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": headers.id,
        "svix-timestamp": headers.timestamp,
        "svix-signature": headers.signature,
      },
      body,
    });

  it("doesn't exist without its config", async () => {
    const { app } = makeApp(db);
    expect((await post(app, received)).status).toBe(404);
  });

  it("refuses an unsigned or badly signed request", async () => {
    const { app, fetchMock } = setup();
    const res = await app.request("/webhooks/resend", { method: "POST", body: received });
    expect(res.status).toBe(401);
    expect((await post(app, received, sign(received, { secret: "whsec_b3RoZXI=" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the email from Resend and posts it to Slack", async () => {
    const { app, fetchMock } = setup();
    const res = await post(app, received);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "posted" });

    const [resendCall, slackCall] = fetchMock.mock.calls;
    expect(String(resendCall![0])).toBe("https://api.resend.com/emails/receiving/em_1?html_format=cid");
    expect(resendCall![1]!.headers).toEqual({ Authorization: "Bearer re_full" });
    expect(slackCall![0]).toBe(SLACK_URL);
    expect(JSON.parse(String(slackCall![1]!.body)).text).toBe(
      "📬 Can we pitch a climbing app? (from Ada Lovelace <ada@example.com>)",
    );
  });

  it("ignores other events and skips mail that didn't come through the group", async () => {
    const { app, fetchMock, logger } = setup(() => Response.json(email({ headers: { to: "info-slack@abc.resend.app" } })));
    const sent = JSON.stringify({ type: "email.sent", data: { email_id: "em_0" } });
    expect(await (await post(app, sent)).json()).toEqual({ ignored: "email.sent" });
    expect(fetchMock).not.toHaveBeenCalled();

    expect(await (await post(app, received)).json()).toEqual({ result: "not-from-list" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("[api] inbound email em_1 skipped: no List-ID <info.novawerk.io>");
  });

  it("answers 502 when Resend or Slack fails, so Resend retries, and logs no content", async () => {
    const down = setup(() => new Response("nope", { status: 500 }));
    expect((await post(down.app, received)).status).toBe(502);
    expect(down.logger.error).toHaveBeenCalledWith(
      "[api] inbound email em_1 not posted to Slack:",
      "Resend answered 500",
    );

    const slackDown = setup(undefined, () => new Response("invalid_blocks", { status: 400 }));
    expect((await post(slackDown.app, received)).status).toBe(502);
    expect(slackDown.logger.error).toHaveBeenCalledWith(
      "[api] inbound email em_1 not posted to Slack:",
      "Slack answered 400 invalid_blocks",
    );
  });

  it("answers 400 to a signed body it can't read", async () => {
    const { app } = setup();
    expect((await post(app, "not json")).status).toBe(400);
    expect((await post(app, JSON.stringify({ type: "email.received", data: {} }))).status).toBe(400);
  });
});
