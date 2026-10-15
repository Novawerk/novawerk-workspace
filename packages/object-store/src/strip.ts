// Strip metadata from a PNG or JPEG before it goes public: EXIF (camera, place, time), XMP, IPTC,
// comments and text chunks, where screenshots and photos carry personal data by accident. The
// pixels are untouched; no image library or native module needed. Anything that isn't a
// well-formed PNG or JPEG throws, so it never goes public by mistake.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG chunks that carry text or metadata. Everything else (pixels, palette, colour, gamma) stays. */
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function stripPng(input: Buffer): Buffer {
  if (input.length < 8 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Not a PNG");
  const out: Buffer[] = [PNG_SIGNATURE];
  let at = 8;
  let ended = false;
  while (at + 12 <= input.length) {
    const length = input.readUInt32BE(at);
    const type = input.toString("latin1", at + 4, at + 8);
    const end = at + 12 + length;
    if (end > input.length) throw new Error("A truncated PNG");
    if (!PNG_DROP.has(type)) out.push(input.subarray(at, end));
    at = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) throw new Error("A PNG without its end");
  return Buffer.concat(out);
}

/**
 * JPEG segments to drop: APP1 (EXIF, XMP), APP3–APP13 (IPTC and vendor data), APP15, COM. Kept:
 * APP0 (JFIF), APP2 (ICC colour profile), APP14 (Adobe colour transform): needed to show it right.
 */
const isDroppedJpegMarker = (m: number) => m === 0xe1 || (m >= 0xe3 && m <= 0xed) || m === 0xef || m === 0xfe;

function stripJpeg(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) throw new Error("Not a JPEG");
  const out: Buffer[] = [input.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= input.length) {
    if (input[at] !== 0xff) throw new Error("A malformed JPEG");
    const marker = input[at + 1]!;
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the compressed image (and anything after it) is copied as it is.
      out.push(input.subarray(at));
      return Buffer.concat(out);
    }
    const length = input.readUInt16BE(at + 2);
    const end = at + 2 + length;
    if (length < 2 || end > input.length) throw new Error("A truncated JPEG");
    if (!isDroppedJpegMarker(marker)) out.push(input.subarray(at, end));
    at = end;
  }
  throw new Error("A JPEG without image data");
}

/** The same image without its metadata. Throws for anything that isn't a well-formed PNG or JPEG. */
export function stripImageMetadata(body: Buffer, contentType: string): Buffer {
  if (contentType === "image/png") return stripPng(body);
  if (contentType === "image/jpeg") return stripJpeg(body);
  throw new Error(`Can't strip ${contentType}`);
}
