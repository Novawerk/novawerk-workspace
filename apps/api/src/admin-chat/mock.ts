// Demo behaviour for LLM_PROVIDER=mock (local dev without an API key): each question looks up
// the newest pitches, then answers from what the tool returned. Enough to see streaming text and
// tool chips in the panel. Tests script their own steps.

import type { MockStep } from "@nw/agent-harness";

export const adminMockStep: MockStep = (req) => {
  const last = req.messages.at(-1);
  if (last?.role === "user") {
    return {
      text: "(mock model) Let me look that up.",
      toolCalls: [{ id: `mock_${Date.now()}`, name: "list_submissions", args: { limit: 5 } }],
    };
  }
  if (last?.role === "tool") {
    let names: string[] = [];
    try {
      names = (JSON.parse(last.content) as { projectName?: string }[]).map((p) => p.projectName ?? "?");
    } catch {
      // Not JSON (an error result): fall through with no names.
    }
    return {
      text: names.length
        ? ` The newest pitches are: ${names.join(", ")}. With a real model I'd answer your question from these.`
        : " I found no pitches yet.",
      toolCalls: [],
    };
  }
  return { text: "(mock model) Ask me about pitches, applications, members or partners.", toolCalls: [] };
};
