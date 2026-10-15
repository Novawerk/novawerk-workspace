// The shapes the builders scene reads. They match what `GET /public/blocks` (one row per merged
// task) and `GET /public/contributors` will return, so the page can pass the API's JSON straight in.

export const BLOCK_AREAS = ["web", "admin", "api", "agents", "docs", "ci", "posts", "videos"] as const;
export type BlockArea = (typeof BLOCK_AREAS)[number];

export const BLOCK_SIZES = ["S", "M", "L", "XL"] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

/** One merged task. */
export type Block = {
  /** Task id, e.g. "NW-42". The card links to /tasks/<id>. */
  id: string;
  title: string;
  area: BlockArea;
  size: BlockSize;
  /**
   * Who merged it. For people without a public profile the API sends a stable opaque key instead
   * of their handle; anyone not in `people` is drawn as an unnamed figure.
   */
  handle: string;
  /** ISO 8601 timestamp of the merge. */
  mergedAt: string;
};

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
