// Strip metadata from a PNG or JPEG before it goes public: EXIF (camera, place, time), XMP, IPTC,
// C2PA, comments, text chunks, appended images, where screenshots and photos carry personal data
// by accident. Both formats are rebuilt from an ALLOWLIST of the parts needed to show the image;
// everything else is dropped, and anything we can't read throws, so nothing unknown goes public.
// The pixels are copied as they are: no image library or native module needed.

export type StrippableType = "image/png" | "image/jpeg";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The image type from the bytes themselves (never the declared one), or null. */
export function detectImageType(body: Buffer): StrippableType | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  return null;
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

/** PNG chunks kept: the image, its palette and transparency, and how to show its colours. */
const PNG_KEEP = new Set([
  "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "iCCP", "sBIT", "sRGB", "cICP", "cLLi", "mDCv", "bKGD", "pHYs",
]);

function stripPng(input: Buffer): Buffer {
  if (detectImageType(input) !== "image/png") throw new Error("Not a PNG");
  const out: Buffer[] = [PNG_SIGNATURE];
  let at = 8;
  let first = true;
  while (at + 12 <= input.length) {
    const length = input.readUInt32BE(at);
    const type = input.toString("latin1", at + 4, at + 8);
    const end = at + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > input.length) throw new Error("A malformed PNG");
    if (first && type !== "IHDR") throw new Error("A PNG must start with IHDR");
    first = false;
    if (PNG_KEEP.has(type)) out.push(input.subarray(at, end));
    // An unknown critical chunk (upper-case first letter) means we can't know what the image is.
    else if (type[0]! >= "A" && type[0]! <= "Z") throw new Error(`A PNG with an unknown critical chunk ${type}`);
    at = end;
    if (type === "IEND") return Buffer.concat(out); // anything after IEND goes
  }
  throw new Error("A PNG without its end");
}

// ─── JPEG ────────────────────────────────────────────────────────────────────

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const DQT = 0xdb;
const DHT = 0xc4;
const DRI = 0xdd;
const COM = 0xfe;

/** Start of frame: SOF0–SOF15 without DHT (C4), JPG (C8) and DAC (CC). */
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
const isRst = (m: number) => m >= 0xd0 && m <= 0xd7;
const isApp = (m: number) => m >= 0xe0 && m <= 0xef;

const startsWith = (data: Buffer, text: string) => data.length >= text.length && data.toString("latin1", 0, text.length) === text;

/** APPn segments kept: JFIF, the ICC colour profile and Adobe's colour transform. Others are metadata. */
function keepApp(marker: number, data: Buffer): boolean {
  if (marker === 0xe0) return startsWith(data, "JFIF\0");
  if (marker === 0xe2) return startsWith(data, "ICC_PROFILE\0"); // not MPF (an index of appended images)
  if (marker === 0xee) return startsWith(data, "Adobe");
  return false;
}

/**
 * The segments around a scan: kept when needed to decode (frame, tables, restart interval, the
 * scan header and the kept APPn), dropped when metadata (other APPn, COM), refused otherwise
 * (standalone or unknown markers where a segment belongs).
 */
function segment(input: Buffer, at: number): { marker: number; end: number; keep: boolean } {
  if (at + 4 > input.length) throw new Error("A truncated JPEG");
  const marker = input[at + 1]!;
  if (marker === SOI || marker === EOI || isRst(marker) || marker === 0x01 || marker === 0x00 || marker === 0xff) {
    throw new Error(`A JPEG with marker FF${marker.toString(16).padStart(2, "0")} where a segment belongs`);
  }
  const length = input.readUInt16BE(at + 2);
  const end = at + 2 + length;
  if (length < 2 || end > input.length) throw new Error("A truncated JPEG");
  const data = input.subarray(at + 4, end);
  if (isSof(marker) || marker === DHT || marker === DQT || marker === DRI || marker === SOS) return { marker, end, keep: true };
  if (isApp(marker)) return { marker, end, keep: keepApp(marker, data) };
  if (marker === COM) return { marker, end, keep: false };
  throw new Error(`A JPEG with an unexpected segment FF${marker.toString(16)}`);
}

function stripJpeg(input: Buffer): Buffer {
  if (detectImageType(input) !== "image/jpeg") throw new Error("Not a JPEG");
  const out: Buffer[] = [input.subarray(0, 2)];
  let at = 2;
  let sawFrame = false;
  // Header segments up to the first scan.
  for (;;) {
    while (at < input.length && input[at] === 0xff && input[at + 1] === 0xff) at++; // fill bytes
    if (at + 1 >= input.length || input[at] !== 0xff) throw new Error("A malformed JPEG");
    const s = segment(input, at);
    if (s.keep) out.push(input.subarray(at, s.end));
    if (isSof(s.marker)) sawFrame = true;
    at = s.end;
    if (s.marker === SOS) break;
  }
  if (!sawFrame) throw new Error("A JPEG scan without a frame");
  // Entropy-coded data, and the segments between progressive scans, up to EOI.
  for (;;) {
    const scanStart = at;
    while (at < input.length) {
      if (input[at] !== 0xff) {
        at++;
        continue;
      }
      const next = input[at + 1];
      if (next === 0x00 || (next !== undefined && isRst(next))) {
        at += 2; // stuffed byte or restart marker: part of the data
        continue;
      }
      if (next === 0xff) {
        at++; // fill byte before a marker
        continue;
      }
      break;
    }
    out.push(input.subarray(scanStart, at));
    if (at + 1 >= input.length) throw new Error("A JPEG without its end");
    if (input[at + 1] === EOI) {
      out.push(input.subarray(at, at + 2)); // the end: whatever follows (appended images, EXIF) goes
      return Buffer.concat(out);
    }
    // A segment between scans: tables and the next scan are kept; metadata dropped; anything else refused.
    let sawScan = false;
    while (!sawScan) {
      const s = segment(input, at);
      if (isSof(s.marker)) throw new Error("A second frame in one JPEG");
      if (s.keep) out.push(input.subarray(at, s.end));
      sawScan = s.marker === SOS;
      at = s.end;
      if (!sawScan) {
        while (at < input.length && input[at] === 0xff && input[at + 1] === 0xff) at++;
        if (at + 1 >= input.length || input[at] !== 0xff) throw new Error("A malformed JPEG");
        if (input[at + 1] === EOI) {
          out.push(input.subarray(at, at + 2));
          return Buffer.concat(out);
        }
      }
    }
  }
}

/**
 * The same image without its metadata, typed by its own bytes. Throws for anything that isn't a
 * well-formed PNG or JPEG, or whose bytes don't match `declared` when given.
 */
export function stripImage(body: Buffer, declared?: string): { body: Buffer; contentType: StrippableType } {
  const type = detectImageType(body);
  if (!type) throw new Error("Not a PNG or JPEG");
  if (declared && declared !== type) throw new Error(`Declared ${declared}, but the bytes are ${type}`);
  return { body: type === "image/png" ? stripPng(body) : stripJpeg(body), contentType: type };
}

/** stripImage for a known type. Kept for callers that pass the type. */
export function stripImageMetadata(body: Buffer, contentType: string): Buffer {
  if (contentType !== "image/png" && contentType !== "image/jpeg") throw new Error(`Can't strip ${contentType}`);
  return stripImage(body, contentType).body;
}
