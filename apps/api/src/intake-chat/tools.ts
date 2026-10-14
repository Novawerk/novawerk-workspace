// The Intake Agent's tools. A fixed set in a fixed order (it is part of the model's cached
// prompt prefix): update_draft, review_draft. No tool can send anything: Send is the visitor's.
// The CV is the visitor's own upload in the panel: no tool can set or clear it.

import { z } from "zod";

import { defineTool, ToolRegistry, type ToolContext } from "@nw/agent-harness";
import {
  AVAILABILITY_OPTIONS,
  FUNCTION_OPTIONS,
  INTAKE_MODES,
  intakeDraftIssues,
  joinDraft,
  pitchDraft,
  type IntakeDraft,
  type JoinDraft,
  type PitchDraft,
} from "@nw/contracts";
import type { Database } from "@nw/db";

import { getIntakeSession, draftOf, mergeDraft } from "./store.js";

/** What the intake tools get for one turn. */
export interface IntakeToolApp {
  db: Database;
  /** Called with the new draft after every successful update_draft (→ a `draft` SSE event). */
  onDraft(draft: IntakeDraft): void;
}

const labels = (options: readonly { value: string; label: string }[]) =>
  options.map((o) => `"${o.value}" = ${o.label}`).join("; ");

/** The draft fields the agent fills in: everything but the CV. */
type AgentFields<T> = Exclude<keyof T, "resume">;
const agentPitchDraft = pitchDraft.omit({ resume: true });
const agentJoinDraft = joinDraft.omit({ resume: true });

const PITCH_DOCS: Record<AgentFields<PitchDraft>, string> = {
  name: "The visitor's name, as they gave it.",
  email: "Their email address, exactly as they wrote it.",
  projectName: "Working title of the project.",
  product: "What they want to build and the problem it solves. 20+ characters.",
  userJourney: "Who uses it and how, step by step, from the user's side. 20+ characters.",
  referencesAndInnovation: "What already exists and what is new or different here. 20+ characters.",
  team: "Who is on board and which skills are missing. 20+ characters.",
  timeline: "Rough milestones: what should exist when. 20+ characters.",
  links: "Optional links (deck, prototype, repo).",
};

const JOIN_DOCS: Record<AgentFields<JoinDraft>, string> = {
  name: "The visitor's name, as they gave it.",
  email: "Their email address, exactly as they wrote it.",
  city: "Optional: where they live.",
  functions: `The full list of functions they want to take on (replaces the previous list). Values: ${labels(FUNCTION_OPTIONS)}.`,
  background: "One line on who they are, max 300 characters.",
  motivation: "Why Novawerk and what they want to build or learn. 20+ characters.",
  availability: `Time they can give. One of: ${labels(AVAILABILITY_OPTIONS)}.`,
  links: "Optional links (portfolio, GitHub, LinkedIn).",
};

/** The contract's draft schema (same limits) with a description on every field, strict keys. */
function described<T extends z.ZodRawShape>(schema: z.ZodObject<T>, docs: Record<keyof T, string>, what: string) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [key, (field as z.ZodType).describe(docs[key as keyof T])]),
  ) as unknown as T;
  return z.strictObject(shape).describe(what);
}

const FIELDS = {
  pitch: Object.keys(agentPitchDraft.shape) as AgentFields<PitchDraft>[],
  join: Object.keys(agentJoinDraft.shape) as AgentFields<JoinDraft>[],
};

const isFilled = (value: unknown) => (Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim() !== "");

function missingList(issues: Record<string, string>) {
  return Object.entries(issues).map(([field, message]) => `- ${field}: ${message}`);
}

export const updateDraft = defineTool({
  name: "update_draft",
  description:
    "Save what you learned into the visitor's draft (the panel they see next to the chat). Call it as soon as you learn something, before you reply. Send only the fields you learned or changed; each value replaces that field. Write every value in English, whatever language you chat in: translate the visitor's answers faithfully, keep names and proper nouns, add nothing. Never invent values. This does not send anything.",
  schema: z.object({
    mode: z
      .enum(INTAKE_MODES)
      .optional()
      .describe('What the visitor wants: "pitch" (start a project) or "join" (become a Member).'),
    pitch: described(agentPitchDraft, PITCH_DOCS, "Project pitch fields.").optional(),
    join: described(agentJoinDraft, JOIN_DOCS, "Member application fields.").optional(),
  }),
  async run(args, ctx: ToolContext<IntakeToolApp>) {
    if (args.mode === undefined && !args.pitch && !args.join) throw new Error("Nothing to save: pass mode, pitch or join.");
    const draft = await mergeDraft(ctx.app.db, ctx.sessionId, args);
    if (!draft) throw new Error("This conversation was already sent. The draft can't change any more.");
    ctx.app.onDraft(draft);

    if (!draft.mode) return 'Saved. The mode is not set yet: find out whether they want to pitch or join, then save mode.';
    const fields = draft[draft.mode] as Record<string, unknown>;
    const filled = FIELDS[draft.mode].filter((f) => isFilled(fields[f]));
    const issues = intakeDraftIssues(draft);
    return [
      `Saved. Mode: ${draft.mode}. Filled: ${filled.join(", ") || "nothing yet"}.`,
      Object.keys(issues).length
        ? ["Still needed:", ...missingList(issues)].join("\n")
        : "Nothing required is missing. Call review_draft before you tell the visitor it is ready.",
    ].join("\n");
  },
});

export const reviewDraft = defineTool({
  name: "review_draft",
  description:
    "Check the visitor's current draft (including their own edits in the panel) against what Send requires. Call it before you tell the visitor the draft is ready. It returns a checklist.",
  schema: z.object({}),
  async run(_args, ctx: ToolContext<IntakeToolApp>) {
    const session = await getIntakeSession(ctx.app.db, ctx.sessionId);
    if (!session) throw new Error("Session not found.");
    if (session.status === "submitted") return "This draft was already sent by the visitor. Nothing more to do.";
    const draft = draftOf(session);
    const issues = intakeDraftIssues(draft);
    if (!draft.mode) return `Not ready.\n${missingList(issues).join("\n")}`;

    const fields = draft[draft.mode] as Record<string, unknown>;
    const lines = FIELDS[draft.mode].map((f) => {
      if (issues[f]) return `✗ ${f}: ${issues[f]}`;
      return isFilled(fields[f]) ? `✓ ${f}` : `· ${f} (optional, empty)`;
    });
    const ready = Object.keys(issues).length === 0;
    return [
      `Draft (${draft.mode}):`,
      ...lines,
      fields.resume ? "✓ CV (attached by the visitor)" : "· CV (optional; the visitor can attach one in the panel)",
      ready
        ? `Ready to send. You cannot send it: tell the visitor the draft is complete and they can read it over on the right, tick the privacy consent box and press Send.`
        : "Not ready yet. Ask about the first ✗ field. Consent and Send stay the visitor's own clicks.",
    ].join("\n");
  },
});

/** One registry per app instance: the tool set and order never change. */
export const createIntakeTools = () => new ToolRegistry<IntakeToolApp>([updateDraft, reviewDraft], { timeoutMs: 10_000 });
