// What the Intake Agent reads from a CV the visitor attaches in the chat: its plain text, from a
// PDF (unpdf, the serverless build of PDF.js) or a .docx (mammoth). An old .doc or a scanned PDF
// has no text we can read: the CV is then attached for the team without being read.
//
// The text goes to the chat model, so we send less than the file holds: phone numbers we
// recognise are removed (we never ask for one; best effort, not a guarantee), angle brackets too
// (the text sits inside the context block), and it is capped in length.

import mammoth from "mammoth";
import { extractText } from "unpdf";

/** About 3,000 tokens: plenty for a CV, and it keeps every later turn's prompt small. */
export const MAX_RESUME_TEXT = 12_000;

/** Less than this after tidying is a scan or an empty page, not a CV we can read. */
const MIN_RESUME_TEXT = 40;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The CV's text, tidied for the model, or null when the file has none we can read. */
export async function resumeText(bytes: Uint8Array, contentType: string): Promise<string | null> {
  let raw: string;
  if (contentType === "application/pdf") raw = (await extractText(bytes, { mergePages: true })).text;
  else if (contentType === DOCX) raw = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  else return null;
  const text = tidyResumeText(raw);
  return text.length >= MIN_RESUME_TEXT ? text : null;
}

/** Digit groups joined by the separators phone numbers use, optionally after a "+". */
const NUMBER_RUN = /\+?\d+(?:[ \t().\/–-]{1,3}\d+)*/g;
const PHONE_LABEL = /(tel|phone|mobile|mobil|handy|cell|fon|whatsapp|电话|手机)[^\n\d+]{0,12}$/i;
const YEAR_GROUP = /(^|\D)(19|20)\d\d(\D|$)/;

/**
 * True for what looks like a phone number: international ("+49 …"), right after a label
 * ("Tel: …", "手机：…"), or 9 to 15 digits without a year in it. Year ranges and dates
 * ("2019 – 2023", "01/2019 - 03/2021") and postcodes stay.
 */
export function isPhoneNumber(run: string, before: string): boolean {
  const digits = run.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return false;
  if (run.startsWith("+") && digits >= 8) return true;
  if (PHONE_LABEL.test(before)) return true;
  return digits >= 9 && !YEAR_GROUP.test(run);
}

export function tidyResumeText(raw: string): string {
  const withoutPhones = raw.replace(NUMBER_RUN, (run, offset: number, all: string) =>
    isPhoneNumber(run, all.slice(Math.max(0, offset - 20), offset)) ? "[phone removed]" : run,
  );
  const text = withoutPhones
    .replace(/[<>]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > MAX_RESUME_TEXT ? `${text.slice(0, MAX_RESUME_TEXT).trimEnd()}\n[the rest of the CV is cut]` : text;
}
