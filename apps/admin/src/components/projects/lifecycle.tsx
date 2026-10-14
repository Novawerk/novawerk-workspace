/** A project's life, from the pitch to launched. "draft" is a project accepted but not public yet. */
export const STAGES = [
  { key: "pitch", label: "Pitch", zh: "提案" },
  { key: "draft", label: "Accepted", zh: "已接受" },
  { key: "planning", label: "Planning", zh: "规划" },
  { key: "building", label: "Building", zh: "开发" },
  { key: "launching", label: "Launching", zh: "上线中" },
  { key: "launched", label: "Launched", zh: "已上线" },
] as const

export type Stage = (typeof STAGES)[number]["key"]
