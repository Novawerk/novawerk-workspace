// Storage behind an interface: apps plug in Postgres (apps/api), tests use MemoryAgentStore.
//
// Invariants every implementation keeps:
// - the session's system prompt is written once, when the app creates the session, and never
//   changed afterwards (the agent only reads it);
// - messages are append-only and come back in insertion order.
//
// Not here yet, on purpose (intake chats are short): compaction would add an `epoch` to
// messages and send only the current epoch to the model; long-term memory would be another
// store the app's tools and context block read from.

import type { TurnTrace } from "./events.js";
import type { Message } from "./llm/types.js";

export interface AgentSessionState {
  id: string;
  /** Frozen at creation. */
  systemPrompt: string;
  /** Input tokens of the latest model call (a future compaction trigger). */
  lastInputTokens: number;
}

export interface StoredMessage {
  id: string;
  turnId: string;
  message: Message;
  createdAt: string;
}

export interface AgentStore {
  getSession(sessionId: string): Promise<AgentSessionState | undefined>;
  updateSession(sessionId: string, patch: { lastInputTokens?: number }): Promise<void>;
  appendMessage(sessionId: string, turnId: string, message: Message): Promise<void>;
  listMessages(sessionId: string): Promise<StoredMessage[]>;
  saveTrace(trace: TurnTrace): Promise<void>;
}

/** In-memory store for tests and scripts. */
export class MemoryAgentStore implements AgentStore {
  readonly sessions = new Map<string, AgentSessionState>();
  readonly messages = new Map<string, StoredMessage[]>();
  readonly traces: TurnTrace[] = [];
  private seq = 0;

  createSession(id: string, systemPrompt: string): AgentSessionState {
    const session = { id, systemPrompt, lastInputTokens: 0 };
    this.sessions.set(id, session);
    this.messages.set(id, []);
    return session;
  }

  async getSession(sessionId: string) {
    const s = this.sessions.get(sessionId);
    return s ? { ...s } : undefined;
  }

  async updateSession(sessionId: string, patch: { lastInputTokens?: number }) {
    const s = this.sessions.get(sessionId);
    if (s && patch.lastInputTokens !== undefined) s.lastInputTokens = patch.lastInputTokens;
  }

  async appendMessage(sessionId: string, turnId: string, message: Message) {
    const list = this.messages.get(sessionId);
    if (!list) throw new Error(`No session ${sessionId}`);
    // Deep copy so later mutation by the caller can't rewrite history.
    list.push({ id: String(++this.seq), turnId, message: structuredClone(message), createdAt: new Date().toISOString() });
  }

  async listMessages(sessionId: string) {
    return structuredClone(this.messages.get(sessionId) ?? []);
  }

  async saveTrace(trace: TurnTrace) {
    this.traces.push(structuredClone(trace));
  }
}
