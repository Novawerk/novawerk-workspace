// /admin: the admin panel's routes. Every request needs a valid `nw_session` cookie of an active
// member (src/auth.ts). The inbox, outbox, money, partners, documents and the assistant also need
// `can_admin`; projects, posts, cards and picture uploads are open to every member and check per
// project (./admin/access.ts) who may see what.

import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { memberSelfUpdateInput } from "@nw/contracts";
import { members, type Database } from "@nw/db";
import { updateMemberProfile } from "@nw/tasks";

import { adminChatRoutes } from "../admin-chat/routes.js";
import { postChatRoutes } from "../post-chat/routes.js";
import { requireAdmin, requireSession } from "../auth.js";
import { rejectInvalid } from "../http.js";
import { revalidateWeb } from "../revalidate.js";
import type { AdminMember, ApiEnv } from "../types.js";
import { cardRoutes } from "./admin/cards.js";
import { documentRoutes } from "./admin/documents.js";
import { financeRoutes } from "./admin/finance.js";
import { inboxRoutes } from "./admin/inbox.js";
import { memberRoutes } from "./admin/members.js";
import { metricsRoutes } from "./admin/metrics.js";
import { outboxRoutes } from "./admin/outbox.js";
import { partnerRoutes } from "./admin/partners.js";
import { postRoutes } from "./admin/posts.js";
import { projectFileRoutes } from "./admin/project-files.js";
import { projectLifecycleRoutes } from "./admin/project-lifecycle.js";
import { projectRoutes } from "./admin/projects.js";
import { postGuard, projectGuard } from "./admin/access.js";
import type { AdminDeps } from "./admin/shared.js";
import { subscriberRoutes } from "./admin/subscribers.js";
import { uploadRoutes } from "./admin/uploads.js";

/** GET /admin/me: the session's member plus their public profile fields. */
async function memberSelf(db: Database, member: AdminMember) {
  const [row] = await db
    .select({ publicProfile: members.publicProfile, profileHandle: members.profileHandle, profileBio: members.profileBio })
    .from(members)
    .where(eq(members.id, member.id))
    .limit(1);
  return { ...member, publicProfile: row?.publicProfile ?? false, profileHandle: row?.profileHandle ?? null, profileBio: row?.profileBio ?? null };
}

/** A project's Markdown body is the biggest thing we accept. */
const MAX_BODY_BYTES = 512 * 1024;

/** Areas only admins use. Members get a 403 here before any handler runs. */
const ADMIN_ONLY = [
  "/submissions",
  "/applications",
  "/outbox",
  "/partners",
  "/finance",
  "/subscribers",
  "/documents",
  "/metrics",
  "/chat",
];

export function adminRoutes(deps: AdminDeps) {
  const app = new Hono<ApiEnv>()
    .use("*", requireSession(deps.db, deps.env.sessionSecret))
    .use(
      "*",
      bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Request body too large" }, 413) }),
    );
  for (const path of ADMIN_ONLY) app.use(path, requireAdmin).use(`${path}/*`, requireAdmin);
  // A project (or post) a member isn't on the team of is a 404, for every route below.
  const projects = projectGuard(deps.db);
  const posts = postGuard(deps.db);
  app.use("/projects/:id", projects).use("/projects/:id/*", projects).use("/posts/:id", posts).use("/posts/:id/*", posts);
  return app
    // The signed-in member, with their own opt-in public profile (NB-ADR-0013).
    .get("/me", async (c) => c.json(await memberSelf(deps.db, c.get("member")), 200))
    // Only the member themself switches their public profile on or off; never an admin for them.
    .patch("/me", zValidator("json", memberSelfUpdateInput, rejectInvalid), async (c) => {
      await updateMemberProfile(deps.db, c.get("member").id, c.req.valid("json"));
      // Their card on the wall and /u/<handle> change at once. Not awaited: the save doesn't wait
      // on the website (revalidateWeb logs and never throws).
      void revalidateWeb(deps.env.webRevalidate, deps.logger, ["contributors"]);
      return c.json(await memberSelf(deps.db, c.get("member")), 200);
    })
    .route("/", inboxRoutes(deps))
    .route("/members", memberRoutes(deps))
    .route("/metrics", metricsRoutes(deps))
    .route("/outbox", outboxRoutes(deps))
    // Lifecycle first: its GET /projects/board must win over GET /projects/:id.
    .route("/projects", projectLifecycleRoutes(deps))
    .route("/projects", projectFileRoutes(deps))
    .route("/projects", projectRoutes(deps))
    .route("/posts", postRoutes(deps))
    .route("/posts", postChatRoutes(deps))
    .route("/cards", cardRoutes(deps))
    .route("/partners", partnerRoutes(deps))
    .route("/finance", financeRoutes(deps))
    .route("/subscribers", subscriberRoutes(deps))
    .route("/documents", documentRoutes(deps))
    .route("/uploads", uploadRoutes(deps))
    .route("/chat", adminChatRoutes(deps));
}
