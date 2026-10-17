import { describe, expect, it, vi } from "vitest";

import { sendWelcome, welcomeEmail } from "./welcome.js";

describe("the welcome email (NB-ADR-0014)", () => {
  it("greets by name, says what being a member means, and links the guide", () => {
    const { subject, text, html } = welcomeEmail("Lena Krause", "https://novawerk.io/anything");
    expect(subject).toBe("Welcome to Novawerk");
    expect(text).toContain("Hi Lena Krause,");
    expect(text).toContain("you are a member");
    expect(text).toContain("Maintainers run Novawerk");
    expect(text).toContain("Read the guide: https://novawerk.io/contribute/guide");
    expect(html).toContain('href="https://novawerk.io/contribute/guide"');
    expect(text).toContain("Open the team chat: https://novawerk.io/chat");
    expect(html).toContain('href="https://novawerk.io/chat"');
    expect(text).toContain("You get this email once");
  });

  it("escapes the name and keeps it to one short line", () => {
    const { text, html } = welcomeEmail('<img src=x onerror="alert(1)">\nBcc: evil@example.com', "https://novawerk.io");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; Bcc: evil@example.com");
    expect(text.split("\n")[0]).toBe('Hi <img src=x onerror="alert(1)"> Bcc: evil@example.com,');
    expect(welcomeEmail("x".repeat(500), "https://novawerk.io").text.split("\n")[0]!.length).toBeLessThan(110);
    expect(welcomeEmail("   ", "https://novawerk.io").text.startsWith("Hi,")).toBe(true);
  });

  it("goes to one address only, and is logged without a Resend key", async () => {
    await expect(sendWelcome("a@example.com, b@example.com", "Lena", { from: "Novawerk <info@novawerk.io>", webUrl: "https://novawerk.io" })).rejects.toThrow(
      /single email address/,
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendWelcome("lena@example.com", "Lena", { from: "Novawerk <info@novawerk.io>", webUrl: "https://novawerk.io" })).toEqual({ mode: "logged" });
    log.mockRestore();
  });
});
