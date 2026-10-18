// @nw/object-store — Novawerk's files, in Vercel Blob. Two stores:
//
//   public  — project images for the website. Anyone with the URL can see them; Vercel's CDN
//             serves them.
//   private — contracts, NDAs, invoices, receipts, and the CVs visitors attach to a pitch or an
//             application. Every read needs a store token, so the API streams them to a
//             signed-in member after checking who asks.
//
// Uploads never pass through our functions: the API hands the browser a client token that is
// good for one pathname, a short time, a list of content types and a maximum size, and the
// browser uploads straight to the store. Per-member privacy is enforced in code: a member's
// private documents live under `<member id>/…` and nobody else's key is accepted. Visitors' CVs
// live under `_resumes/…` (no member handle starts with `_`).

import { BlobNotFoundError, del, get, head, list, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

export { detectImageType, stripImage, stripImageMetadata, type StrippableType } from "./strip.js";

/** Store tokens (`BLOB_PUBLIC_READ_WRITE_TOKEN`, `BLOB_PRIVATE_READ_WRITE_TOKEN`). Either may be missing. */
export interface FileStoreConfig {
  publicToken?: string;
  privateToken?: string;
}

export type FileAccess = "public" | "private";

export interface UploadTicket {
  token: string;
  pathname: string;
  access: FileAccess;
  /** Set by the local store: PUT the file here instead of uploading to Blob. */
  uploadUrl?: string;
}

export interface TicketRequest {
  pathname: string;
  contentTypes: readonly string[];
  maxBytes: number;
}

export interface StoredFile {
  pathname: string;
  contentType: string;
  size: number;
}

export interface OpenedFile extends StoredFile {
  stream: ReadableStream<Uint8Array>;
}

export interface ListedFile {
  pathname: string;
  size: number;
  uploadedAt: Date;
}

/** The operations the API needs. Tests pass a fake. */
export interface Files {
  /** Which stores have a token. Routes answer 503 for the missing one. */
  readonly ready: Record<FileAccess, boolean>;
  /** A client token for one upload to exactly `pathname`. */
  uploadTicket(access: FileAccess, request: TicketRequest): Promise<UploadTicket>;
  /** The private file's metadata, or null when there is no such file. */
  statPrivate(pathname: string): Promise<StoredFile | null>;
  /** Stream a private file, or null when there is no such file. */
  openPrivate(pathname: string): Promise<OpenedFile | null>;
  /** Every private file whose pathname starts with `prefix`. */
  listPrivate(prefix: string): Promise<ListedFile[]>;
  deletePrivate(pathname: string): Promise<void>;
  /** Delete public images we stored. URLs from anywhere else are ignored. */
  deletePublicImages(urls: string[]): Promise<void>;
  /** Put a file in the public store at exactly `pathname` (kept if already there); its URL. */
  putPublic(pathname: string, body: Buffer, contentType: string): Promise<string>;
}

/** A private file's bytes, or null when there is no such file. */
export async function readPrivate(files: Files, pathname: string): Promise<{ body: Buffer; contentType: string } | null> {
  const opened = await files.openPrivate(pathname);
  if (!opened) return null;
  return { body: Buffer.from(await new Response(opened.stream).arrayBuffer()), contentType: opened.contentType };
}

/** Client tokens live this long: enough to pick a file and upload it. */
const TICKET_TTL_MS = 10 * 60_000;

/** Throw if `key` is not inside member `owner`'s private prefix (`<owner>/...`). */
export function assertMemberPrefix(owner: string, key: string): void {
  const prefix = `${owner}/`;
  if (!key.startsWith(prefix)) {
    throw new Error(`access denied: key "${key}" is outside ${owner}'s prefix "${prefix}"`);
  }
}

/** Build the per-member private key for a filename. */
export function memberKey(owner: string, filename: string): string {
  return `${owner}/${filename.replace(/^\/+/, "")}`;
}

/**
 * A safe last path segment: "Grant agreement (signed).PDF" → "grant-agreement-signed.pdf".
 * Keeps the extension so the stored file still says what it is.
 */
export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const cleanStem =
    stem
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file";
  return ext ? `${cleanStem}.${ext}` : cleanStem;
}

/** True for URLs that point into a Vercel Blob public store. */
export function isPublicBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Vercel Blob behind the Files interface. */
export class BlobFiles implements Files {
  readonly ready: Record<FileAccess, boolean>;

  constructor(private readonly config: FileStoreConfig) {
    this.ready = { public: Boolean(config.publicToken), private: Boolean(config.privateToken) };
  }

  private token(access: FileAccess): string {
    const token = access === "public" ? this.config.publicToken : this.config.privateToken;
    if (!token) throw new Error(`The ${access} file store is not configured`);
    return token;
  }

  async uploadTicket(access: FileAccess, { pathname, contentTypes, maxBytes }: TicketRequest): Promise<UploadTicket> {
    const token = await generateClientTokenFromReadWriteToken({
      token: this.token(access),
      pathname,
      allowedContentTypes: [...contentTypes],
      maximumSizeInBytes: maxBytes,
      validUntil: Date.now() + TICKET_TTL_MS,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { token, pathname, access };
  }

  async statPrivate(pathname: string): Promise<StoredFile | null> {
    try {
      const blob = await head(pathname, { token: this.token("private") });
      return { pathname: blob.pathname, contentType: blob.contentType, size: blob.size };
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }

  async openPrivate(pathname: string): Promise<OpenedFile | null> {
    const result = await get(pathname, { access: "private", token: this.token("private") });
    if (!result || result.statusCode !== 200) return null;
    return {
      pathname: result.blob.pathname,
      contentType: result.blob.contentType,
      size: result.blob.size,
      stream: result.stream,
    };
  }

  async listPrivate(prefix: string): Promise<ListedFile[]> {
    const found: ListedFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, token: this.token("private") });
      for (const blob of page.blobs) found.push({ pathname: blob.pathname, size: blob.size, uploadedAt: blob.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return found;
  }

  async deletePrivate(pathname: string): Promise<void> {
    await del(pathname, { token: this.token("private") });
  }

  async putPublic(pathname: string, body: Buffer, contentType: string): Promise<string> {
    return putPublicOnce(this.token("public"), pathname, body, contentType);
  }

  async deletePublicImages(urls: string[]): Promise<void> {
    const ours = urls.filter(isPublicBlobUrl);
    if (ours.length) await del(ours, { token: this.token("public") });
  }
}

/**
 * Put one file in the public store at exactly `pathname` and return its URL; if a file is there
 * already, keep it. For content-addressed pathnames (the repo posts' pictures), where the same
 * pathname always means the same bytes.
 */
export async function putPublicOnce(token: string, pathname: string, body: Buffer, contentType: string): Promise<string> {
  try {
    return (await head(pathname, { token })).url;
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) throw err;
  }
  const blob = await put(pathname, body, { access: "public", token, contentType, addRandomSuffix: false, allowOverwrite: true });
  return blob.url;
}
