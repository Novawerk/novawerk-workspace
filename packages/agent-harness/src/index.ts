// @nw/agent-harness — a small agent loop any Novawerk app can embed. Ported from edu-agent.
//
// - llm/: provider-neutral messages + adapters (Anthropic by default; OpenAI-compatible; mock)
// - tools: zod-defined tools with validation, timeouts and errors-as-results
// - hooks: logging / guardrails around each step
// - store: the AgentStore interface; the app owns the tables (apps/api uses Postgres)
// - agent: the turn loop that ties them together and traces every step
//
// Nothing here reads process.env. Apps resolve config at their edge and pass it in.

export {
  Agent,
  SessionBusyError,
  SessionNotFoundError,
  danglingToolResults,
  type AgentOptions,
  type RunTurnInput,
} from "./agent.js";
export {
  LLM_PROVIDERS,
  LlmConfigError,
  isLlmProviderName,
  resolveLlmConfig,
  type LlmConfig,
  type LlmConfigInput,
  type LlmProviderName,
} from "./config.js";
export { renderTurnContext, type ContextSection, type TurnContextInput } from "./context.js";
export type { AgentErrorCode, AgentEvent, TraceStep, TurnTrace } from "./events.js";
export {
  HookRunner,
  consoleLogHook,
  createConsoleLogHook,
  type AgentHooks,
  type ConsoleLogHookOptions,
  type HookContext,
  type TurnEndInfo,
} from "./hooks.js";
export { createProvider, type CreateProviderOptions } from "./llm/index.js";
export { AnthropicProvider, toAnthropicMessages, type AnthropicOptions } from "./llm/anthropic.js";
export { MockProvider, type MockProviderOptions, type MockStep } from "./llm/mock.js";
export { OpenAICompatibleProvider, toOpenAIMessages, type OpenAICompatibleOptions } from "./llm/openai-compatible.js";
export {
  addUsage,
  emptyUsage,
  parseToolArgs,
  renderUserText,
  type AssistantMessage,
  type Message,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type StopReason,
  type StreamHandlers,
  type ToolCall,
  type ToolResultMessage,
  type ToolSpec,
  type Usage,
  type UserMessage,
} from "./llm/types.js";
export { MemoryAgentStore, type AgentSessionState, type AgentStore, type StoredMessage } from "./store.js";
export { ToolRegistry, defineTool, type Tool, type ToolContext, type ToolResult } from "./tools.js";
