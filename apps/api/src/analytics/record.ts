// Server-side usage events: the API writes these itself, so no ad blocker hides them.
// Best effort: a failed insert is logged and never breaks the request it describes.
// The browser's events arrive through ./ingest.ts; the catalog is in docs/analytics.md.

import type { AgentErrorCode, TurnTrace } from "@nw/agent-harness";
import type { FormKind, IntakeMode } from "@nw/contracts";
import { analyticsEvents, type Database } from "@nw/db";

import type { Logger } from "../types.js";

export type ServerEvent =
  /** A visitor opened a new Intake Agent chat. */
  | { name: "intake_session_created"; props: { mode: IntakeMode | null } }
  /** A pitch, an application or a newsletter signup was stored. `turns`: visitor messages, for chats. */
  | { name: "form_received"; props: { form: FormKind; via: "form" | "chat"; turns: number | null } }
  /** One visitor or member message and the agent's reply. */
  | {
      name: "agent_turn";
      props: {
        agent: string;
        mode: IntakeMode | null;
        /** Which message of the chat this was (1 = the first). */
        turn: number;
        steps: number;
        ms: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        /** The harness error code, or `internal` when the turn threw. */
        error: AgentErrorCode | null;
        aborted: boolean;
      };
    };

export async function recordServerEvent(db: Database, event: ServerEvent, logger: Logger): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({ name: event.name, source: "api", props: event.props });
  } catch (err) {
    logger.error(`[api] could not record the ${event.name} event:`, err);
  }
}

/** The `agent_turn` event for a finished turn. `trace` is null when the turn threw before it ran. */
export function agentTurnEvent(
  agent: string,
  { mode = null, turn, trace, error }: { mode?: IntakeMode | null; turn: number; trace: TurnTrace | null; error: AgentErrorCode | null },
): ServerEvent {
  return {
    name: "agent_turn",
    props: {
      agent,
      mode,
      turn,
      steps: trace?.steps.filter((s) => s.kind === "model").length ?? 0,
      ms: trace?.durationMs ?? 0,
      inputTokens: trace?.usage.inputTokens ?? 0,
      cachedInputTokens: trace?.usage.cachedInputTokens ?? 0,
      outputTokens: trace?.usage.outputTokens ?? 0,
      error,
      aborted: trace?.error === "aborted",
    },
  };
}
