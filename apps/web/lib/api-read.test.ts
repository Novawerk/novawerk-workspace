import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readApi } from "./api-read";

const answer = (status: number, body: string) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
const warnings = () => vi.spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => vi.restoreAllMocks());

describe("readApi", () => {
  it("reads JSON with the website's key", async () => {
    const fetchImpl = answer(200, '{"contributors":[],"nextCursor":null}');
    const res = await readApi("/public/contributors", { apiUrl: "https://api.example.org/", webKey: "k" }, fetchImpl);
    expect(res).toEqual({ ok: true, data: { contributors: [], nextCursor: null } });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example.org/public/contributors", expect.objectContaining({ headers: { accept: "application/json", "x-nw-web-key": "k" } }));
  });

  it("logs why it failed: no API_URL (as in a build that doesn't pass it through)", async () => {
    const warn = warnings();
    const fetchImpl = answer(200, "{}");
    expect(await readApi("/public/contributors", { apiUrl: undefined }, fetchImpl)).toEqual({ ok: false, notFound: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[web] task board read failed: GET /public/contributors: API_URL is not set");
  });

  it("logs the status, and a missing key on 429", async () => {
    const warn = warnings();
    await readApi("/public/tasks", { apiUrl: "https://api.example.org" }, answer(429, "{}"));
    expect(warn).toHaveBeenCalledWith("[web] task board read failed: GET /public/tasks: answered 429 (WEB_READ_KEY is not set)");
    await readApi("/public/tasks", { apiUrl: "https://api.example.org", webKey: "k" }, answer(500, "{}"));
    expect(warn).toHaveBeenCalledWith("[web] task board read failed: GET /public/tasks: answered 500");
  });

  it("logs a body that isn't JSON and a network error; a 404 is not a failure", async () => {
    const warn = warnings();
    await readApi("/public/blocks", { apiUrl: "https://api.example.org" }, answer(200, "<html>"));
    expect(warn).toHaveBeenLastCalledWith("[web] task board read failed: GET /public/blocks: answered with something that isn't JSON");
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await readApi("/public/blocks", { apiUrl: "https://api.example.org" }, down);
    expect(warn).toHaveBeenLastCalledWith("[web] task board read failed: GET /public/blocks: no answer (ECONNREFUSED)");
    warn.mockClear();
    expect(await readApi("/public/contributors/x", { apiUrl: "https://api.example.org" }, answer(404, "{}"))).toEqual({ ok: false, notFound: true });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("turbo.json", () => {
  // Turborepo's strict env mode hides variables a task doesn't list. Without these the Vercel build
  // prerenders the board, the wall and the portfolio with no API, and ships them "offline".
  it("passes API_URL and WEB_READ_KEY to builds", () => {
    const turbo = JSON.parse(readFileSync(resolve(__dirname, "../../../turbo.json"), "utf8")) as { tasks: { build: { env?: string[] } } };
    expect(turbo.tasks.build.env).toEqual(expect.arrayContaining(["API_URL", "WEB_READ_KEY"]));
  });
});
