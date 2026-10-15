// Rewrites the Contributors block in README.md (between the contributors:start and
// contributors:end markers) from GET /public/contributors?sort=newest, so the same visibility
// rules apply as on novawerk.io/contributors: public profiles on the wall only.
// Plain Node 22, no dependencies: .github/workflows/contributors.yml runs it without an install.
//
//   node scripts/readme-contributors.mjs                 fetch from NW_API_URL (default api.novawerk.io)
//   node scripts/readme-contributors.mjs --from file.json   use a saved list (an array of contributors)
//
// Prints "changed" or "unchanged".

import { readFile, writeFile } from "node:fs/promises";

const API = (process.env.NW_API_URL ?? "https://api.novawerk.io").replace(/\/$/, "");
const WEB = "https://novawerk.io";
const START = "<!-- contributors:start -->";
const END = "<!-- contributors:end -->";
const README = new URL("../README.md", import.meta.url);
const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PAGES = 20;

async function fetchContributors() {
  const all = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API}/public/contributors`);
    url.searchParams.set("sort", "newest");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
    const body = await res.json();
    all.push(...body.contributors);
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  return all;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The block: 48 px avatars, newest first, no counts, each linking to the profile. */
export function renderBlock(people) {
  const cells = people
    .filter((p) => typeof p.handle === "string" && HANDLE.test(p.handle))
    .map((p) => {
      const href = `${WEB}/u/${p.handle}`;
      const avatar = typeof p.avatarUrl === "string" && p.avatarUrl.startsWith("https://") ? p.avatarUrl : null;
      return avatar
        ? `<a href="${href}"><img src="${escape(avatar)}" width="48" height="48" alt="@${p.handle}" title="@${p.handle}"></a>`
        : `<a href="${href}">@${p.handle}</a>`;
    });
  const lines = cells.length
    ? [cells.join("\n"), "", `[See everyone who built this](${WEB}/contributors)`]
    : [`Nobody yet. Be the first: [open tasks](${WEB}/tasks).`];
  return `${START}\n${lines.join("\n")}\n${END}`;
}

export function replaceBlock(readme, block) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error(`README.md needs ${START} and ${END}`);
  return readme.slice(0, start) + block + readme.slice(end + END.length);
}

const fromIndex = process.argv.indexOf("--from");
const people = fromIndex > -1 ? JSON.parse(await readFile(process.argv[fromIndex + 1], "utf8")) : await fetchContributors();
const readme = await readFile(README, "utf8");
const next = replaceBlock(readme, renderBlock(people));
if (next === readme) {
  console.log("unchanged");
} else {
  await writeFile(README, next);
  console.log("changed");
}
