// The post writer's tools: read the post, replace its brief, and have the promo agent rewrite it.
// They only touch the one post the chat belongs to.

import { eq } from "drizzle-orm";
import { z } from "zod";

import { defineTool, ToolRegistry } from "@nw/agent-harness";
import { POST_LANGS, POST_PLATFORM_INFO, placeholdersIn, postLabel, postPlatforms, type PostContentInput } from "@nw/contracts";
import { posts, projects, type Database } from "@nw/db";

/** What every tool can reach during a turn. */
export interface PostToolApp {
  db: Database;
  postId: string;
  /** The promo agent's rewrite of this post; absent when the API has no Anthropic key. */
  draftPost?: (postId: string) => Promise<void>;
}

const CLOSED = ["published", "skipped"];

async function load(app: PostToolApp) {
  const [row] = await app.db
    .select({ post: posts, project: projects.title })
    .from(posts)
    .leftJoin(projects, eq(posts.projectId, projects.id))
    .where(eq(posts.id, app.postId))
    .limit(1);
  if (!row) throw new Error("This post no longer exists.");
  return row;
}

const readPost = defineTool({
  name: "read_post",
  description:
    "Read the post this chat is about: kind, project, date, status, languages, platforms, the brief, the current draft (title, text and card per language) and the gaps (placeholders) still in it.",
  schema: z.object({}),
  run: async (_args, { app }: { app: PostToolApp }) => {
    const { post, project } = await load(app);
    const content = (post.content ?? null) as PostContentInput | null;
    const draft = content
      ? Object.fromEntries(
          post.langs.map((lang) => {
            const copy = content[lang];
            return [lang, copy ? { title: copy.title, text: copy.body, card: copy.card } : null];
          }),
        )
      : null;
    return JSON.stringify({
      post: postLabel(post.kind, post.seq, post.label),
      project: project ?? "Novawerk itself",
      goesOutOn: post.dueOn,
      status: post.status,
      languages: post.langs,
      platforms: postPlatforms(post).map((p) => POST_PLATFORM_INFO[p].label),
      brief: post.brief ?? "",
      draft: draft ?? "not written yet",
      gaps: content ? placeholdersIn(content, post.langs.length ? post.langs : POST_LANGS) : [],
      rewriteInProgress: post.draftRequestedAt !== null,
    });
  },
});

const saveBrief = defineTool({
  name: "save_brief",
  description:
    "Replace the post's brief with this text. Keep what is still true, add what the member told you. Short plain lines; at most 4000 characters.",
  schema: z.object({ brief: z.string().max(4000).describe("The whole new brief.") }),
  run: async ({ brief }, { app }: { app: PostToolApp }) => {
    const { post } = await load(app);
    if (CLOSED.includes(post.status)) return `The post is ${post.status}; its brief can't change.`;
    if (post.sourcePath) return "This post is written in the repo; change it there.";
    await app.db.update(posts).set({ brief: brief.trim() || null }).where(eq(posts.id, app.postId));
    return "Brief saved.";
  },
});

const rewritePost = defineTool({
  name: "rewrite_post",
  description:
    "Ask the promo agent to rewrite the whole draft from the brief and our data, and wait for it (about half a minute). The current text is replaced. Save the brief first.",
  schema: z.object({}),
  run: async (_args, { app }: { app: PostToolApp }) => {
    // Refusals throw, so the panel shows the step as failed and the model hears why.
    if (!app.draftPost) throw new Error("The writer is switched off on this server (no Anthropic key). The member can press Redraft later.");
    const { post } = await load(app);
    if (CLOSED.includes(post.status)) throw new Error(`The post is ${post.status}; it isn't rewritten.`);
    if (post.sourcePath) throw new Error("This post is written in the repo; change it there.");
    await app.draftPost(app.postId);
    return "Rewritten. Read the post to see the new draft.";
  },
});

/** A rewrite takes Claude about half a minute; the limit leaves room for a slow one. */
export function createPostTools(): ToolRegistry<PostToolApp> {
  return new ToolRegistry<PostToolApp>([readPost, saveBrief, rewritePost], { timeoutMs: 120_000 });
}
