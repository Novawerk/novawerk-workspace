// @nw/tasks — the contributor task board (docs/contributor-board-design.md, NB-ADR-0013).
//
//   ./state.ts        the task state machine: which action moves which status, and who may
//   ./transitions.ts  applies it to a task (member and GitHub actions), awards Werk on a merge
//   ./actions.ts      what a contributor does: propose, post, suggest, +1, with every limit
//   ./contributors.ts accounts: GitHub / email sign-in, profile, delete
//   ./reads.ts        the public reads; nothing private leaves through them
//
// The API only wires these to routes. Werk is append-only: there is no function that changes or
// deletes a ledger row.

export * from "./actions.js";
export * from "./contributors.js";
export * from "./errors.js";
export * from "./people.js";
export * from "./reads.js";
export * from "./state.js";
export * from "./transitions.js";
