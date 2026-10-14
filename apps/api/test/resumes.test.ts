// CVs attached to a pitch or an application, through a fake private store: the upload ticket,
// the check when the form is sent (plain form and chat), the agent never touching the field,
// members opening the file, and the daily sweep of CVs nobody sent.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockProvider, type MockStep, type ToolCall } from "@nw/agent-harness";
import { MAX_RESUME_BYTES, RESUME_ATTACHED_TEXT, type IntakeEvent, type IntakeSession } from "@nw/contracts";
import { agentSessions, memberApplications, members, projectSubmissions, type Database } from "@nw/db";

import { RESUME_TICKETS_PER_HOUR } from "../src/routes/public.js";
import { UNSENT_RESUME_HOURS, deleteUnsentResumes } from "../src/resume-cleanup.js";
import {
  FakeFiles,
  TEST_MEMBERS,
  adminFetch,
  createTestDb,
  makeApp,
  postJson,
  resetDb,
  tinyPdf,
  validApplication,
  validSubmission,
} from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
});

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const HOUR = 60 * 60 * 1000;

/** Ask for a ticket and "upload" the file into the fake store, like the browser does. */
async function upload(app: ReturnType<typeof makeApp>["app"], files: FakeFiles, filename = "Grace Hopper CV.pdf", contentType = PDF) {
  const res = await app.request("/public/uploads/resume", postJson({ filename, contentType, size: 80_000 }));
  expect(res.status).toBe(200);
  const ticket = (await res.json()) as { token: string; pathname: string };
  files.privateFiles.set(ticket.pathname, { contentType, body: "%PDF-1.7 cv" });
  return { pathname: ticket.pathname, name: filename };
}

describe("POST /public/uploads/resume", () => {
  it("issues a private ticket for one CV under _resumes/", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const res = await app.request("/public/uploads/resume", postJson({ filename: "Grace Hopper CV.PDF", contentType: PDF, size: 80_000 }));
    expect(res.status).toBe(200);
    const ticket = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(ticket).sort()).toEqual(["pathname", "token"]);
    expect(ticket.pathname).toMatch(/^_resumes\/[0-9a-f-]{36}-grace-hopper-cv\.pdf$/);
    expect(files.tickets).toEqual([
      { access: "private", request: { pathname: ticket.pathname, contentTypes: [PDF], maxBytes: MAX_RESUME_BYTES } },
    ]);
  });

  it("takes PDF and Word only, up to 5 MB", async () => {
    const { app } = makeApp(db, { files: new FakeFiles() });
    const ask = (body: object) => app.request("/public/uploads/resume", postJson(body));
    expect((await ask({ filename: "cv.docx", contentType: DOCX, size: 1 })).status).toBe(200);
    expect((await ask({ filename: "cv.png", contentType: "image/png", size: 1 })).status).toBe(400);
    expect((await ask({ filename: "cv.pdf", contentType: PDF, size: MAX_RESUME_BYTES + 1 })).status).toBe(400);
    expect((await ask({ filename: "", contentType: PDF, size: 1 })).status).toBe(400);
  });

  it("answers 503 without the private store", async () => {
    for (const files of [undefined, new FakeFiles({ private: false })]) {
      const { app } = makeApp(db, files ? { files } : {});
      const res = await app.request("/public/uploads/resume", postJson({ filename: "cv.pdf", contentType: PDF, size: 1 }));
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: string }).error).toContain("Add a link to your CV instead");
    }
  });

  it("limits tickets per IP", async () => {
    const { app } = makeApp(db, { files: new FakeFiles() });
    const ask = (ip: string) =>
      app.request("/public/uploads/resume", postJson({ filename: "cv.pdf", contentType: PDF, size: 1 }, { "X-Forwarded-For": ip }));
    for (let i = 0; i < RESUME_TICKETS_PER_HOUR; i++) expect((await ask("203.0.113.9")).status).toBe(200);
    expect((await ask("203.0.113.9")).status).toBe(429);
    expect((await ask("198.51.100.4")).status).toBe(200);
  });
});

describe("the plain forms with a CV", () => {
  it("store the CV with an application and name it in the team email", async () => {
    const files = new FakeFiles();
    const { app, sent } = makeApp(db, { files });
    const resume = await upload(app, files);
    const res = await app.request("/public/applications", postJson({ ...validApplication, resume }));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(memberApplications);
    expect(row).toMatchObject({ resumePathname: resume.pathname, resumeName: "Grace Hopper CV.pdf" });
    expect(sent[0]?.text).toContain("CV: Grace Hopper CV.pdf (open it in the admin panel)");
  });

  it("store the CV with a pitch", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const resume = await upload(app, files, "ada.docx", DOCX);
    expect((await app.request("/public/submissions", postJson({ ...validSubmission, resume }))).status).toBe(201);
    const [row] = await db.select().from(projectSubmissions);
    expect(row).toMatchObject({ resumePathname: resume.pathname, resumeName: "ada.docx" });
  });

  it("work without a CV, as before", async () => {
    const { app, sent } = makeApp(db, { files: new FakeFiles() });
    expect((await app.request("/public/applications", postJson({ ...validApplication, resume: null }))).status).toBe(201);
    expect((await db.select().from(memberApplications))[0]).toMatchObject({ resumePathname: null, resumeName: null });
    expect(sent[0]?.text).toContain("CV: —");
  });

  it("refuse a CV that isn't in the store any more, and store nothing", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const resume = await upload(app, files);
    files.privateFiles.delete(resume.pathname);
    const res = await app.request("/public/applications", postJson({ ...validApplication, resume }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: Record<string, string[]> }).issues).toEqual({
      resume: ["We can't find your CV any more. Please attach it again."],
    });
    expect(await db.select().from(memberApplications)).toEqual([]);
  });

  it("refuse anything outside _resumes/, such as a member's own document", async () => {
    const files = new FakeFiles();
    files.privateFiles.set("ada/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-contract.pdf", { contentType: PDF, body: "%PDF" });
    const { app } = makeApp(db, { files });
    for (const pathname of ["ada/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-contract.pdf", "_resumes/../ada/contract.pdf", "_resumes/cv.pdf"]) {
      const res = await app.request("/public/submissions", postJson({ ...validSubmission, resume: { pathname, name: "cv.pdf" } }));
      expect(res.status).toBe(400);
      expect(Object.keys(((await res.json()) as { issues: object }).issues)).toEqual(["resume"]);
    }
  });
});

// ─── The chat ────────────────────────────────────────────────────────────────

const call =
  (...calls: Omit<ToolCall, "id">[]): MockStep =>
  () => ({ text: "", toolCalls: calls.map((c, i) => ({ id: `call_${c.name}_${i}`, ...c })) });
const say =
  (text: string): MockStep =>
  () => ({ text, toolCalls: [] });

function chat(script: MockStep[] = []) {
  const files = new FakeFiles();
  const provider = new MockProvider(script);
  const made = makeApp(db, { files, intakeChat: { provider } });
  const { app } = made;
  const headers = { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.7" };
  const start = async (mode: "pitch" | "join") =>
    (await (await app.request("/public/intake/sessions", { method: "POST", headers, body: JSON.stringify({ mode }) })).json()) as IntakeSession;
  const patch = (id: string, body: unknown) =>
    app.request(`/public/intake/sessions/${id}/draft`, { method: "PATCH", headers, body: JSON.stringify(body) });
  const message = async (id: string, text: string) =>
    (await app.request(`/public/intake/sessions/${id}/messages`, { method: "POST", headers, body: JSON.stringify({ text }) })).text();
  const submit = (id: string) =>
    app.request(`/public/intake/sessions/${id}/submit`, { method: "POST", headers, body: JSON.stringify({ consent: true }) });
  const attach = (id: string, body: unknown) =>
    app.request(`/public/intake/sessions/${id}/resume`, { method: "POST", headers, body: JSON.stringify(body) });
  /** Upload a CV with this content, as the browser does, and return what the chat sends. */
  const stored = (filename: string, contentType: string, body: string) => {
    const pathname = `_resumes/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d1${files.privateFiles.size}-${filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
    files.privateFiles.set(pathname, { contentType, body });
    return { pathname, name: filename };
  };
  return { ...made, files, provider, start, patch, message, submit, attach, stored };
}

/** One JSON IntakeEvent per `data:` line. */
const events = async (res: Response) =>
  (await res.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as IntakeEvent);

const contextOf = (t: ReturnType<typeof chat>, request: number) => {
  const user = t.provider.requests[request]!.messages.filter((m) => m.role === "user").at(-1);
  return user?.role === "user" ? (user.context ?? "") : "";
};

const { consent: _c, ...joinFields } = validApplication;

describe("the chat with a CV", () => {
  it("keeps the visitor's CV in the draft, lets them remove it, and sends it with the application", async () => {
    const t = chat();
    const session = await t.start("join");
    const resume = await upload(t.app, t.files);

    const attached = (await (await t.patch(session.id, { join: { ...joinFields, resume } })).json()) as IntakeSession;
    expect(attached.draft.join.resume).toEqual(resume);
    const removed = (await (await t.patch(session.id, { join: { resume: null } })).json()) as IntakeSession;
    expect(removed.draft.join.resume).toBeNull();
    await t.patch(session.id, { join: { resume } });

    expect((await t.submit(session.id)).status).toBe(201);
    expect((await db.select().from(memberApplications))[0]).toMatchObject({ resumePathname: resume.pathname, resumeName: resume.name });
  });

  it("refuses Send when the CV is gone, and keeps the chat open", async () => {
    const t = chat();
    const session = await t.start("pitch");
    const resume = await upload(t.app, t.files);
    const { consent: _, ...pitchFields } = validSubmission;
    await t.patch(session.id, { pitch: { ...pitchFields, resume } });
    t.files.privateFiles.clear();

    const res = await t.submit(session.id);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: object }).issues).toHaveProperty("resume");
    expect(await db.select().from(projectSubmissions)).toEqual([]);
    expect((await db.select().from(agentSessions))[0]?.status).toBe("open");
  });

  it("validates the CV in a draft edit", async () => {
    const t = chat();
    const session = await t.start("join");
    const res = await t.patch(session.id, { join: { resume: { pathname: "ada/contract.pdf", name: "x.pdf" } } });
    expect(res.status).toBe(400);
  });

  it("never lets the agent set the CV, and never shows it the file name", async () => {
    const pathname = "_resumes/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-cv.pdf";
    const t = chat([
      call({ name: "update_draft", args: { join: { resume: { pathname, name: "cv.pdf" } } } }),
      say("I can't attach files."),
      call({ name: "review_draft", args: {} }),
      say("Your CV is attached."),
    ]);
    const session = await t.start("join");
    await t.message(session.id, "Attach my CV please");
    const toolResult = t.provider.requests[1]!.messages.at(-1)!;
    expect(toolResult.role === "tool" && toolResult.content).toContain("Invalid arguments");
    expect(contextOf(t, 0)).toContain("No CV attached (optional).");

    // Attached in the panel: the agent learns that there is one, nothing more.
    const resume = await upload(t.app, t.files, "Grace Hopper CV.pdf");
    await t.patch(session.id, { join: { resume } });
    await t.message(session.id, "I attached it in the panel");
    expect(contextOf(t, 2)).toContain("The visitor attached a CV.");
    expect(contextOf(t, 2)).not.toContain("Grace Hopper CV");
    expect(contextOf(t, 2)).not.toContain("_resumes/");
    expect(contextOf(t, 2)).not.toContain("<cv_text>");
    const review = t.provider.requests[3]!.messages.at(-1)!;
    expect(review.role === "tool" && review.content).toContain("✓ CV (attached by the visitor)");
  });
});

describe("POST /public/intake/sessions/:id/resume", () => {
  const CV = ["Grace Hopper", "grace@example.com, Tel: +49 151 2345 6789", "Compiler engineer, Berlin", "github.com/grace"];

  it("attaches the CV, has the agent read it in a turn of its own, and fills the draft", async () => {
    const t = chat([
      call({ name: "update_draft", args: { join: { email: "grace@example.com", background: "Compiler engineer", city: "Berlin" } } }),
      say("I filled in your email, background and city. What would you like to work on?"),
    ]);
    const session = await t.start("join");
    const resume = t.stored("Grace Hopper CV.pdf", "application/pdf", tinyPdf(CV));

    const res = await t.attach(session.id, { resume, mode: "join" });
    expect(res.status).toBe(200);
    const sent = await events(res);
    // The panel learns about the CV before the agent says anything.
    expect(sent[0]).toMatchObject({ type: "draft", draft: { join: { resume } } });
    expect(sent.filter((e) => e.type === "draft").at(-1)).toMatchObject({
      draft: { join: { resume, email: "grace@example.com", background: "Compiler engineer", city: "Berlin" } },
    });
    expect(sent.at(-1)).toMatchObject({ type: "turn_end" });

    const context = contextOf(t, 0);
    expect(context).toContain("The visitor just attached their CV");
    expect(context).toMatch(/<cv_text>\nGrace Hopper[\s\S]*github\.com\/grace\n<\/cv_text>/);
    expect(context).toContain("[phone removed]");
    expect(context).not.toContain("2345 6789");
    expect(context).not.toContain("_resumes/");

    // The chat shows the visitor's "I attached my CV." and the reply; the turn counts.
    const after = (await (await t.app.request(`/public/intake/sessions/${session.id}`)).json()) as IntakeSession;
    expect(after.messages.at(-2)).toMatchObject({ role: "user", text: RESUME_ATTACHED_TEXT });
    expect(after.turnsLeft).toBe(39);
    expect(after.draft.join.resume).toEqual(resume);
  });

  it("only that turn carries the text", async () => {
    const t = chat([say("Thanks for your CV."), say("Sure.")]);
    const session = await t.start("join");
    await (await t.attach(session.id, { resume: t.stored("cv.pdf", "application/pdf", tinyPdf(CV)) })).text();
    await t.message(session.id, "What next?");
    expect(contextOf(t, 1)).toContain("The visitor attached a CV.");
    expect(contextOf(t, 1)).not.toContain("<cv_text>");
  });

  it("attaches a CV it can't read, and says so to the agent", async () => {
    const t = chat([say("Got it, the team will see it.")]);
    const session = await t.start("pitch");
    const resume = t.stored("cv.doc", "application/msword", "\xd0\xcf\x11\xe0 binary");
    const res = await t.attach(session.id, { resume });
    expect(res.status).toBe(200);
    await res.text();
    const context = contextOf(t, 0);
    expect(context).toContain("no text we can read");
    expect(context).not.toContain("<cv_text>");
    expect(((await (await t.app.request(`/public/intake/sessions/${session.id}`)).json()) as IntakeSession).draft.pitch.resume).toEqual(resume);
  });

  it("refuses a CV that isn't uploaded, without using a turn", async () => {
    const t = chat();
    const session = await t.start("join");
    const res = await t.attach(session.id, { resume: { pathname: "_resumes/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-cv.pdf", name: "cv.pdf" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: object }).issues).toHaveProperty("resume");
    const after = (await (await t.app.request(`/public/intake/sessions/${session.id}`)).json()) as IntakeSession;
    expect(after.turnsLeft).toBe(40);
    expect(t.provider.requests).toHaveLength(0);
  });

  it("validates the request, answers 404 and 410 like the chat, and 400 without the file store", async () => {
    const t = chat([say("ok")]);
    const session = await t.start("join");
    expect((await t.attach(session.id, { resume: { pathname: "ada/contract.pdf", name: "x" } })).status).toBe(400);
    expect((await t.attach("00000000-0000-4000-8000-000000000000", { resume: t.stored("cv.pdf", "application/pdf", "x") })).status).toBe(404);

    await t.patch(session.id, { join: joinFields });
    expect((await t.submit(session.id)).status).toBe(201);
    expect((await t.attach(session.id, { resume: t.stored("cv2.pdf", "application/pdf", "x") })).status).toBe(410);

    const off = makeApp(db, { files: new FakeFiles({ private: false }), intakeChat: { provider: new MockProvider([]) } }).app;
    const res = await off.request(`/public/intake/sessions/${session.id}/resume`, postJson({ resume: { pathname: "_resumes/1f0c7a52-8d7e-4f8e-9a51-2b1e6f0c9d11-cv.pdf", name: "cv.pdf" } }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: Record<string, string[]> }).issues.resume?.[0]).toContain("CV uploads are off");
  });
});

// ─── Members open it ─────────────────────────────────────────────────────────

describe("GET /admin/applications/:id/resume and /admin/submissions/:id/resume", () => {
  beforeEach(async () => {
    await db.insert(members).values(TEST_MEMBERS);
  });

  it("streams the CV inline for a signed-in member, under the name the visitor gave it", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const resume = await upload(app, files, "Grace Hopper CV.pdf");
    await app.request("/public/applications", postJson({ ...validApplication, resume }));
    const [row] = await db.select().from(memberApplications);

    expect((await adminFetch(app, "GET", `/admin/applications/${row!.id}/resume`, undefined, null)).status).toBe(401);
    const res = await adminFetch(app, "GET", `/admin/applications/${row!.id}/resume`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(PDF);
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="Grace Hopper CV.pdf"; filename*=UTF-8''Grace%20Hopper%20CV.pdf`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toBe("%PDF-1.7 cv");
  });

  it("downloads a Word CV with a pitch, and answers 404 without one", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const resume = await upload(app, files, "ada", DOCX);
    await app.request("/public/submissions", postJson({ ...validSubmission, resume }));
    await app.request("/public/submissions", postJson(validSubmission));
    const rows = await db.select().from(projectSubmissions);
    const withCv = rows.find((r) => r.resumePathname)!;
    const without = rows.find((r) => !r.resumePathname)!;

    const res = await adminFetch(app, "GET", `/admin/submissions/${withCv.id}/resume`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="ada"/);
    expect((await adminFetch(app, "GET", `/admin/submissions/${without.id}/resume`)).status).toBe(404);
    expect((await adminFetch(app, "GET", `/admin/submissions/not-a-uuid/resume`)).status).toBe(404);

    files.privateFiles.clear();
    const gone = await adminFetch(app, "GET", `/admin/submissions/${withCv.id}/resume`);
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { error: string }).error).toBe("The CV is missing from storage");
  });
});

// ─── The sweep ───────────────────────────────────────────────────────────────

describe("deleteUnsentResumes", () => {
  const now = new Date("2026-10-20T03:30:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * HOUR);
  const key = (n: number) => `_resumes/00000000-0000-4000-8000-00000000000${n}-cv.pdf`;
  const put = (files: FakeFiles, pathname: string, uploadedAt: Date) =>
    files.privateFiles.set(pathname, { contentType: PDF, body: "%PDF", uploadedAt });

  it("deletes old CVs nothing points to, and keeps sent ones, ones in an open chat and fresh ones", async () => {
    const files = new FakeFiles();
    const old = hoursAgo(UNSENT_RESUME_HOURS + 1);
    for (const n of [1, 2, 3, 4, 5, 6]) put(files, key(n), old);
    put(files, key(7), hoursAgo(UNSENT_RESUME_HOURS - 1));
    files.privateFiles.set("ada/contract.pdf", { contentType: PDF, body: "%PDF", uploadedAt: old });

    await db.insert(memberApplications).values({ ...validApplication, consentAt: old, resumePathname: key(1), resumeName: "cv.pdf" });
    await db.insert(projectSubmissions).values({ ...validSubmission, consentAt: old, resumePathname: key(2), resumeName: "cv.pdf" });
    const ref = (n: number) => ({ pathname: key(n), name: "cv.pdf" });
    await db.insert(agentSessions).values([
      { agent: "intake", systemPrompt: "s", draft: { mode: "join", pitch: {}, join: { resume: ref(3) } } },
      { agent: "intake", systemPrompt: "s", draft: { mode: "pitch", pitch: { resume: ref(4) }, join: {} } },
      // A sent chat no longer holds its CV: the row does (or did).
      { agent: "intake", systemPrompt: "s", status: "submitted", draft: { mode: "join", pitch: {}, join: { resume: ref(5) } } },
    ]);

    expect(await deleteUnsentResumes(db, files, now)).toBe(2);
    expect(files.deletedPrivate.sort()).toEqual([key(5), key(6)]);
    expect([...files.privateFiles.keys()].sort()).toEqual([key(1), key(2), key(3), key(4), key(7), "ada/contract.pdf"].sort());
  });

  it("does nothing without the private store", async () => {
    expect(await deleteUnsentResumes(db, undefined, now)).toBe(0);
    expect(await deleteUnsentResumes(db, new FakeFiles({ private: false }), now)).toBe(0);
  });

  it("runs from Vercel Cron", async () => {
    const files = new FakeFiles();
    put(files, key(1), new Date(Date.now() - (UNSENT_RESUME_HOURS + 1) * HOUR));
    const { app } = makeApp(db, { files, env: { cronSecret: "cron-secret-0123456789" } });
    expect((await app.request("/cron/resume-cleanup")).status).toBe(401);
    const res = await app.request("/cron/resume-cleanup", { headers: { Authorization: "Bearer cron-secret-0123456789" } });
    expect(await res.json()).toEqual({ deleted: 1 });
  });
});
