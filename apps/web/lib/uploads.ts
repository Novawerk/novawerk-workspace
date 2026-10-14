// The CV a visitor may attach to a pitch or an application. The API hands out a ticket (a token
// for one pathname, one type and at most 5 MB), then the file goes from the browser straight to
// our private file store at Vercel. It never passes through our API, and only members can open
// it again.

import {
  MAX_RESUME_BYTES,
  RESUME_CONTENT_TYPES,
  type ApiError,
  type ResumeContentType,
  type ResumeRef,
  type ResumeUploadTicket,
} from "@nw/contracts";

/** What the file picker offers. Some systems leave the type of Word files empty, so extensions too. */
export const RESUME_ACCEPT = [...RESUME_CONTENT_TYPES, ".pdf", ".doc", ".docx"].join(",");

export const RESUME_FORMATS = "PDF or Word, up to 5 MB.";
/** For the plain forms, where no assistant reads it. */
export const RESUME_HELP = `${RESUME_FORMATS} Only our team can open it.`;

const BY_EXTENSION: Record<string, ResumeContentType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

/** The file's type if we take it, else null. Falls back to the extension when the browser doesn't know. */
export function resumeContentType(file: Pick<File, "name" | "type">): ResumeContentType | null {
  if ((RESUME_CONTENT_TYPES as readonly string[]).includes(file.type)) return file.type as ResumeContentType;
  if (file.type && file.type !== "application/octet-stream") return null;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return (ext && BY_EXTENSION[ext]) || null;
}

/** A failed upload, with a message for the visitor. */
export class UploadError extends Error {
  override name = "UploadError";
}

const TRY_AGAIN = "The upload didn't work. Please try again.";

async function requestTicket(file: File, contentType: ResumeContentType): Promise<ResumeUploadTicket> {
  // Must be referenced literally so Next inlines it into the client bundle.
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!base) throw new UploadError("CV uploads are off right now. Add a link to your CV instead.");

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}/public/uploads/resume`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new UploadError("We can't reach Novawerk right now. Check your connection and try again.");
  }
  if (res.ok) return (await res.json()) as ResumeUploadTicket;

  // 400 names the field (type, size); 429 and 503 say what to do in `error`.
  const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
  const issue = body?.issues ? Object.values(body.issues).flat()[0] : undefined;
  throw new UploadError(issue ?? (res.status === 429 || res.status === 503 ? body?.error : undefined) ?? TRY_AGAIN);
}

/**
 * Upload a CV. Resolves to what the form sends along; rejects with an UploadError whose message
 * can be shown as it is.
 */
export async function uploadResume(file: File, onProgress?: (percent: number) => void): Promise<ResumeRef> {
  const contentType = resumeContentType(file);
  if (!contentType) throw new UploadError("Use a PDF or a Word file.");
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_RESUME_BYTES) {
    throw new UploadError(`That file is ${(file.size / 1_048_576).toFixed(1)} MB. A CV can be up to 5 MB.`);
  }

  const ticket = await requestTicket(file, contentType);
  // Loaded on first use: most visitors never attach a file.
  const { put } = await import("@vercel/blob/client");
  try {
    await put(ticket.pathname, file, {
      access: "private",
      token: ticket.token,
      contentType,
      onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
    });
  } catch {
    throw new UploadError(TRY_AGAIN);
  }
  return { pathname: ticket.pathname, name: file.name.trim().slice(0, 200) || "CV" };
}
