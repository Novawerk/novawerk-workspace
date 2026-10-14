// The per-turn context block. Dynamic state (time, app state, reminders) rides on each user
// message instead of being written into the system prompt: the system prompt stays frozen and
// the history append-only, so the request prefix — and the provider's cache — survive.

export interface ContextSection {
  /** XML-ish tag name, e.g. "draft". */
  tag: string;
  body: string;
  attrs?: Record<string, string>;
}

export interface TurnContextInput {
  sections?: ContextSection[];
  /**
   * Short rules that are easy to forget in a long system prompt. Placed closest to the newest
   * message, where models weigh them most.
   */
  reminder?: string;
  now?: Date;
}

/** Renders `<context>…</context>` with the current time (UTC) first. */
export function renderTurnContext({ sections = [], reminder, now = new Date() }: TurnContextInput): string {
  const lines = ["<context>", `Current time: ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`];
  for (const s of sections) {
    const attrs = Object.entries(s.attrs ?? {})
      .map(([k, v]) => ` ${k}="${v.replace(/"/g, "&quot;")}"`)
      .join("");
    lines.push(`<${s.tag}${attrs}>`, s.body.trim(), `</${s.tag}>`);
  }
  const r = reminder?.trim();
  if (r) lines.push("<reminder>", r, "</reminder>");
  lines.push("</context>");
  return lines.join("\n");
}
