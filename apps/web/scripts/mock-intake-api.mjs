#!/usr/bin/env node
// Mock of the Intake Agent API (apps/api) for working on /submit without the backend.
// Dev tool only: canned replies, in-memory sessions, no LLM, no database.
//
//   node apps/web/scripts/mock-intake-api.mjs            # http://localhost:8799
//   PORT=8800 node apps/web/scripts/mock-intake-api.mjs
//   NEXT_PUBLIC_API_URL=http://localhost:8799 pnpm --filter @nw/web exec next dev --port 3002
//
// Mirrors apps/api/src/intake-chat/routes.ts (greeting on start, 404 / 409 busy / 410 sent /
// 429 limit, 400 { issues } on Send) for the contract in @nw/contracts:
//   POST  /public/intake/sessions               → 201 IntakeSession
//   GET   /public/intake/sessions/:id           → IntakeSession | 404
//   POST  /public/intake/sessions/:id/messages  → text/event-stream of IntakeEvent
//   PATCH /public/intake/sessions/:id/draft     → IntakeSession
//   POST  /public/intake/sessions/:id/submit    → 201 { ok, id } | 400 { error, issues }
//   POST  /public/events                        → 204, and prints each usage event
//
// Each message fills the field the mock last asked about, then asks for the next one.
// Handy inputs in the chat:
//   fill      fill the whole draft with sample data
//   /slow     a slow reply (try Stop)
//   /error    the turn streams an `error` event
//   /drop     the connection drops mid-reply
// Other switches:
//   GET /__mock/unavailable?on=1   every intake route answers 503 (plain-form fallback); ?on=0 undoes it
//   MOCK_UNAVAILABLE=1             start in that state
//   MOCK_TURNS=3                   a short turn budget (the "n messages left" note, then 429)
//   an email containing "taken"    Send answers 400 with an issue on `email`

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8799);
const TURNS = Number(process.env.MOCK_TURNS ?? 40);
let unavailable = process.env.MOCK_UNAVAILABLE === "1";

/** @type {Map<string, any>} */
const sessions = new Map();

// ─── Draft logic ─────────────────────────────────────────────────────────────

const ORDER = ["product", "projectName", "userJourney", "referencesAndInnovation", "team", "timeline", "name", "email"];

const LONG = new Set(["product", "userJourney", "referencesAndInnovation", "team", "timeline"]);

const LABELS = {
  name: "Name",
  email: "Email",
  projectName: "Project name",
  product: "Product",
  userJourney: "User journey",
  referencesAndInnovation: "References and what's new",
  team: "Team",
  timeline: "Timeline",
  links: "Links",
};

// Same opening lines as apps/api/src/intake-chat/prompts/greeting-*.md.
const GREETING =
  "Hi, welcome to Novawerk. Tell me about the project you want to start. A few rough sentences are enough. I'll shape them into a pitch in the panel as we talk, and you can edit anything there. Nothing goes out until you press Send.\n\nSo: what do you want to build, and for whom?";

const SUBMITTED = "This conversation was already sent. Start a new chat if you want to send something else.";

const QUESTIONS = {
  product: "What do you want to build, and whose problem does it solve?",
  projectName: "Does it have a name yet? A working title is fine.",
  userJourney: "Walk us through it from the user's side. How do they find it, and what do they do with it?",
  referencesAndInnovation: "Are there similar products or projects? What's different about yours?",
  team: "Who's on it so far, and which skills are still missing?",
  timeline: "What do you want done by when? Rough is fine.",
  name: "What's your name?",
  email: "And your email, so we can reply?",
};

const SAMPLE = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  projectName: "Routes",
  product: "A map of safe cycling routes for kids, built from what parents report on their way to school.",
  userJourney:
    "A parent hears about it at school, opens the map, checks the route their kid takes and reports a dangerous crossing in two taps.",
  referencesAndInnovation:
    "Komoot and Strava show sporty routes. Nobody maps school routes from the parents' side, block by block.",
  team: "Me (product, research) and a friend who codes. We still need a designer and someone for outreach.",
  timeline: "A pilot with two schools by spring, all schools in the district by the end of next year.",
  links: "https://example.com/routes-prototype",
};

const missingFields = (draft) =>
  ORDER.filter((key) => {
    const value = draft[key];
    if (Array.isArray(value)) return value.length === 0;
    if (!value || !String(value).trim()) return true;
    if (LONG.has(key)) return String(value).trim().length < 20;
    if (key === "email") return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
    return false;
  });

/** Apply a visitor message to the draft. Returns the field keys it changed. */
function applyMessage(session, text) {
  const draft = session.draft.pitch;
  const before = JSON.stringify(draft);
  const changed = new Set();
  const set = (key, value) => {
    if (JSON.stringify(draft[key]) !== JSON.stringify(value)) changed.add(key);
    draft[key] = value;
  };

  if (text.trim().toLowerCase() === "fill") {
    for (const [key, value] of Object.entries(SAMPLE)) set(key, value);
    return [...changed];
  }

  let consumed = false;
  const email = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (email) {
    set("email", email[0]);
    consumed = session.asking === "email";
  }
  const name = text.match(/(?:[Mm]y name is|I'm|I am|[Tt]his is|[Cc]all me)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/u);
  if (name) {
    set("name", name[1]);
    consumed ||= session.asking === "name";
  }

  // Nothing left to ask (the draft is complete): only names and emails are picked up.
  const asking = session.asking === undefined ? ORDER[0] : session.asking;
  if (!consumed && asking) {
    const clean = text.trim();
    switch (asking) {
      case "projectName":
        set("projectName", clean.replace(/^(it'?s called|the name is|call it)\s+/i, "").slice(0, 120));
        break;
      case "name":
        if (!name) set("name", clean.slice(0, 100));
        break;
      case "email":
        break;
      default: {
        const previous = String(draft[asking] ?? "").trim();
        // A second answer to the same question adds to the first.
        set(asking, (previous && previous.length < 20 ? `${previous} ${clean}` : clean).slice(0, 2000));
      }
    }
  }
  return JSON.stringify(draft) === before ? [] : [...changed];
}

function replyFor(session, changed) {
  const missing = missingFields(session.draft.pitch);
  const asked = session.asking;
  const lead = changed.length
    ? `Thanks. I've put that under ${changed.map((k) => `**${LABELS[k] ?? k}**`).join(", ")}.`
    : "Got it.";

  if (missing.length === 0) {
    session.asking = null;
    return `${lead}\n\nThat's everything we need. Have a look at your draft, change anything you like, tick the box and press **Send**.`;
  }
  const next = missing[0];
  session.asking = next;
  if (next === asked && LONG.has(next) && String(session.draft.pitch[next] ?? "").trim()) {
    return `${lead}\n\nThat's a start. Can you say a bit more? We need a few sentences (20+ characters).`;
  }
  const left = missing.length > 1 ? `\n\n_${missing.length} things to go._` : "";
  return `${lead}\n\n${QUESTIONS[next]}${left}`;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cors(req, res) {
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, accept");
  res.setHeader("access-control-max-age", "600");
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const publicSession = (s) => ({
  id: s.id,
  draft: s.draft,
  status: s.status,
  messages: s.messages,
  turnsLeft: s.turnsLeft,
});

async function streamTurn(req, res, session, text) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  let open = true;
  res.on("close", () => {
    open = false;
  });
  const send = (event) => {
    if (open) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const now = new Date().toISOString();
  const turnId = randomUUID();
  const assistant = { id: randomUUID(), role: "assistant", parts: [], createdAt: now };
  session.messages.push({ id: randomUUID(), role: "user", text, createdAt: now });
  session.messages.push(assistant);
  session.turnsLeft -= 1;

  const command = text.trim().toLowerCase();
  const slow = command === "/slow";

  send({ type: "turn_start", turnId });
  res.write(": thinking\n\n");
  await sleep(400);

  if (command === "/error") {
    send({ type: "error", message: "The assistant ran into a problem. Please try again." });
    send({ type: "turn_end", turnId });
    return res.end();
  }

  const changed = command.startsWith("/") ? [] : applyMessage(session, text);
  if (changed.length) {
    const id = randomUUID();
    send({ type: "tool_call", id, name: "update_draft" });
    assistant.parts.push({ type: "tool", id, name: "update_draft", status: "running" });
    await sleep(350);
    send({ type: "tool_result", id, name: "update_draft", isError: false });
    assistant.parts.at(-1).status = "done";
    send({ type: "draft", draft: session.draft });
  }
  const reviewId = randomUUID();
  send({ type: "tool_call", id: reviewId, name: "review_draft" });
  assistant.parts.push({ type: "tool", id: reviewId, name: "review_draft", status: "running" });
  await sleep(250);
  send({ type: "tool_result", id: reviewId, name: "review_draft", isError: false });
  assistant.parts.at(-1).status = "done";

  let reply = replyFor(session, changed);
  if (slow) {
    reply = `Taking my time with this one. ${"Here is a long, slow sentence that keeps going so you can press Stop. ".repeat(12)}`;
  }
  const textPart = { type: "text", text: "" };
  assistant.parts.push(textPart);
  const words = reply.match(/\S+\s*/g) ?? [];
  for (let i = 0; i < words.length && open; i++) {
    if (command === "/drop" && i === 3) {
      res.destroy();
      return;
    }
    send({ type: "text_delta", text: words[i] });
    textPart.text += words[i];
    await sleep(slow ? 180 : 25 + Math.random() * 35);
  }
  send({ type: "turn_end", turnId });
  res.end();
}

const MAX = {
  name: 100,
  email: 200,
  projectName: 120,
  product: 2000,
  userJourney: 2000,
  referencesAndInnovation: 2000,
  team: 2000,
  timeline: 2000,
  links: 500,
};

function submitIssues(session) {
  const draft = session.draft.pitch;
  const issues = {};
  for (const key of missingFields(draft)) issues[key] = [`${LABELS[key]}: please fill this in`];
  if (String(draft.email ?? "").includes("taken")) {
    issues.email = ["We already have a submission from this email. Use another one, or write to info@novawerk.io."];
  }
  return issues;
}

const server = createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, "");
  console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${path}`);

  if (path === "/__mock/unavailable") {
    unavailable = url.searchParams.get("on") !== "0";
    return json(res, 200, { unavailable });
  }
  if (path === "/health") return json(res, 200, { ok: true });
  // Usage events (lib/analytics.ts): print them, so you can see what the site counts.
  if (path === "/public/events" && req.method === "POST") {
    const body = await readJson(req);
    for (const e of body?.events ?? []) console.log(`  · ${e.name} ${e.path} ${JSON.stringify(e.props ?? {})}`);
    return res.writeHead(204).end();
  }

  if (!path.startsWith("/public/intake/sessions")) return json(res, 404, { error: "Not found" });
  if (unavailable) return json(res, 503, { error: "The assistant is unavailable right now." });

  // POST /public/intake/sessions
  if (path === "/public/intake/sessions" && req.method === "POST") {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    // Honeypot filled: like the real API, nothing is created.
    if (body.website) return res.writeHead(204).end();
    if (body.mode !== undefined && body.mode !== "pitch") return json(res, 400, { error: "Invalid mode" });
    const greeting = [{ id: randomUUID(), role: "assistant", parts: [{ type: "text", text: GREETING }], createdAt: new Date().toISOString() }];
    const session = {
      id: randomUUID(),
      draft: { mode: "pitch", pitch: {} },
      status: "open",
      messages: greeting,
      turnsLeft: TURNS,
      asking: undefined,
      busy: false,
    };
    sessions.set(session.id, session);
    await sleep(150);
    return json(res, 201, publicSession(session));
  }

  const match = path.match(/^\/public\/intake\/sessions\/([^/]+)(?:\/(messages|draft|submit))?$/);
  if (!match) return json(res, 404, { error: "Not found" });
  const session = sessions.get(decodeURIComponent(match[1]));
  if (!session) return json(res, 404, { error: "Session not found" });
  const action = match[2];

  if (!action && req.method === "GET") return json(res, 200, publicSession(session));

  if (action === "messages" && req.method === "POST") {
    const body = await readJson(req);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 4000) {
      return json(res, 400, { error: "Invalid message", issues: { text: ["Write something first"] } });
    }
    if (session.status !== "open") return json(res, 410, { error: SUBMITTED });
    if (session.turnsLeft <= 0) {
      return json(res, 429, {
        error: "This chat reached its message limit. Check the panel and press Send, or start a new chat.",
      });
    }
    if (session.busy) {
      return json(res, 409, { error: "We're still answering your last message. Wait for it to finish, then send again." });
    }
    if (!session.draft.mode) session.draft.mode = "pitch";
    session.busy = true;
    try {
      return await streamTurn(req, res, session, text);
    } finally {
      session.busy = false;
    }
  }

  if (action === "draft" && req.method === "PATCH") {
    const body = await readJson(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    if (session.status !== "open") return json(res, 410, { error: SUBMITTED });
    const issues = {};
    if (body.mode !== undefined && body.mode !== "pitch") issues.mode = ["Invalid mode"];
    for (const [key, value] of Object.entries(body.pitch ?? {})) {
      if (typeof value === "string" && MAX[key] && value.length > MAX[key]) issues[key] = ["Too long"];
    }
    if (Object.keys(issues).length) return json(res, 400, { error: "Invalid draft", issues });
    session.draft.mode = "pitch";
    session.draft.pitch = { ...session.draft.pitch, ...(body.pitch ?? {}) };
    await sleep(120);
    return json(res, 200, publicSession(session));
  }

  if (action === "submit" && req.method === "POST") {
    const body = await readJson(req);
    if (session.status !== "open") return json(res, 410, { error: SUBMITTED });
    const issues = submitIssues(session);
    if (body?.consent !== true) issues.consent = ["Please accept the privacy note so we can contact you"];
    await sleep(300);
    if (Object.keys(issues).length) return json(res, 400, { error: "Please check the highlighted fields", issues });
    session.status = "submitted";
    return json(res, 201, { ok: true, id: randomUUID() });
  }

  return json(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Mock Intake API on http://localhost:${PORT}${unavailable ? " (unavailable: every route answers 503)" : ""}`);
});
