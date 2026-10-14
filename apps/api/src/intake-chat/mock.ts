// Demo behaviour for LLM_PROVIDER=mock (local dev without an API key). Each visitor message
// fills the next missing field with what they typed, so the panel, the tool chips and the
// `draft` events all move like they do with a real model. Not for tests: tests script their
// own steps.

import type { MockStep } from "@nw/agent-harness";
import { emptyIntakeDraft, intakeDraftIssues, type IntakeDraft } from "@nw/contracts";

const DRAFT_BLOCK = /<draft mode="([^"]*)">\n([\s\S]*?)\n<\/draft>/;
const CV_TEXT_BLOCK = /<cv_text>\n([\s\S]*?)\n<\/cv_text>/;

/** Reads the draft back out of the context block (see context.ts). */
function draftFromContext(context: string | undefined): IntakeDraft {
  const match = context ? DRAFT_BLOCK.exec(context) : null;
  if (!match) return emptyIntakeDraft();
  const mode = match[1] === "pitch" || match[1] === "join" ? match[1] : null;
  try {
    const body = JSON.parse(match[2]!) as Record<string, unknown>;
    if (!mode) return { mode: null, pitch: (body.pitch ?? {}) as IntakeDraft["pitch"], join: (body.join ?? {}) as IntakeDraft["join"] };
    return { ...emptyIntakeDraft(mode), [mode]: body };
  } catch {
    return emptyIntakeDraft(mode);
  }
}

const LONG_FIELDS = new Set(["product", "userJourney", "referencesAndInnovation", "team", "timeline", "motivation"]);

function patchFor(draft: IntakeDraft, field: string, text: string): Record<string, unknown> {
  if (field === "mode") return { mode: /join|member|mitmach|beitreten|加入/i.test(text) ? "join" : "pitch" };
  const value =
    field === "functions" ? ["other"] : field === "availability" ? "2to5" : LONG_FIELDS.has(field) ? text.padEnd(20, ".") : text;
  return { [draft.mode!]: { [field]: value } };
}

/** From an attached CV: the first email address and up to three links. */
function fromCv(cv: string): Record<string, string> {
  const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(cv)?.[0];
  const links = cv.match(/\b(https?:\/\/|www\.|github\.com\/|linkedin\.com\/)\S+/g)?.slice(0, 3).join("\n");
  return { ...(email ? { email } : {}), ...(links ? { links } : {}) };
}

export const intakeMockStep: MockStep = (req) => {
  const last = req.messages.at(-1);
  if (last?.role === "user") {
    const draft = draftFromContext(last.context);
    const cv = last.context ? CV_TEXT_BLOCK.exec(last.context)?.[1] : undefined;
    if (last.context?.includes("no text we can read")) {
      return { text: "(mock model) I can't read that file, but it's attached for the team. Tell me what you do.", toolCalls: [] };
    }
    if (cv !== undefined) {
      const fields = fromCv(cv);
      if (!draft.mode || Object.keys(fields).length === 0) return { text: "(mock model) I read your CV. Tell me what you'd like to do here.", toolCalls: [] };
      return {
        text: "(mock model) I read your CV.",
        toolCalls: [{ id: `mock_${Date.now()}`, name: "update_draft", args: { [draft.mode]: fields } }],
      };
    }
    const next = Object.keys(intakeDraftIssues(draft))[0];
    const id = `mock_${Date.now()}`;
    if (!next) return { text: "", toolCalls: [{ id, name: "review_draft", args: {} }] };
    return {
      text: "(mock model) Noting that down.",
      toolCalls: [{ id, name: "update_draft", args: patchFor(draft, next, last.text) }],
    };
  }
  if (last?.role === "tool" && last.name === "review_draft") {
    return {
      text: last.content.includes("Ready to send")
        ? "(mock model) Everything is there. Check the panel, tick the consent box and press Send."
        : "(mock model) A few things are still missing. Tell me more.",
      toolCalls: [],
    };
  }
  return {
    text: " Saved to your draft. Tell me the next thing.",
    toolCalls: [],
  };
};
