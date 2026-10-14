// Stored history → what the chat shows. Must match what the streaming UI builds from SSE
// events, so a reload looks the same as the live chat:
// - user messages show only what the visitor typed (never the context block);
// - all assistant steps of one turn merge into one bubble: text parts and tool chips in order;
// - tool results only set a chip's status; their content stays hidden.

import type { StoredMessage } from "@nw/agent-harness";
import type { IntakeDisplayMessage, IntakeMessagePart } from "@nw/contracts";

type AssistantBubble = Extract<IntakeDisplayMessage, { role: "assistant" }>;
type ToolPart = Extract<IntakeMessagePart, { type: "tool" }>;

export function toDisplayMessages(stored: StoredMessage[]): IntakeDisplayMessage[] {
  const out: IntakeDisplayMessage[] = [];
  const toolParts = new Map<string, ToolPart>();
  let bubble: AssistantBubble | null = null;
  let bubbleTurn = "";

  for (const s of stored) {
    const m = s.message;
    if (m.role === "user") {
      bubble = null;
      out.push({ id: s.id, role: "user", text: m.text, createdAt: s.createdAt });
      continue;
    }
    if (m.role === "tool") {
      const part = toolParts.get(m.toolCallId);
      if (part) part.status = m.isError ? "error" : "done";
      continue;
    }
    if (!bubble || bubbleTurn !== s.turnId) {
      bubble = { id: s.id, role: "assistant", parts: [], createdAt: s.createdAt };
      bubbleTurn = s.turnId;
      out.push(bubble);
    }
    if (m.text) bubble.parts.push({ type: "text", text: m.text });
    for (const call of m.toolCalls) {
      const part: ToolPart = { type: "tool", id: call.id, name: call.name, status: "running" };
      toolParts.set(call.id, part);
      bubble.parts.push(part);
    }
  }
  return out;
}
