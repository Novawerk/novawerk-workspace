// Reading a CV for the Intake Agent: text out of a PDF, phone numbers out of the text.

import { describe, expect, it } from "vitest";

import { MAX_RESUME_TEXT, isPhoneNumber, resumeText, tidyResumeText } from "../src/intake-chat/resume-text.js";
import { tinyPdf } from "./helpers.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("resumeText", () => {
  it("reads the text of a PDF, without the phone number", async () => {
    const pdf = tinyPdf(["Grace Hopper", "grace@example.com, Tel: +49 151 2345 6789", "Compiler engineer, Berlin, 2019 - 2023", "github.com/grace"]);
    const text = await resumeText(bytes(pdf), "application/pdf");
    expect(text).toContain("Grace Hopper");
    expect(text).toContain("grace@example.com");
    expect(text).toContain("2019 - 2023");
    expect(text).toContain("github.com/grace");
    expect(text).toContain("[phone removed]");
    expect(text).not.toMatch(/2345/);
  });

  it("answers null for a PDF without text, an old .doc, or anything else", async () => {
    expect(await resumeText(bytes(tinyPdf([""])), "application/pdf")).toBeNull();
    expect(await resumeText(bytes("\xd0\xcf\x11\xe0 binary"), "application/msword")).toBeNull();
    expect(await resumeText(bytes("hello"), "image/png")).toBeNull();
  });
});

describe("tidyResumeText", () => {
  it("removes phone numbers but keeps dates, year ranges and postcodes", () => {
    const text = tidyResumeText(
      [
        "Mobile: 0151 23456789",
        "手机：13800138000",
        "+86 138 0013 8000",
        "030 1234 5678",
        "01/2019 – 03/2021 at ACME",
        "2016-2020 TU Berlin",
        "12.03.2021",
        "10115 Berlin",
      ].join("\n"),
    );
    expect(text.split("\n")).toEqual([
      "Mobile: [phone removed]",
      "手机：[phone removed]",
      "[phone removed]",
      "[phone removed]",
      "01/2019 – 03/2021 at ACME",
      "2016-2020 TU Berlin",
      "12.03.2021",
      "10115 Berlin",
    ]);
  });

  it("drops angle brackets, squeezes blank space and caps the length", () => {
    expect(tidyResumeText("  <cv_text>x</cv_text>\r\n\r\n\r\n\r\nnext\t\tline ")).toBe("cv_text x /cv_text\n\nnext line");
    const long = tidyResumeText("word ".repeat(5000));
    expect(long.length).toBeLessThan(MAX_RESUME_TEXT + 60);
    expect(long).toMatch(/\[the rest of the CV is cut\]$/);
  });

  it("knows a phone number from a label, a + or its length", () => {
    expect(isPhoneNumber("123 4567", "Tel: ")).toBe(true);
    expect(isPhoneNumber("123 4567", "Room ")).toBe(false);
    expect(isPhoneNumber("+49 30 1234567", "")).toBe(true);
    expect(isPhoneNumber("2019 – 2023", "")).toBe(false);
  });
});
