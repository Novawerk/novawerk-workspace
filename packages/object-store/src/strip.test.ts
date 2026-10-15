import { describe, expect, it } from "vitest";

import { stripImageMetadata } from "./strip.js";

const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]); // CRC not checked here
};
const png = (...chunks: Buffer[]) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);

const segment = (marker: number, data: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
};

describe("stripImageMetadata", () => {
  it("drops a PNG's text, EXIF and time chunks, keeps the image", () => {
    const input = png(
      chunk("IHDR", Buffer.alloc(13, 1)),
      chunk("tEXt", Buffer.from("Author\0Lena Krause")),
      chunk("eXIf", Buffer.from("GPS 52.52N 13.40E")),
      chunk("tIME", Buffer.alloc(7)),
      chunk("IDAT", Buffer.from("pixels")),
      chunk("IEND", Buffer.alloc(0)),
    );
    const out = stripImageMetadata(input, "image/png");
    expect(out.toString("latin1")).not.toContain("Lena");
    expect(out.toString("latin1")).not.toContain("GPS");
    expect(out.toString("latin1")).toContain("IHDR");
    expect(out.toString("latin1")).toContain("pixels");
    expect(out.toString("latin1").endsWith("IEND\0\0\0\0")).toBe(true);
  });

  it("drops a JPEG's EXIF, XMP, IPTC and comments, keeps JFIF, the colour profile and the scan", () => {
    const input = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xe0, Buffer.from("JFIF\0")),
      segment(0xe1, Buffer.from("Exif\0\0GPS 52.52N")),
      segment(0xe2, Buffer.from("ICC_PROFILE\0")),
      segment(0xed, Buffer.from("Photoshop 3.0 IPTC Lena")),
      segment(0xfe, Buffer.from("taken at home")),
      segment(0xdb, Buffer.alloc(65)),
      Buffer.from([0xff, 0xda, 0x00, 0x02]),
      Buffer.from("compressed-pixels"),
      Buffer.from([0xff, 0xd9]),
    ]);
    const out = stripImageMetadata(input, "image/jpeg").toString("latin1");
    for (const gone of ["Exif", "GPS", "IPTC", "taken at home"]) expect(out).not.toContain(gone);
    for (const kept of ["JFIF", "ICC_PROFILE", "compressed-pixels"]) expect(out).toContain(kept);
  });

  it("refuses anything that isn't a well-formed PNG or JPEG", () => {
    expect(() => stripImageMetadata(Buffer.from("<svg/>"), "image/png")).toThrow();
    expect(() => stripImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), "image/jpeg")).toThrow();
    expect(() => stripImageMetadata(png(chunk("IHDR", Buffer.alloc(13))), "image/png")).toThrow(/end/);
    expect(() => stripImageMetadata(Buffer.alloc(10), "image/gif")).toThrow();
  });
});
