// @nw/github — GitHub for the contributor task board.
//
//   ./webhook.ts  the X-Hub-Signature-256 check and the pull request facts the board acts on
//   ./client.ts   the GitHub App `novawerk-task-board` on our repository (App JWT → installation
//                 token): comments, labels, recent pull requests
//
// What happens to a task is decided in @nw/tasks (github.ts); the API wires the two.

export * from "./client.js";
export * from "./webhook.js";
