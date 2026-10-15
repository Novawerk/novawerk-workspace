import { describe, expect, it } from "vitest";

import { sendSignInCode, signInCodeEmail } from "./sign-in.js";

describe("sendSignInCode", () => {
  it("only takes one address and a 6-digit code", async () => {
    const opts = { from: "Novawerk <info@novawerk.io>" };
    await expect(sendSignInCode("a@example.org, b@example.org", "123456", opts)).rejects.toThrow(/single email address/);
    await expect(sendSignInCode("a@example.org", "12345a", opts)).rejects.toThrow(/6 digits/);
    await expect(sendSignInCode("a@example.org", "Click http://evil", opts)).rejects.toThrow(/6 digits/);
  });

  it("logs instead of sending when no API key is set", async () => {
    expect(await sendSignInCode("a@example.org", "123456", { from: "Novawerk <info@novawerk.io>" })).toEqual({ mode: "logged" });
  });

  it("says the same thing every time, in both languages", () => {
    const { subject, text } = signInCodeEmail("042917");
    expect(subject).toBe("Your Novawerk sign-in code: 042917");
    expect(text).toContain("It works for 10 minutes");
    expect(text).toContain("你的 Novawerk 登录验证码：042917");
  });

  it("tells a contributor it is the task board, not membership", () => {
    const member = signInCodeEmail("042917");
    const contributor = signInCodeEmail("042917", "contributor");
    expect(contributor.subject).toBe("Your Novawerk task board code: 042917");
    expect(contributor.subject).not.toBe(member.subject);
    expect(contributor.text).toContain("It isn't Novawerk membership");
    expect(member.text).not.toContain("task board");
  });
});
