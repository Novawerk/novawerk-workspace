import { describe, expect, it } from "vitest";

import { notifyTeam } from "./notify.js";

describe("notifyTeam", () => {
  it("refuses to email anyone outside novawerk.io", async () => {
    await expect(
      notifyTeam({ subject: "x", text: "y" }, { from: "Novawerk <info@novawerk.io>", to: "someone@gmail.com" }),
    ).rejects.toThrow(/not a Novawerk inbox/);
  });

  it("logs instead of sending when no API key is set", async () => {
    const result = await notifyTeam(
      { subject: "New application", text: "…" },
      { from: "Novawerk <info@novawerk.io>", to: "info@novawerk.io" },
    );
    expect(result).toEqual({ mode: "logged" });
  });
});
