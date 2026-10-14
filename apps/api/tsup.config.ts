import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

// `pnpm build` → dist/server.js (plain Node: `pnpm start`) and dist/index.js, which
// api/index.js serves as the Vercel Function.
// Workspace packages ship TypeScript source, so they are bundled; npm deps stay external.
// The Intake Agent reads its Markdown prompts next to the module (new URL("./prompts/…",
// import.meta.url)); in the bundle that is dist/, so the folder is copied to dist/prompts.
// The promo agent, run here on request (src/agents.ts), drafts from two knowledge/ files;
// they're copied to dist/knowledge the same way.
const PROMO_KNOWLEDGE = ["brand/voice.md", "community/promotion/post-templates.md"];
export default defineConfig({
  entry: ["src/server.ts", "src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  noExternal: [/^@nw\//],
  clean: true,
  onSuccess: async () => {
    cpSync("src/intake-chat/prompts", "dist/prompts", { recursive: true });
    for (const file of PROMO_KNOWLEDGE) cpSync(`../../knowledge/${file}`, `dist/knowledge/${file}`);
  },
});
