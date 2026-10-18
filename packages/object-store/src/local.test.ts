import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPrivate } from "./index.js";
import { LocalFiles } from "./local.js";

const API = "http://localhost:8787";

let root: string;
let files: LocalFiles;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nw-local-files-"));
  files = new LocalFiles({ root, publicBase: `${API}/dev/files/`, uploadBase: `${API}/dev/uploads/` });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = (url: string, body: string, type: string, method = "PUT") =>
  files.receive(new Request(url, { method, headers: { "content-type": type }, body }));

describe("LocalFiles", () => {
  it("takes a private upload once, for the ticket's pathname, type and size", async () => {
    const ticket = await files.uploadTicket("private", {
      pathname: "_suggestions/c1/a.png",
      contentTypes: ["image/png"],
      maxBytes: 10,
    });
    expect(ticket.uploadUrl).toBe(`${API}/dev/uploads/${ticket.token}`);

    expect((await put(ticket.uploadUrl!, "png", "image/jpeg")).status).toBe(400);
    expect((await put(ticket.uploadUrl!, "x".repeat(11), "image/png")).status).toBe(413);
    const ok = await put(ticket.uploadUrl!, "png", "image/png");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ pathname: "_suggestions/c1/a.png" });
    expect((await put(ticket.uploadUrl!, "png", "image/png")).status).toBe(403);

    expect(await readFile(join(root, "_private/_suggestions/c1/a.png"), "utf8")).toBe("png");
    expect(await files.statPrivate("_suggestions/c1/a.png")).toEqual({
      pathname: "_suggestions/c1/a.png",
      contentType: "image/png",
      size: 3,
    });
    expect((await readPrivate(files, "_suggestions/c1/a.png"))?.body.toString()).toBe("png");
    expect((await files.listPrivate("_suggestions/")).map((f) => f.pathname)).toEqual(["_suggestions/c1/a.png"]);
    await files.deletePrivate("_suggestions/c1/a.png");
    expect(await files.statPrivate("_suggestions/c1/a.png")).toBeNull();
  });

  it("answers a public upload with the URL the API serves it at", async () => {
    const ticket = await files.uploadTicket("public", { pathname: "projects/u-cover.png", contentTypes: ["image/png"], maxBytes: 100 });
    const res = await put(ticket.uploadUrl!, "img", "image/png");
    const { url } = (await res.json()) as { url: string };
    expect(url).toBe(`${API}/dev/files/projects/u-cover.png`);
    expect(await readFile(join(root, "projects/u-cover.png"), "utf8")).toBe("img");

    await files.deletePublicImages([url, "https://elsewhere.example/projects/u-cover.png"]);
    await expect(readFile(join(root, "projects/u-cover.png"))).rejects.toThrow();
  });

  it("keeps a public file that is already there", async () => {
    const url = await files.putPublic("tasks/NW-1/s.png", Buffer.from("first"), "image/png");
    expect(await files.putPublic("tasks/NW-1/s.png", Buffer.from("second"), "image/png")).toBe(url);
    expect(await readFile(join(root, "tasks/NW-1/s.png"), "utf8")).toBe("first");
  });

  it("keeps every pathname inside its store", async () => {
    const ticket = (pathname: string, access: "public" | "private" = "private") =>
      files.uploadTicket(access, { pathname, contentTypes: ["image/png"], maxBytes: 1 });
    await expect(ticket("../outside.png")).rejects.toThrow();
    await expect(ticket("_private/a.png", "public")).rejects.toThrow();
    expect(await files.statPrivate("../../etc/passwd")).toBeNull();
  });

  it("refuses unknown tickets and other methods", async () => {
    expect((await put(`${API}/dev/uploads/nope`, "x", "image/png")).status).toBe(403);
    expect((await files.receive(new Request(`${API}/dev/uploads/nope`, { method: "OPTIONS" }))).status).toBe(204);
    expect((await put(`${API}/dev/uploads/nope`, "x", "image/png", "POST")).status).toBe(405);
  });
});
