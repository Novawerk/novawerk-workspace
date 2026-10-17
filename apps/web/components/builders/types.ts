// The shapes the builders scene reads. They match what `GET /public/blocks` (one row per merged
// task or accepted idea) and `GET /public/contributors` return, so the page can pass the API's
// JSON straight in.

export const BLOCK_AREAS = ["web", "admin", "api", "agents", "docs", "ci", "posts", "videos"] as const;
export type BlockArea = (typeof BLOCK_AREAS)[number];

export const BLOCK_SIZES = ["S", "M", "L", "XL"] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

/**
 * One merged task, or one idea: an accepted suggestion (size S, linked to its task) or a project
 * pitch not declined (size M, no task, no area). Ideas are drawn as lamplit bricks.
 */
export type Block = {
  /** "task" when left out (an API from before ideas). */
  kind?: "task" | "idea";
  /** Unique per block: "NW-42", "idea-NW-42", "idea-p1a2b3c4d". */
  id: string;
  /** The task the card links to (/tasks/<task>). Left out: `id`, for a task. Null: no link. */
  task?: string | null;
  title: string;
  /** Null only on a pitch. */
  area: BlockArea | null;
  size: BlockSize;
  /**
   * Who merged it, or whose idea it was. For people without a public profile the API sends a
   * stable opaque key instead of their handle; anyone not in `people` is drawn as an unnamed figure.
   */
  handle: string;
  /** ISO 8601 timestamp of the merge (a suggestion: its acceptance; a pitch: when it was sent). */
  mergedAt: string;
};

export const isIdea = (b: Pick<Block, "kind">) => b.kind === "idea";
/** The task a block links to, or null. */
export const taskOf = (b: Pick<Block, "kind" | "id" | "task">) => (b.task !== undefined ? b.task : isIdea(b) ? null : b.id);

/** Someone on the contributors wall: a contributor, or the initiator of a portfolio project. */
export type Person = {
  handle: string;
  name: string;
  avatar: string | null;
  kind: "contributor" | "initiator";
  /** Initiators: the project they started. */
  project?: string;
};

/** compact: a small scene (/contribute); full: a section of a page; hero: the page itself (/contributors). */
export type BuildersSize = "full" | "compact" | "hero";
