import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  POST_KINDS,
  CARD_DESIGNS,
  POST_TEMPLATES,
  emptyPostCard,
  emptyPostCopy,
  templatePlaceholders,
  linksIn,
  placeholdersIn,
  postCreateInput,
  postLabel,
  postPlatforms,
  postUpdateInput,
  xiaohongshuLinks,
} from "./index.js";
import {
  MAX_RESUME_BYTES,
  RESUME_PREFIX,
  applicationUpdateInput,
  financeEntryInput,
  memberApplicationInput,
  memberCreateInput,
  memberUpdateInput,
  newsletterConfirmQuery,
  newsletterSignupInput,
  newsletterUnsubscribeQuery,
  outboxDraftInput,
  outboxUpdateInput,
  parseAmountToCents,
  partnerInput,
  partnerUpdateInput,
  projectInput,
  projectSubmissionInput,
  projectTeamInput,
  projectUpdateInput,
  resumeRef,
  resumeUploadInput,
  submissionUpdateInput,
  toHandle,
  webEventsInput,
} from "./index.js";

const long = "x".repeat(40);

describe("projectSubmissionInput", () => {
  const valid = {
    name: "Ada",
    email: "ada@example.com",
    projectName: "Bouldering routes",
    product: long,
    userJourney: long,
    referencesAndInnovation: long,
    team: long,
    timeline: long,
    consent: true as const,
  };

  it("accepts a complete pitch", () => {
    expect(projectSubmissionInput.safeParse(valid).success).toBe(true);
  });

  it("requires every long-form section", () => {
    const result = projectSubmissionInput.safeParse({ ...valid, userJourney: "too short" });
    expect(result.success).toBe(false);
  });

  it("requires consent", () => {
    expect(projectSubmissionInput.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it("rejects a filled honeypot", () => {
    expect(projectSubmissionInput.safeParse({ ...valid, website: "spam" }).success).toBe(false);
  });
});

describe("memberApplicationInput", () => {
  const valid = {
    name: "Ada",
    email: "ada@example.com",
    functions: ["developer"],
    background: "Frontend developer",
    motivation: long,
    availability: "2to5",
    consent: true as const,
  };

  it("accepts a complete application", () => {
    expect(memberApplicationInput.safeParse(valid).success).toBe(true);
  });

  it("needs at least one known function", () => {
    expect(memberApplicationInput.safeParse({ ...valid, functions: [] }).success).toBe(false);
    expect(memberApplicationInput.safeParse({ ...valid, functions: ["wizard"] }).success).toBe(false);
  });
});

describe("CVs", () => {
  const pathname = "_resumes/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-grace-hopper-cv.pdf";
  const application = {
    name: "Ada",
    email: "ada@example.com",
    functions: ["developer"],
    background: "Frontend developer",
    motivation: long,
    availability: "2to5",
    consent: true as const,
  };

  it("are optional on both forms", () => {
    for (const resume of [undefined, null, { pathname, name: "Grace Hopper CV.pdf" }]) {
      expect(memberApplicationInput.safeParse({ ...application, resume }).success).toBe(true);
    }
  });

  it("must live under _resumes/, as the API names them", () => {
    for (const bad of [
      "ada/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-contract.pdf",
      "_resumes/../ada/contract.pdf",
      "_resumes/cv.pdf",
      "_resumes/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-CV.pdf",
      "projects/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-cv.pdf",
    ]) {
      expect(resumeRef.safeParse({ pathname: bad, name: "cv.pdf" }).success).toBe(false);
    }
    expect(resumeRef.safeParse({ pathname: `${RESUME_PREFIX}1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-cv`, name: "cv" }).success).toBe(true);
  });

  it("take PDF and Word, up to 5 MB", () => {
    const ok = { filename: "cv.pdf", contentType: "application/pdf", size: 1000 };
    expect(resumeUploadInput.safeParse(ok).success).toBe(true);
    expect(resumeUploadInput.safeParse({ ...ok, contentType: "image/png" }).success).toBe(false);
    expect(resumeUploadInput.safeParse({ ...ok, size: MAX_RESUME_BYTES + 1 }).success).toBe(false);
  });

  it("never block Send in the chat", async () => {
    const { intakeDraftIssues } = await import("./index.js");
    const join = { name: "Ada", email: "ada@example.com", functions: ["developer"], background: "Dev", motivation: long, availability: "2to5" as const };
    expect(intakeDraftIssues({ mode: "join", pitch: {}, join })).toEqual({});
    expect(intakeDraftIssues({ mode: "join", pitch: {}, join: { ...join, resume: null } })).toEqual({});
    expect(intakeDraftIssues({ mode: "join", pitch: {}, join: { ...join, resume: { pathname, name: "cv.pdf" } } })).toEqual({});
  });
});

describe("newsletterSignupInput", () => {
  it("trims and validates the email", () => {
    const result = newsletterSignupInput.safeParse({ email: "  ada@example.com " });
    expect(result.success && result.data.email).toBe("ada@example.com");
  });
});

describe("newsletter link tokens", () => {
  it("takes a 43-character base64url confirmation token", () => {
    expect(newsletterConfirmQuery.safeParse({ token: "a".repeat(42) + "_" }).success).toBe(true);
    expect(newsletterConfirmQuery.safeParse({ token: "a".repeat(42) }).success).toBe(false);
    expect(newsletterConfirmQuery.safeParse({ token: "a".repeat(42) + "=" }).success).toBe(false);
  });

  it("takes a UUID unsubscribe token", () => {
    expect(newsletterUnsubscribeQuery.safeParse({ token: "0f8e7b1a-2c3d-4e5f-8a9b-0c1d2e3f4a5b" }).success).toBe(true);
    expect(newsletterUnsubscribeQuery.safeParse({ token: "nope" }).success).toBe(false);
  });
});

describe("submissionUpdateInput", () => {
  it("accepts a partial update and null to clear", () => {
    const result = submissionUpdateInput.safeParse({ status: "discussing", reviewerId: null });
    expect(result.success && result.data).toEqual({ status: "discussing", reviewerId: null });
  });

  it("rejects an unknown status", () => {
    expect(submissionUpdateInput.safeParse({ status: "reviewing" }).success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(submissionUpdateInput.safeParse({}).success).toBe(false);
  });
});

describe("applicationUpdateInput", () => {
  it("accepts status, reviewerId, memberId and notes", () => {
    const patch = { status: "accepted", reviewerId: "haodong", memberId: "ada", notes: "Welcome call booked" };
    expect(applicationUpdateInput.safeParse(patch).success).toBe(true);
  });

  it("uses the application statuses, not the submission ones", () => {
    expect(applicationUpdateInput.safeParse({ status: "reviewing" }).success).toBe(true);
    expect(applicationUpdateInput.safeParse({ status: "discussing" }).success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(applicationUpdateInput.safeParse({ notes: undefined }).success).toBe(false);
  });
});

describe("intakeDraftIssues", () => {
  it("asks for a mode first", async () => {
    const { intakeDraftIssues, emptyIntakeDraft } = await import("./index.js");
    expect(intakeDraftIssues(emptyIntakeDraft())).toHaveProperty("mode");
  });

  it("lists the pitch fields still missing, and is empty when complete", async () => {
    const { intakeDraftIssues } = await import("./index.js");
    const partial = intakeDraftIssues({ mode: "pitch", pitch: { name: "Ada" }, join: {} });
    expect(Object.keys(partial)).toEqual(
      expect.arrayContaining(["email", "projectName", "product", "userJourney", "referencesAndInnovation", "team", "timeline"]),
    );
    expect(partial).not.toHaveProperty("consent");

    const complete = intakeDraftIssues({
      mode: "pitch",
      pitch: {
        name: "Ada",
        email: "ada@example.com",
        projectName: "Routes",
        product: long,
        userJourney: long,
        referencesAndInnovation: long,
        team: long,
        timeline: long,
      },
      join: {},
    });
    expect(complete).toEqual({});
  });

  it("uses the forms' own messages for fields that are still absent", async () => {
    const { intakeDraftIssues } = await import("./index.js");
    const pitch = intakeDraftIssues({ mode: "pitch", pitch: {}, join: {} });
    expect(pitch.name).toBe("Please enter your name");
    expect(pitch.projectName).toBe("Give it a working title");
    expect(pitch.product).toBe("Product: a bit more detail, please (20+ characters)");
    expect(pitch).not.toHaveProperty("links");
    const join = intakeDraftIssues({ mode: "join", pitch: {}, join: {} });
    expect(join).toMatchObject({ functions: "Pick at least one", availability: "Pick one", background: "Tell us a little about yourself" });
    expect(Object.values({ ...pitch, ...join }).join(" ")).not.toMatch(/received undefined/);
  });

  it("never asks the agent for consent", async () => {
    const { intakeDraftIssues } = await import("./index.js");
    const issues = intakeDraftIssues({
      mode: "join",
      pitch: {},
      join: { name: "Ada", email: "ada@example.com", functions: ["developer"], background: "Dev", motivation: long, availability: "2to5" },
    });
    expect(issues).toEqual({});
  });
});

describe("module graph", () => {
  // This package is imported as TypeScript source by Turbopack, Vite, tsx, vitest and tsc
  // (NodeNext), which disagree on relative specifiers ("./x" vs "./x.js"). Keep it one file.
  it("is a single module with no relative imports", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const modules = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(modules).toEqual(["index.ts"]);
    expect(readFileSync(`${dir}/index.ts`, "utf8")).not.toMatch(/from\s+["']\.\.?\//);
  });
});

describe("toHandle", () => {
  it("makes kebab-case handles and strips accents", () => {
    expect(toHandle("Ada Lovelace")).toBe("ada-lovelace");
    expect(toHandle("  Zoë Müller-Lüdenscheidt ")).toBe("zoe-muller-ludenscheidt");
    expect(toHandle("Kiez Pantry!! 2.0")).toBe("kiez-pantry-2-0");
    expect(toHandle("李雷")).toBe("");
  });

  it("never ends on a hyphen after cutting to length", () => {
    expect(toHandle("a".repeat(5) + " " + "b".repeat(10), 6)).toBe("aaaaa");
  });
});

describe("member inputs", () => {
  it("requires a kebab handle, a name and a valid email", () => {
    expect(memberCreateInput.safeParse({ id: "ada", displayName: "Ada", email: "ada@novawerk.io" }).success).toBe(true);
    for (const id of ["Ada", "a", "ada_l", "-ada", "ada--l"]) {
      expect(memberCreateInput.safeParse({ id, displayName: "Ada", email: "ada@novawerk.io" }).success, id).toBe(false);
    }
    expect(memberCreateInput.safeParse({ id: "ada", displayName: "", email: "x" }).success).toBe(false);
  });

  it("update needs at least one field", () => {
    expect(memberUpdateInput.safeParse({}).success).toBe(false);
    expect(memberUpdateInput.safeParse({ active: false }).success).toBe(true);
  });
});

describe("outbox inputs", () => {
  const draft = { to: "ada@example.org", subject: "Hello", body: "Hi Ada" };

  it("accepts one plain address, one-line subject, non-empty body", () => {
    expect(outboxDraftInput.safeParse(draft).success).toBe(true);
    expect(outboxDraftInput.safeParse({ ...draft, to: "Ada <ada@example.org>" }).success).toBe(false);
    expect(outboxDraftInput.safeParse({ ...draft, to: "a@b.org, c@d.org" }).success).toBe(false);
    expect(outboxDraftInput.safeParse({ ...draft, subject: "Hi\nBcc: x@y.org" }).success).toBe(false);
    expect(outboxDraftInput.safeParse({ ...draft, body: "   " }).success).toBe(false);
  });

  it("wants relatedTable and relatedId together", () => {
    expect(outboxDraftInput.safeParse({ ...draft, relatedTable: "partners" }).success).toBe(false);
    expect(outboxDraftInput.safeParse({ ...draft, relatedTable: "partners", relatedId: "acme" }).success).toBe(true);
    expect(outboxDraftInput.safeParse({ ...draft, relatedTable: "members", relatedId: "x" }).success).toBe(false);
  });

  it("update needs at least one field", () => {
    expect(outboxUpdateInput.safeParse({}).success).toBe(false);
    expect(outboxUpdateInput.safeParse({ subject: "New" }).success).toBe(true);
  });
});

describe("project inputs", () => {
  it("turns empty optional text into null and checks links", () => {
    const parsed = projectInput.parse({ slug: "kiez-pantry", title: "Kiez Pantry", tagline: " ", link: "" });
    expect(parsed).toMatchObject({ tagline: null, link: null });
    expect(projectInput.safeParse({ slug: "x-y", title: "T", link: "example.org" }).success).toBe(false);
    expect(projectInput.safeParse({ slug: "x-y", title: "T", coverUrl: "http://example.org/a.png" }).success).toBe(false);
    expect(projectInput.safeParse({ slug: "x-y", title: "T", coverUrl: "https://cdn.example.org/a.png" }).success).toBe(true);
    expect(projectInput.safeParse({ slug: "Kiez Pantry", title: "T" }).success).toBe(false);
  });

  it("update needs at least one field; null clears", () => {
    expect(projectUpdateInput.safeParse({}).success).toBe(false);
    expect(projectUpdateInput.parse({ coverUrl: null })).toEqual({ coverUrl: null });
  });

  it("team lists each member once with a role", () => {
    expect(projectTeamInput.safeParse({ members: [{ memberId: "ada", role: "Initiator" }] }).success).toBe(true);
    expect(projectTeamInput.safeParse({ members: [{ memberId: "ada", role: " " }] }).success).toBe(false);
    expect(
      projectTeamInput.safeParse({
        members: [
          { memberId: "ada", role: "Initiator" },
          { memberId: "ada", role: "Developer" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("partner inputs", () => {
  it("validates id, email and stage", () => {
    expect(partnerInput.safeParse({ id: "acme-foundation", name: "Acme", primaryEmail: "" }).data).toMatchObject({
      primaryEmail: null,
    });
    expect(partnerInput.safeParse({ id: "acme", name: "Acme", primaryEmail: "nope" }).success).toBe(false);
    expect(partnerInput.safeParse({ id: "acme", name: "Acme", stage: "won" }).success).toBe(false);
    expect(partnerUpdateInput.safeParse({ id: "other" }).success).toBe(false);
  });
});

describe("finance", () => {
  const entry = { entryDate: "2026-10-03", direction: "in", amountCents: 1250 } as const;

  it("takes positive integer cents in euro", () => {
    expect(financeEntryInput.safeParse(entry).success).toBe(true);
    expect(financeEntryInput.safeParse({ ...entry, amountCents: 12.5 }).success).toBe(false);
    expect(financeEntryInput.safeParse({ ...entry, amountCents: -100 }).success).toBe(false);
    expect(financeEntryInput.safeParse({ ...entry, currency: "USD" }).success).toBe(false);
    expect(financeEntryInput.safeParse({ ...entry, entryDate: "03.10.2026" }).success).toBe(false);
  });

  it("parses typed amounts without floats", () => {
    const cases: [string, number | null][] = [
      ["12", 1200],
      ["12.5", 1250],
      ["12,50", 1250],
      ["0.01", 1],
      ["1,234.56", 123456],
      ["1.234,56", 123456],
      ["1 234,56", 123456],
      ["€ 19.99", 1999],
      ["19,99 €", 1999],
      ["1,234", 123400],
      ["0.1", 10],
      ["0", null],
      ["-5", null],
      ["12.345", 1234500],
      ["12.3456", null],
      ["1,234.567", null],
      ["1.234.56", null],
      ["abc", null],
      ["", null],
    ];
    for (const [text, cents] of cases) expect(parseAmountToCents(text), text).toBe(cents);
  });
});

describe("webEventsInput", () => {
  const visit = "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f";
  const batch = (...events: unknown[]) => webEventsInput.safeParse({ visit, events });

  it("accepts the catalog's events and normalizes utm values", () => {
    const parsed = batch(
      { name: "page_view", path: "/", referrer: "https://github.com/", props: { utmSource: " LinkedIn " } },
      { name: "cta_click", path: "/about", props: { target: "join", placement: "footer" } },
      { name: "intake_close", path: "/submit", props: { mode: "pitch", turns: 3, filled: 5, required: 8, submitted: false } },
      { name: "form_step", path: "/join", props: { form: "join", step: 2, of: 6 } },
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data?.events[0]?.props).toEqual({ utmSource: "linkedin" });
  });

  it("rejects unknown events, extra props, free text and queries", () => {
    expect(batch({ name: "scroll", path: "/", props: {} }).success).toBe(false);
    expect(batch({ name: "intake_stop", path: "/submit", props: { mode: "pitch", note: "hi" } }).success).toBe(false);
    expect(batch({ name: "intake_field_edit", path: "/submit", props: { mode: "pitch", field: "my email is a@b.c" } }).success).toBe(false);
    expect(batch({ name: "page_view", path: "/?q=1", props: {} }).success).toBe(false);
    expect(batch({ name: "page_view", path: "https://evil.example/", props: {} }).success).toBe(false);
  });

  it("caps a batch at 25 events and needs a uuid visit", () => {
    const view = { name: "page_view", path: "/", props: {} };
    expect(batch(...Array(25).fill(view)).success).toBe(true);
    expect(batch(...Array(26).fill(view)).success).toBe(false);
    expect(webEventsInput.safeParse({ visit: "abc", events: [view] }).success).toBe(false);
  });
});

describe("posts", () => {
  it("names custom posts by their own name", () => {
    expect(postLabel("custom", 3, "Open day")).toBe("Open day");
    expect(postLabel("custom", 3, null)).toBe("Custom");
    expect(postLabel("progress", 4)).toBe("Progress · week 4");
  });

  it("goes to the platforms it names, else its kind's, and only those that read its languages", () => {
    expect(postPlatforms({ kind: "kickoff", platforms: null, langs: ["zh", "en"] })).toEqual(["xiaohongshu", "linkedin", "discord", "github"]);
    expect(postPlatforms({ kind: "kickoff", platforms: null, langs: ["en"] })).toEqual(["linkedin", "discord", "github"]);
    expect(postPlatforms({ kind: "custom", platforms: ["linkedin", "xiaohongshu"], langs: ["zh"] })).toEqual(["xiaohongshu"]);
  });

  it("only counts placeholders in the languages a post has", () => {
    const content = {
      zh: { ...emptyPostCopy(), body: "【待补充：日期】" },
      en: { title: "[To fill in: title]", body: "", card: emptyPostCard() },
    };
    expect(placeholdersIn(content)).toEqual(["【待补充：日期】", "[To fill in: title]"]);
    expect(placeholdersIn(content, ["zh"])).toEqual(["【待补充：日期】"]);
  });

  it("finds web addresses and emails, which a Xiaohongshu version can't carry", () => {
    const zh = {
      title: "YIMA 上线了",
      body: "立即使用：novawerk.io/portfolio/yima\n加入：留言 / info@novawerk.io / Discord\n代码在 https://github.com/novawerk/yima。",
      card: { ...emptyPostCard(), footer: "novawerk.io" },
    };
    expect(linksIn(zh)).toEqual(["novawerk.io/portfolio/yima", "info@novawerk.io", "https://github.com/novawerk/yima", "novawerk.io"]);
    // Plain text with dots is not a link.
    expect(linksIn({ ...emptyPostCopy(), body: "Novawerk e.V. i.G. 用 Node.js 写，v1.2 上线。" })).toEqual([]);

    const content = { zh, en: { ...emptyPostCopy(), body: "Try it: novawerk.io/portfolio/yima" } };
    expect(xiaohongshuLinks({ kind: "launch", platforms: null, langs: ["zh", "en"] }, content)).toHaveLength(4);
    // English versions and Chinese posts that skip Xiaohongshu may keep their links.
    expect(xiaohongshuLinks({ kind: "launch", platforms: ["discord"], langs: ["zh", "en"] }, content)).toEqual([]);
    expect(xiaohongshuLinks({ kind: "launch", platforms: null, langs: ["en"] }, content)).toEqual([]);
  });

  it("needs a name for a custom post and a project for a lifecycle one", () => {
    expect(postCreateInput.safeParse({ kind: "custom", label: "Open day" }).success).toBe(true);
    expect(postCreateInput.safeParse({ kind: "custom" }).error?.issues[0]?.path).toEqual(["label"]);
    expect(postCreateInput.safeParse({ kind: "launch" }).error?.issues[0]?.path).toEqual(["projectId"]);
    expect(postCreateInput.parse({ kind: "custom", label: "X", langs: ["en", "zh", "en"] }).langs).toEqual(["zh", "en"]);
  });

  it("takes https pictures, and http only from this machine", () => {
    const images = (url: string) => postUpdateInput.safeParse({ images: [{ url }] }).success;
    expect(images("https://store.public.blob.vercel-storage.com/x.png")).toBe(true);
    expect(images("http://localhost:8787/dev/files/posts/x.png")).toBe(true);
    expect(images("http://example.org/x.png")).toBe(false);
    expect(postUpdateInput.parse({ photoUrl: "" }).photoUrl).toBeNull();
  });
});

describe("post templates", () => {
  it("has one per kind, with an example that fits a post", () => {
    for (const kind of POST_KINDS) {
      const t = POST_TEMPLATES[kind];
      expect(t.kind).toBe(kind);
      expect(postUpdateInput.safeParse({ content: t.example }).success).toBe(true);
      expect(placeholdersIn(t.example)).toEqual([]);
    }
  });

  it("names a card design for every kind", () => {
    expect(Object.keys(CARD_DESIGNS).sort()).toEqual([...POST_KINDS].sort());
  });

  it("turns a template's fields into the gaps of a fresh post", () => {
    expect(templatePlaceholders("progress", "en").split("\n\n")[0]).toBe("[To fill in: What got done, and by whom]");
    expect(placeholdersIn({ zh: { ...emptyPostCopy(), body: templatePlaceholders("launch", "zh") }, en: emptyPostCopy() })).toHaveLength(7);
  });
});
