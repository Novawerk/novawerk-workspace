import { describe, expect, it } from "vitest";

import { detectImageType, stripImage, stripImageMetadata } from "./strip.js";

// ─── PNG fixtures ────────────────────────────────────────────────────────────

const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]); // CRC not checked here
};
const png = (...chunks: Buffer[]) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
const IHDR = chunk("IHDR", Buffer.alloc(13, 1));
const IDAT = chunk("IDAT", Buffer.from("pixels"));
const IEND = chunk("IEND", Buffer.alloc(0));

// ─── JPEG fixtures ───────────────────────────────────────────────────────────

const seg = (marker: number, data: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
};
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const JFIF = seg(0xe0, Buffer.from("JFIF\0rest"));
const SOF0 = seg(0xc0, Buffer.alloc(15));
const DHT = seg(0xc4, Buffer.from("huffman-table"));
const SOS = seg(0xda, Buffer.alloc(10));
const EXIF = (text: string) => seg(0xe1, Buffer.from(`Exif\0\0${text}`));
/** Entropy data with a stuffed byte (FF00) and a restart marker (FFD3) inside. */
const SCAN = Buffer.concat([Buffer.from("scan-a"), Buffer.from([0xff, 0x00]), Buffer.from("scan-b"), Buffer.from([0xff, 0xd3]), Buffer.from("scan-c")]);
const jpeg = (...parts: Buffer[]) => Buffer.concat(parts);
const text = (b: Buffer) => b.toString("latin1");

describe("PNG", () => {
  it("keeps the allowlisted chunks and drops text, EXIF, C2PA and private chunks", () => {
    const input = png(
      IHDR,
      chunk("tEXt", Buffer.from("Author\0Lena Krause")),
      chunk("eXIf", Buffer.from("GPS 52.52N")),
      chunk("zxIf", Buffer.from("GPS zxif")),
      chunk("caBX", Buffer.from("c2pa manifest Lena")),
      chunk("prVt", Buffer.from("private Lena")),
      chunk("sRGB", Buffer.from([0])),
      IDAT,
      IEND,
      Buffer.from("after the end: Lena"),
    );
    const out = text(stripImageMetadata(input, "image/png"));
    for (const gone of ["Lena", "GPS", "c2pa", "after the end"]) expect(out).not.toContain(gone);
    for (const kept of ["IHDR", "sRGB", "pixels"]) expect(out).toContain(kept);
    expect(out.endsWith("IEND\0\0\0\0")).toBe(true);
  });

  it("refuses an unknown critical chunk, IHDR not first, and a PNG without its end", () => {
    expect(() => stripImageMetadata(png(IHDR, chunk("ABCD", Buffer.alloc(1)), IDAT, IEND), "image/png")).toThrow(/critical/);
    expect(() => stripImageMetadata(png(chunk("sRGB", Buffer.from([0])), IHDR, IDAT, IEND), "image/png")).toThrow(/IHDR/);
    expect(() => stripImageMetadata(png(IHDR, IDAT), "image/png")).toThrow(/end/);
  });
});

describe("JPEG", () => {
  it("keeps frame, tables, the scan (stuffed bytes and restarts included), JFIF, ICC and Adobe; drops EXIF, XMP, IPTC, MPF, comments", () => {
    const input = jpeg(
      SOI,
      JFIF,
      EXIF("GPS 52.52N Make Phone"),
      seg(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Lena</x:xmpmeta>")),
      seg(0xe2, Buffer.from("ICC_PROFILE\0profile")),
      seg(0xe2, Buffer.from("MPF\0index of appended images")),
      seg(0xed, Buffer.from("Photoshop 3.0 IPTC Lena")),
      seg(0xee, Buffer.from("Adobe\0colour")),
      seg(0xfe, Buffer.from("taken at home")),
      seg(0xdb, Buffer.alloc(65)),
      SOF0,
      DHT,
      SOS,
      SCAN,
      EOI,
    );
    const out = stripImage(input);
    expect(out.contentType).toBe("image/jpeg");
    const t = text(out.body);
    for (const gone of ["Exif", "GPS", "xmpmeta", "MPF", "IPTC", "taken at home", "Lena"]) expect(t).not.toContain(gone);
    for (const kept of ["JFIF", "ICC_PROFILE", "Adobe", "huffman-table"]) expect(t).toContain(kept);
    expect(out.body.includes(SCAN)).toBe(true);
    expect(t.endsWith("\xff\xd9")).toBe(true);
  });

  it("drops a second image after the end (an MPO, or an appended JPEG with its own EXIF)", () => {
    const second = jpeg(SOI, EXIF("GPS 48.13N Make Camera"), SOF0, DHT, SOS, Buffer.from("second-image"), EOI);
    const mpo = jpeg(SOI, JFIF, seg(0xe2, Buffer.from("MPF\0two frames")), SOF0, DHT, SOS, SCAN, EOI, second);
    const t = text(stripImage(mpo).body);
    for (const gone of ["GPS", "Camera", "second-image", "MPF"]) expect(t).not.toContain(gone);
    const appended = jpeg(SOI, JFIF, SOF0, DHT, SOS, SCAN, EOI, Buffer.from("trailing Exif\0\0GPS 1N"));
    expect(text(stripImage(appended).body)).not.toContain("GPS");
  });

  it("drops metadata between progressive scans and keeps the tables there", () => {
    const progressive = jpeg(SOI, JFIF, SOF0, DHT, SOS, SCAN, EXIF("GPS between scans"), seg(0xc4, Buffer.from("second-table")), SOS, Buffer.from("scan-2"), EOI);
    const t = text(stripImage(progressive).body);
    expect(t).not.toContain("GPS");
    expect(t).toContain("second-table");
    expect(t).toContain("scan-2");
  });

  it("refuses standalone markers where a segment belongs, a scan without a frame, and a JPEG without its end", () => {
    const tem = jpeg(SOI, JFIF, Buffer.from([0xff, 0x01]), EXIF("GPS hidden behind TEM"), SOF0, DHT, SOS, SCAN, EOI);
    expect(() => stripImage(tem)).toThrow(/FF01/);
    expect(() => stripImage(jpeg(SOI, JFIF, DHT, SOS, SCAN, EOI))).toThrow(/frame/);
    expect(() => stripImage(jpeg(SOI, JFIF, SOF0, DHT, SOS, SCAN))).toThrow(/end/);
  });
});

describe("types", () => {
  it("reads the type from the bytes, and refuses a mismatch or anything else", () => {
    expect(detectImageType(png(IHDR, IDAT, IEND))).toBe("image/png");
    expect(detectImageType(jpeg(SOI, JFIF))).toBe("image/jpeg");
    expect(detectImageType(Buffer.from("<svg/>"))).toBeNull();
    expect(() => stripImage(png(IHDR, IDAT, IEND), "image/jpeg")).toThrow(/Declared/);
    expect(() => stripImage(Buffer.from("GIF89a"))).toThrow();
    expect(() => stripImageMetadata(Buffer.alloc(10), "image/gif")).toThrow();
  });
});

describe("fuzz", () => {
  it("only ever returns or throws on mutated files, and never lets the metadata through", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const sources = [
      jpeg(SOI, JFIF, EXIF("GPS fuzz"), SOF0, DHT, SOS, SCAN, EOI, Buffer.from("Exif GPS tail")),
      png(IHDR, chunk("eXIf", Buffer.from("GPS fuzz")), IDAT, IEND),
    ];
    for (let i = 0; i < 4000; i++) {
      const input = Buffer.from(sources[i % 2]!);
      for (let k = 0; k <= rand(4); k++) input[rand(input.length)] = rand(256);
      try {
        const out = stripImage(input);
        expect(text(out.body)).not.toContain("GPS");
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    }
  });
});
