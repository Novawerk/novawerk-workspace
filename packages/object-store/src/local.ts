// @nw/object-store/local — both stores in a folder on this machine, for local development without
// Vercel Blob. The local API uses it when DEV_LOGIN=true and no BLOB_* token is set.
//
//   public  — <root>/<pathname>, served at <publicBase><pathname> (the local API's /dev/files/).
//   private — <root>/_private/<pathname>, never served as it is; the API streams it like Blob's.
//
// Uploads work as with Blob: the API hands out a ticket for one pathname, its types and a size,
// and the browser PUTs the file to the ticket's `uploadUrl`. The tickets live in memory, so a
// restarted API forgets the ones it gave out.

import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import type { FileAccess, Files, ListedFile, OpenedFile, StoredFile, TicketRequest, UploadTicket } from "./index.js";

/** Private files live here, below the root. `/dev/files/` must not serve it. */
export const LOCAL_PRIVATE_DIR = "_private";

const TICKET_TTL_MS = 10 * 60_000;

/** Content types by extension: our pathnames keep the uploaded file's extension. */
const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".zip": "application/zip",
};

export function contentTypeOf(pathname: string): string {
  return TYPES[extname(pathname).toLowerCase()] ?? "application/octet-stream";
}

interface Ticket extends TicketRequest {
  access: FileAccess;
  expires: number;
}

export interface LocalFilesOptions {
  /** The folder, e.g. .local-files/ at the repo root. */
  root: string;
  /** Where public files are served, ending in `/`, e.g. http://localhost:8787/dev/files/ */
  publicBase: string;
  /** Where the browser PUTs uploads, ending in `/`; the ticket's token follows. */
  uploadBase: string;
}

export class LocalFiles implements Files {
  readonly ready: Record<FileAccess, boolean> = { public: true, private: true };
  private readonly root: string;
  private readonly tickets = new Map<string, Ticket>();

  constructor(private readonly options: LocalFilesOptions) {
    this.root = resolve(options.root);
  }

  /** The file for a pathname, or null when it would land outside its store. */
  private path(access: FileAccess, pathname: string): string | null {
    const base = access === "public" ? this.root : join(this.root, LOCAL_PRIVATE_DIR);
    const file = resolve(base, pathname);
    if (!file.startsWith(base + sep)) return null;
    if (access === "public" && file.startsWith(join(this.root, LOCAL_PRIVATE_DIR) + sep)) return null;
    return file;
  }

  async uploadTicket(access: FileAccess, request: TicketRequest): Promise<UploadTicket> {
    if (!this.path(access, request.pathname)) throw new Error(`Bad pathname "${request.pathname}"`);
    const now = Date.now();
    for (const [token, t] of this.tickets) if (t.expires < now) this.tickets.delete(token);
    const token = randomBytes(24).toString("base64url");
    this.tickets.set(token, { ...request, access, expires: now + TICKET_TTL_MS });
    return { token, pathname: request.pathname, access, uploadUrl: `${this.options.uploadBase}${token}` };
  }

  /**
   * The upload a ticket's `uploadUrl` takes: `PUT <uploadBase><token>` with the file as the body.
   * Answers like the Blob API would: 200 with the file's URL (public) or pathname.
   */
  async receive(req: Request): Promise<Response> {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PUT",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const fail = (status: number, error: string) => Response.json({ error }, { status, headers: cors });
    if (req.method !== "PUT") return fail(405, "Use PUT");

    const token = new URL(req.url).pathname.split("/").pop() ?? "";
    const ticket = this.tickets.get(token);
    if (!ticket || ticket.expires < Date.now()) return fail(403, "This upload ticket is unknown or expired");
    const type = req.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ticket.contentTypes.includes(type)) return fail(400, `Content type "${type}" is not allowed`);
    const body = Buffer.from(await req.arrayBuffer());
    if (body.length > ticket.maxBytes) return fail(413, `The file is larger than ${ticket.maxBytes} bytes`);

    const file = this.path(ticket.access, ticket.pathname)!;
    this.tickets.delete(token);
    await mkdir(dirname(file), { recursive: true });
    try {
      await writeFile(file, body, { flag: "wx" }); // no overwrite, like the Blob tickets
    } catch {
      return fail(409, "A file is already at this pathname");
    }
    const url = ticket.access === "public" ? this.publicUrl(ticket.pathname) : undefined;
    return Response.json({ pathname: ticket.pathname, ...(url ? { url } : {}) }, { headers: cors });
  }

  private publicUrl(pathname: string): string {
    return `${this.options.publicBase}${pathname.split("/").map(encodeURIComponent).join("/")}`;
  }

  async statPrivate(pathname: string): Promise<StoredFile | null> {
    const file = this.path("private", pathname);
    if (!file) return null;
    try {
      const s = await stat(file);
      return s.isFile() ? { pathname, contentType: contentTypeOf(pathname), size: s.size } : null;
    } catch {
      return null;
    }
  }

  async openPrivate(pathname: string): Promise<OpenedFile | null> {
    const found = await this.statPrivate(pathname);
    if (!found) return null;
    const stream = Readable.toWeb(createReadStream(this.path("private", pathname)!)) as ReadableStream<Uint8Array>;
    return { ...found, stream };
  }

  async listPrivate(prefix: string): Promise<ListedFile[]> {
    const base = join(this.root, LOCAL_PRIVATE_DIR);
    let entries: string[];
    try {
      entries = await readdir(base, { recursive: true });
    } catch {
      return [];
    }
    const found: ListedFile[] = [];
    for (const entry of entries) {
      const pathname = entry.split(sep).join("/");
      if (!pathname.startsWith(prefix)) continue;
      const s = await stat(join(base, entry));
      if (s.isFile()) found.push({ pathname, size: s.size, uploadedAt: s.mtime });
    }
    return found;
  }

  async deletePrivate(pathname: string): Promise<void> {
    const file = this.path("private", pathname);
    if (file) await rm(file, { force: true });
  }

  async deletePublicImages(urls: string[]): Promise<void> {
    for (const url of urls) {
      if (!url.startsWith(this.options.publicBase)) continue;
      const pathname = url.slice(this.options.publicBase.length).split("/").map(decodeURIComponent).join("/");
      const file = this.path("public", pathname);
      if (file) await rm(file, { force: true });
    }
  }

  async putPublic(pathname: string, body: Buffer, contentType: string): Promise<string> {
    void contentType; // served by extension
    const file = this.path("public", pathname);
    if (!file) throw new Error(`Bad pathname "${pathname}"`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body, { flag: "wx" }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "EEXIST") throw err; // kept if already there
    });
    return this.publicUrl(pathname);
  }
}
