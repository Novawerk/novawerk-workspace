// Guards the per-member privacy boundary: a member may only touch keys under their own prefix.
// assertMemberPrefix is the check every read/write path runs before hitting R2.

import { describe, expect, it } from "vitest";
import { assertMemberPrefix, memberKey } from "./index.js";

describe("memberKey", () => {
  it("namespaces a filename under the owner's prefix", () => {
    expect(memberKey("ada", "invoice.pdf")).toBe("ada/invoice.pdf");
  });

  it("strips leading slashes so the prefix can't be escaped", () => {
    expect(memberKey("ada", "/etc/passwd")).toBe("ada/etc/passwd");
  });
});

describe("assertMemberPrefix", () => {
  it("allows a key inside the owner's prefix", () => {
    expect(() => assertMemberPrefix("ada", "ada/invoice.pdf")).not.toThrow();
  });

  it("rejects another member's prefix", () => {
    expect(() => assertMemberPrefix("ada", "bob/invoice.pdf")).toThrow(/access denied/);
  });

  it("rejects a sibling-prefix lookalike (ada vs ada-evil)", () => {
    // "ada-evil/x" must NOT count as inside "ada/" — the trailing slash is what makes it safe.
    expect(() => assertMemberPrefix("ada", "ada-evil/x")).toThrow(/access denied/);
  });

  it("rejects a bare-name key with no prefix", () => {
    expect(() => assertMemberPrefix("ada", "invoice.pdf")).toThrow(/access denied/);
  });
});

// ─── BlobFiles over a mocked @vercel/blob ────────────────────────────────────

import { beforeEach, vi } from "vitest";

const blob = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  generateClientTokenFromReadWriteToken: vi.fn(),
  NotFound: class BlobNotFoundError extends Error {},
}));
vi.mock("@vercel/blob", () => ({
  del: blob.del,
  get: blob.get,
  head: blob.head,
  list: blob.list,
  BlobNotFoundError: blob.NotFound,
}));
vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: blob.generateClientTokenFromReadWriteToken,
}));

const { BlobFiles, isPublicBlobUrl, safeFilename } = await import("./index.js");

describe("safeFilename", () => {
  it("keeps a clean stem and the extension", () => {
    expect(safeFilename("Grant agreement (signed).PDF")).toBe("grant-agreement-signed.pdf");
    expect(safeFilename("Quittung März.jpeg")).toBe("quittung-marz.jpeg");
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\ada\\scan.png")).toBe("scan.png");
    expect(safeFilename("合同.pdf")).toBe("file.pdf");
    expect(safeFilename(".env")).toBe("env");
  });
});

describe("isPublicBlobUrl", () => {
  it("accepts only https URLs on a public Blob host", () => {
    expect(isPublicBlobUrl("https://abc.public.blob.vercel-storage.com/projects/x.png")).toBe(true);
    expect(isPublicBlobUrl("http://abc.public.blob.vercel-storage.com/x.png")).toBe(false);
    expect(isPublicBlobUrl("https://abc.private.blob.vercel-storage.com/x.png")).toBe(false);
    expect(isPublicBlobUrl("https://evil.com/?h=.public.blob.vercel-storage.com")).toBe(false);
    expect(isPublicBlobUrl("not a url")).toBe(false);
  });
});

describe("BlobFiles", () => {
  beforeEach(() => {
    for (const fn of [blob.del, blob.get, blob.head, blob.list, blob.generateClientTokenFromReadWriteToken]) fn.mockReset();
  });

  it("knows which stores are configured", () => {
    expect(new BlobFiles({ publicToken: "pub" }).ready).toEqual({ public: true, private: false });
  });

  it("issues a client token for one pathname, with type and size limits", async () => {
    blob.generateClientTokenFromReadWriteToken.mockResolvedValue("client-token");
    const files = new BlobFiles({ publicToken: "pub", privateToken: "priv" });
    const ticket = await files.uploadTicket("private", {
      pathname: "ada/abc-contract.pdf",
      contentTypes: ["application/pdf"],
      maxBytes: 1000,
    });
    expect(ticket).toEqual({ token: "client-token", pathname: "ada/abc-contract.pdf", access: "private" });
    expect(blob.generateClientTokenFromReadWriteToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "priv",
        pathname: "ada/abc-contract.pdf",
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 1000,
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil: expect.any(Number),
      }),
    );
  });

  it("refuses to work with a store that has no token", async () => {
    await expect(
      new BlobFiles({}).uploadTicket("public", { pathname: "x.png", contentTypes: [], maxBytes: 1 }),
    ).rejects.toThrow(/not configured/);
  });

  it("stat answers null for a missing file", async () => {
    blob.head.mockRejectedValueOnce(new blob.NotFound("missing"));
    expect(await new BlobFiles({ privateToken: "priv" }).statPrivate("ada/x.pdf")).toBeNull();
    blob.head.mockResolvedValueOnce({ pathname: "ada/x.pdf", contentType: "application/pdf", size: 12 });
    expect(await new BlobFiles({ privateToken: "priv" }).statPrivate("ada/x.pdf")).toEqual({
      pathname: "ada/x.pdf",
      contentType: "application/pdf",
      size: 12,
    });
  });

  it("lists private files under a prefix, page by page", async () => {
    const at = new Date("2026-10-01T10:00:00Z");
    const item = (pathname: string) => ({ pathname, size: 10, uploadedAt: at, url: "u", downloadUrl: "d", etag: "e" });
    blob.list
      .mockResolvedValueOnce({ blobs: [item("_resumes/a.pdf")], hasMore: true, cursor: "next" })
      .mockResolvedValueOnce({ blobs: [item("_resumes/b.pdf")], hasMore: false });
    const listed = await new BlobFiles({ privateToken: "priv" }).listPrivate("_resumes/");
    expect(listed).toEqual([
      { pathname: "_resumes/a.pdf", size: 10, uploadedAt: at },
      { pathname: "_resumes/b.pdf", size: 10, uploadedAt: at },
    ]);
    expect(blob.list).toHaveBeenNthCalledWith(1, { prefix: "_resumes/", cursor: undefined, token: "priv" });
    expect(blob.list).toHaveBeenNthCalledWith(2, { prefix: "_resumes/", cursor: "next", token: "priv" });
  });

  it("deletes only public images that live in a Blob store", async () => {
    const files = new BlobFiles({ publicToken: "pub" });
    await files.deletePublicImages(["https://elsewhere.org/a.png"]);
    expect(blob.del).not.toHaveBeenCalled();
    await files.deletePublicImages([
      "https://abc.public.blob.vercel-storage.com/projects/a.png",
      "https://elsewhere.org/b.png",
    ]);
    expect(blob.del).toHaveBeenCalledWith(["https://abc.public.blob.vercel-storage.com/projects/a.png"], {
      token: "pub",
    });
  });
});
