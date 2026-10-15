// @nw/tasks — the contributor task board (docs/contributor-board-design.md, NB-ADR-0013).
//
//   ./state.ts        the task state machine: which action moves which status, and who may
//   ./transitions.ts  applies it to a task (member and GitHub actions), awards Werk on a merge
//   ./actions.ts      what a contributor does: propose, post, suggest, +1, with every limit
//   ./assignee.ts     the person on a task: guide, link a PR by hand, a week more, release; reports
//   ./github.ts       what a pull request does to a task; inactivity reminders and releases
//   ./contributors.ts accounts: GitHub / email sign-in, profile, delete
//   ./members.ts      a Member's own opt-in public profile (initiators on the wall)
//   ./reads.ts        the public reads; nothing private leaves through them
//   ./tokens.ts       personal access tokens for agents: create, list, revoke, authenticate, scopes
//   ./admin.ts        the members' side (admin panel): reads with everything, moderation, triage
//
// The API only wires these to routes. Werk is append-only: there is no function that changes or
// deletes a ledger row.

export * from "./actions.js";
export * from "./assignee.js";
export * from "./github.js";
export * from "./handles.js";
export * from "./idle.js";
export * from "./members.js";
export * from "./admin.js";
export * from "./contributors.js";
export * from "./errors.js";
export * from "./people.js";
export * from "./reads.js";
export * from "./screenshots.js";
export * from "./state.js";
export * from "./tokens.js";
export * from "./transitions.js";
