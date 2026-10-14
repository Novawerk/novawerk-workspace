// @nw/agent-core — the shared shape of an agent, and the one way we call Claude.
//
// Agent LOGIC lives in packages (testable). Each agent in agents/<id>/index.ts is a
// defineAgent(...) that wires config + packages together; GitHub Actions decides when it runs.

export {
  defineAgent,
  runAgent,
  type AgentContext,
  type AgentDefinition,
  type AgentTrigger,
  type AnyAgent,
  type Closable,
  type RunAgentOptions,
  type Services,
} from "./agent.js";

export {
  ClaudeRefusalError,
  createClaude,
  MODELS,
  runClaude,
  stubClaude,
  type Claude,
  type ClaudeCall,
  type ClaudeJsonCall,
  type ClaudeUsage,
  type CreateClaudeOptions,
  type Effort,
  type JsonSchema,
} from "./claude.js";

export type { AgentRunStatus } from "@nw/types";
