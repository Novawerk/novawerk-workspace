import { createHmac, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createGitHubApi, normalisePrivateKey } from "./client.js";
import { parsePullRequestUrl, parseWebhook, taskNumberOf, verifyWebhookSignature } from "./webhook.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyWebhookSignature", () => {
  const body = fixture("pull_request.opened.json");

  it("accepts GitHub's HMAC of the raw body", () => {
    expect(verifyWebhookSignature("s3cret", body, sign("s3cret", body))).toBe(true);
  });

  it("refuses another secret, another body, a missing or malformed header", () => {
    expect(verifyWebhookSignature("other", body, sign("s3cret", body))).toBe(false);
    expect(verifyWebhookSignature("s3cret", `${body} `, sign("s3cret", body))).toBe(false);
    expect(verifyWebhookSignature("s3cret", body, undefined)).toBe(false);
    expect(verifyWebhookSignature("s3cret", body, sign("s3cret", body).replace("sha256=", "sha1="))).toBe(false);
    expect(verifyWebhookSignature("s3cret", body, "sha256=zz")).toBe(false);
    expect(verifyWebhookSignature("", body, sign("", body))).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("reads the facts of a pull_request event", () => {
    const parsed = parseWebhook("pull_request", JSON.parse(fixture("pull_request.opened.json")));
    expect(parsed).toEqual({
      kind: "pull_request",
      action: "opened",
      pr: {
        repo: "Novawerk/novawerk-workspace",
        number: 212,
        url: "https://github.com/Novawerk/novawerk-workspace/pull/212",
        title: "Web: dark mode toggle in the header",
        authorId: 90000001,
        authorLogin: "lena-k",
        authorAssociation: "CONTRIBUTOR",
        state: "open",
        merged: false,
        taskNumber: 5,
      },
    });
  });

  it("sees a merge, and ignores other events and actions", () => {
    const payload = JSON.parse(fixture("pull_request.opened.json"));
    payload.action = "closed";
    payload.pull_request.state = "closed";
    payload.pull_request.merged = true;
    payload.pull_request.merged_at = "2026-10-16T09:00:00Z";
    expect(parseWebhook("pull_request", payload)).toMatchObject({ action: "closed", pr: { merged: true, state: "closed" } });
    expect(parseWebhook("pull_request", { ...payload, action: "labeled" })).toEqual({ kind: "ignored", reason: "pull_request.labeled" });
    expect(parseWebhook("ping", {})).toEqual({ kind: "ping" });
    expect(parseWebhook("issues", {})).toMatchObject({ kind: "ignored" });
    expect(() => parseWebhook("pull_request", { action: "opened" })).toThrow();
  });
});

describe("taskNumberOf", () => {
  it("prefers a Task: line, then the title, the body, the branch", () => {
    expect(taskNumberOf({ title: "Fix NW-3", body: "Task: NW-42\nRelated to NW-7", branch: "nw-9" })).toBe(42);
    expect(taskNumberOf({ title: "Fix NW-3", body: "See NW-7", branch: "nw-9" })).toBe(3);
    expect(taskNumberOf({ title: "Fix it", body: "Closes nw-7.", branch: "main" })).toBe(7);
    expect(taskNumberOf({ title: "Fix it", body: null, branch: "feat/nw42-dark" })).toBe(42);
    expect(taskNumberOf({ title: "Fix it", body: null, branch: "nw-5-dark-mode" })).toBe(5);
  });

  it("finds nothing in look-alikes", () => {
    expect(taskNumberOf({ title: "SNW-42 and NW-0", body: "news-42", branch: "renew-42" })).toBeNull();
    expect(taskNumberOf({ title: "NW-99999999999", body: "", branch: "x" })).toBeNull();
  });
});

describe("createGitHubApi", () => {
  it("buys an installation token with an App JWT, then comments as the App", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const calls: { url: string; auth: string | null; body: unknown }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith("/app/installations/171409213/access_tokens")) {
        return Response.json(
          { token: "ghs_test", expires_at: new Date(Date.now() + 3_600_000).toISOString(), permissions: {}, repository_selection: "selected" },
          { status: 201 },
        );
      }
      return Response.json({ id: 1 }, { status: 201 });
    };
    // A one-line env value with literal \n works too.
    const api = createGitHubApi({ appId: "5317582", privateKey: pem.replace(/\n/g, "\\n"), installationId: "171409213" }, { fetch: fakeFetch });
    await api.comment("Novawerk/novawerk-workspace", 212, "Hello");

    expect(calls[0]?.auth).toMatch(/^bearer ey/i); // the App JWT
    expect(calls[1]).toEqual({
      url: "https://api.github.com/repos/Novawerk/novawerk-workspace/issues/212/comments",
      auth: "token ghs_test",
      body: { body: "Hello" },
    });
    expect(normalisePrivateKey(" a\\nb ")).toBe("a\nb");
  });

  it("reads one PR (null when it's gone), and every call carries a timeout", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const signals: (AbortSignal | null | undefined)[] = [];
    const pr = JSON.parse(fixture("pull_request.opened.json")).pull_request;
    const fakeFetch: typeof fetch = async (input, init) => {
      signals.push(init?.signal);
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/access_tokens")) {
        return Response.json({ token: "ghs_test", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: 201 });
      }
      if (url.endsWith("/pulls/212")) return Response.json(pr);
      if (url.endsWith("/pulls/500")) return Response.json({ error: "boom" }, { status: 502 });
      if (url.endsWith("/pulls/77")) return Response.json({ number: 77, surprise: "new format" });
      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const api = createGitHubApi({ appId: "5317582", privateKey: pem, installationId: "171409213" }, { fetch: fakeFetch });
    expect(await api.getPullRequest("Novawerk/novawerk-workspace", 212)).toMatchObject({ number: 212, taskNumber: 5, authorAssociation: "CONTRIBUTOR" });
    expect(await api.getPullRequest("Novawerk/novawerk-workspace", 9)).toBeNull();
    // Only a 404 is "gone": a 5xx or a payload we can't read is an error.
    await expect(api.getPullRequest("Novawerk/novawerk-workspace", 500)).rejects.toThrow();
    await expect(api.getPullRequest("Novawerk/novawerk-workspace", 77)).rejects.toThrow();
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });
});

describe("parsePullRequestUrl", () => {
  it("reads a PR link and nothing else", () => {
    expect(parsePullRequestUrl("https://github.com/Novawerk/novawerk-workspace/pull/212/")).toEqual({ repo: "Novawerk/novawerk-workspace", number: 212 });
    expect(parsePullRequestUrl("https://github.com/a/b/issues/1")).toBeNull();
    expect(parsePullRequestUrl("https://gitlab.com/a/b/pull/1")).toBeNull();
  });
});
