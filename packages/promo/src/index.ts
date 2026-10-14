// @nw/promo — the public story of each project.
//
//   plan.ts   which posts a project should have by now, from its status and dates (pure)
//   sync.ts   creates those posts, once each (the API after a status change; the agent daily)
//   draft.ts  Claude drafts each post in Chinese and English, facts only from our own data
//   cards/    the picture templates, rendered to PNG
//
// Entry points: "@nw/promo" (everything; the agent), "@nw/promo/lifecycle" (plan + sync; the
// API, without Claude) and "@nw/promo/cards" (the pictures; the API, loaded on first render).
//
// Nothing here publishes. A member reviews every post in the admin panel, posts it by hand and
// marks it posted.

export * from "./plan.js";
export * from "./sync.js";
export * from "./draft.js";
