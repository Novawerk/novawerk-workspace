import { describe, expect, it } from "vitest";

import {
  newsletterConfirmationEmail,
  newsletterConfirmUrl,
  newsletterUnsubscribe,
  sendNewsletterConfirmation,
} from "./newsletter.js";

const TOKEN = "a".repeat(43);
const opts = { from: "Novawerk <info@novawerk.io>" };

describe("sendNewsletterConfirmation", () => {
  it("only takes one address and a confirmation link", async () => {
    const link = newsletterConfirmUrl("https://api.novawerk.io", TOKEN);
    await expect(sendNewsletterConfirmation("a@example.org, b@example.org", link, opts)).rejects.toThrow(/single email address/);
    await expect(sendNewsletterConfirmation("a@example.org", "https://evil.example/x", opts)).rejects.toThrow(/confirmation link/);
    await expect(
      sendNewsletterConfirmation("a@example.org", `${link}&next=https://evil.example`, opts),
    ).rejects.toThrow(/confirmation link/);
    await expect(sendNewsletterConfirmation("a@example.org", "javascript:alert(1)", opts)).rejects.toThrow();
  });

  it("logs instead of sending when no API key is set", async () => {
    const link = newsletterConfirmUrl("http://localhost:8787/", TOKEN);
    expect(link).toBe(`http://localhost:8787/public/newsletter/confirm?token=${TOKEN}`);
    expect(await sendNewsletterConfirmation("a@example.org", link, opts)).toEqual({ mode: "logged" });
  });

  it("says the same thing every time, in both languages", () => {
    const { subject, text } = newsletterConfirmationEmail("https://api.novawerk.io/public/newsletter/confirm?token=x");
    expect(subject).toBe("Confirm your Novawerk newsletter subscription");
    expect(text).toContain("https://api.novawerk.io/public/newsletter/confirm?token=x");
    expect(text).toContain("72 hours");
    expect(text).toContain("订阅了 Novawerk 的通讯");
  });
});

describe("newsletterUnsubscribe", () => {
  const token = "0f8e7b1a-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
  const urls = { apiUrl: "https://api.novawerk.io", webUrl: "https://novawerk.io/" };

  it("builds the one-click headers and the footer link", () => {
    const parts = newsletterUnsubscribe(token, urls);
    expect(parts.headers).toEqual({
      "List-Unsubscribe": `<https://api.novawerk.io/public/newsletter/unsubscribe?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(parts.url).toBe(`https://novawerk.io/newsletter/unsubscribe?token=${token}`);
    expect(parts.footerText).toContain(parts.url);
  });

  it("refuses anything that isn't a token", () => {
    expect(() => newsletterUnsubscribe("x>, <https://evil.example", urls)).toThrow(/unsubscribe token/);
  });
});
