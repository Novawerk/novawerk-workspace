// Uploads go straight from the browser to Vercel Blob: the API hands out a ticket (a client token
// for one pathname, type and size), then `put` sends the file. Nothing passes through our API.

import { put } from "@vercel/blob/client"

import {
  DOCUMENT_CONTENT_TYPES,
  IMAGE_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  PROJECT_FILE_CONTENT_TYPES,
  type DocumentUploadInput,
  type ImageUploadInput,
  type ProjectFileUploadInput,
} from "@nw/contracts"

import { dataSource } from "./data-source"

export type Progress = (percent: number) => void

/** Thrown before any network call when a file can't be uploaded. */
export class UploadRefused extends Error {
  override name = "UploadRefused"
}

function check(file: File, types: readonly string[], maxBytes: number, what: string, type = file.type) {
  if (!types.includes(type)) throw new UploadRefused(`${file.name}: ${what}`)
  if (file.size > maxBytes) {
    throw new UploadRefused(`${file.name} is ${(file.size / 1_048_576).toFixed(1)} MB; the limit is ${maxBytes / 1_048_576} MB.`)
  }
}

/** Upload a project picture to the public store. Returns its public https URL. */
export async function uploadImage(file: File, onProgress?: Progress): Promise<string> {
  check(file, IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, "use a JPEG, PNG, WebP, GIF or AVIF image.")
  const contentType = file.type as ImageUploadInput["contentType"] // checked above
  const ticket = await dataSource.imageTicket({ filename: file.name, contentType, size: file.size })
  const blob = await put(ticket.pathname, file, {
    access: "public",
    token: ticket.token,
    contentType: file.type,
    onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
  })
  return blob.url
}

/** Upload a document to the private store. Returns the pathname to record with createDocument. */
export async function uploadDocument(file: File, onProgress?: Progress): Promise<string> {
  check(file, DOCUMENT_CONTENT_TYPES, MAX_DOCUMENT_BYTES, "use a PDF, an image, or a Word or Excel file.")
  const contentType = file.type as DocumentUploadInput["contentType"] // checked above
  const ticket = await dataSource.documentTicket({ filename: file.name, contentType, size: file.size })
  await put(ticket.pathname, file, {
    access: "private",
    token: ticket.token,
    contentType: file.type,
    onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
  })
  return ticket.pathname
}

/** Upload one of a project's files to the private store. Returns the pathname to record. */
export async function uploadProjectFile(projectId: string, file: File, onProgress?: Progress): Promise<string> {
  // Browsers leave the type empty for Markdown; go by the extension then.
  const type = file.type || (/\.md$/i.test(file.name) ? "text/markdown" : "")
  check(file, PROJECT_FILE_CONTENT_TYPES, MAX_DOCUMENT_BYTES, "use a PDF, an image, a Word, Excel or PowerPoint file, text, Markdown or a zip.", type)
  const contentType = type as ProjectFileUploadInput["contentType"] // checked above
  const ticket = await dataSource.projectFileTicket(projectId, { filename: file.name, contentType, size: file.size })
  await put(ticket.pathname, file, {
    access: "private",
    token: ticket.token,
    contentType,
    onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
  })
  return ticket.pathname
}

/** "Grant agreement.pdf" → "Grant agreement": a default title for an uploaded document. */
export function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || name
}

/** What the file picker should offer. */
export const IMAGE_ACCEPT = IMAGE_CONTENT_TYPES.join(",")
export const DOCUMENT_ACCEPT = [...DOCUMENT_CONTENT_TYPES, ".pdf", ".docx", ".xlsx", ".heic"].join(",")
export const PROJECT_FILE_ACCEPT = [...PROJECT_FILE_CONTENT_TYPES, ".pdf", ".docx", ".xlsx", ".pptx", ".md", ".txt", ".zip", ".heic"].join(",")
