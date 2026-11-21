// The Intake Agent's prompts live as Markdown next to this file (./prompts/*.md) so they can be
// edited without touching code. They are read once per process; the system prompt is then
// rendered and frozen into each new session. A session nobody has written in yet picks up the
// current system prompt and greeting when it is reopened (refreshUntouchedSession in ./store).
//
// Each file is referenced with a literal `new URL("./prompts/….md", import.meta.url)` so
// bundlers and Vercel's file tracing can see it. `pnpm build` copies the folder to dist/prompts
// (see tsup.config.ts), which is where the bundled dist/server.js looks.

import { readFileSync } from "node:fs";

import type { IntakeMode } from "@nw/contracts";

export interface IntakePrompts {
  /** The rendered system prompt for the project pitch. */
  system: string;
  turnReminder: string;
  greetings: Record<IntakeMode | "unknown", string>;
}

const read = (url: URL) =>
  readFileSync(url, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

/** `{{name}}` placeholders only. A missing variable is a bug, so it throws. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_whole, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`Prompt variable not provided: ${key}`);
    return value;
  });
}

let cached: IntakePrompts | undefined;

export function loadIntakePrompts(): IntakePrompts {
  cached ??= {
    system: read(new URL("./prompts/system.md", import.meta.url)),
    turnReminder: read(new URL("./prompts/turn-reminder.md", import.meta.url)),
    greetings: {
      pitch: read(new URL("./prompts/greeting-pitch.md", import.meta.url)),
      unknown: read(new URL("./prompts/greeting-unknown.md", import.meta.url)),
    },
  };
  return cached;
}
