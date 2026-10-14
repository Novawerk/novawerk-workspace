// The picture templates render to PNGs of the right size in every layout, offline (no fonts
// fetched: @vercel/og falls back to its built-in face).

import { describe, expect, it, vi } from "vitest";

import { CARD_FORMATS, CARD_FORMAT_NAMES, LINK_PATTERN, POST_KINDS, POST_PLATFORM_INFO, POST_TEMPLATES, emptyPostCard, type PostCardInput } from "@nw/contracts";

import {
  cardTree,
  cjkCharacters,
  createFontLoader,
  fitDisplay,
  fitSize,
  fontUrlFromCss,
  markOf,
  numberIn,
  PALETTE,
  photoDataUri,
  renderCard,
  splitCredit,
  splitLabel,
} from "./index.js";

const noFonts = async () => [];

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: ArrayBuffer): { width: number; height: number } {
  const view = new DataView(bytes);
  expect(view.getUint32(0)).toBe(0x89504e47);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// A 1×1 PNG, the smallest real picture.
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
const PIXEL_URI = `data:image/png;base64,${Buffer.from(PIXEL).toString("base64")}`;

const CARDS: Record<string, { kind: "kickoff" | "launch" | "ten_day" | "retro"; card: PostCardInput; photo?: string }> = {
  statement: {
    kind: "kickoff",
    card: {
      ...emptyPostCard(),
      eyebrow: "Someone wished for it",
      headline: "Berlin Food Map",
      lede: "A map kept by the people who eat there.",
      points: ["First deliverable: 20 places", "Looking for a Builder"],
      footer: "Wished by Min",
    },
  },
  photo: { kind: "launch", card: { ...emptyPostCard(), eyebrow: "New from Novawerk", headline: "YIMA" }, photo: PIXEL_URI },
  quote: { kind: "ten_day", card: { ...emptyPostCard(), quote: { text: "Finally one that doesn't sell my data.", by: "A user" } } },
  numbers: { kind: "retro", card: { ...emptyPostCard(), headline: "YIMA", stats: [{ value: "212", label: "stars" }] } },
};

describe("reading the card's lines", () => {
  it("splits labels, credits, marks and numbers out of plain lines", () => {
    expect(splitLabel("First deliverable: 20 places · Yu")).toEqual({ label: "First deliverable", value: "20 places · Yu" });
    expect(splitLabel("首个交付：20 家店")).toEqual({ label: "首个交付", value: "20 家店" });
    expect(splitLabel("18 October, 14:00–18:00")).toEqual({ label: null, value: "18 October, 14:00–18:00" });
    expect(splitCredit("设计 —— Aiko")).toEqual({ role: "设计", name: "Aiko" });
    expect(splitCredit("Design — Aiko")).toEqual({ role: "Design", name: "Aiko" });
    expect(splitCredit("14:00–18:00")).toEqual({ role: null, name: "14:00–18:00" });
    expect([markOf("完成：种子清单"), markOf("Next: tags"), markOf("Lin joined")]).toEqual(["done", "next", "dot"]);
    expect([numberIn("第 3 周进展"), numberIn("Day 90"), numberIn("Before launch")]).toEqual(["03", "90", null]);
  });

  it("never leaves one Chinese character alone on the last line of a headline", () => {
    // 6 characters at 210 px on 1050 px would break 5 + 1: one line instead.
    const size = fitDisplay("柏林中餐地图", 1050, { max: 210, min: 80, lines: 2 });
    expect(Math.floor(1050 / size)).toBeGreaterThanOrEqual(6);
    // 4 + 2 reads well ("来工作坊 / 坐坐"): kept at the biggest size.
    expect(fitDisplay("来工作坊坐坐", 1050, { max: 230, min: 80, lines: 2 })).toBe(230);
    // The writer's own line breaks win.
    expect(fitDisplay("终于有一个\n不卖我数据的。", 1050, { max: 124, min: 40, lines: 4 })).toBe(124);
  });
});

describe("renderCard", () => {
  for (const [layout, spec] of Object.entries(CARDS)) {
    it.each(CARD_FORMAT_NAMES)(`renders the ${layout} layout as %s`, async (format) => {
      const png = await renderCard({ ...spec, lang: "en", format }, { fonts: noFonts });
      expect(pngSize(png)).toEqual({ width: CARD_FORMATS[format].width, height: CARD_FORMATS[format].height });
    });
  }

  it.each(POST_KINDS)("renders the %s template's example in every size", async (kind) => {
    for (const format of CARD_FORMAT_NAMES) {
      const t = POST_TEMPLATES[kind];
      const png = await renderCard({ kind, lang: "zh", format, card: t.example.zh.card, photo: t.photo ? PIXEL_URI : null }, { fonts: noFonts });
      expect(pngSize(png)).toEqual({ width: CARD_FORMATS[format].width, height: CARD_FORMATS[format].height });
    }
  });

  it("sets every card on black, the HUD in the signal green, and codes each kind", () => {
    const launch = JSON.stringify(cardTree({ kind: "launch", lang: "en", format: "portrait", card: POST_TEMPLATES.launch.example.en.card }));
    expect(launch).toContain(`"backgroundColor":"${PALETTE.ground}"`);
    expect(launch).toContain("Status: online");
    expect(launch).toContain("T-0 // Launch");
    const progress = JSON.stringify(cardTree({ kind: "progress", lang: "zh", format: "portrait", card: POST_TEMPLATES.progress.example.zh.card }));
    expect(progress).toContain("Phase:03");
    expect(progress).toContain(PALETTE.accent);
  });

  it("prints no web address on a Xiaohongshu card, and keeps it on the others", () => {
    const xiaohongshu = POST_PLATFORM_INFO.xiaohongshu.format;
    /** Every piece of text drawn on the card. */
    const texts = (node: unknown): string[] => {
      if (typeof node === "string") return [node];
      if (Array.isArray(node)) return node.flatMap(texts);
      if (node && typeof node === "object") return texts((node as { props?: { children?: unknown } }).props?.children);
      return [];
    };
    const linked: PostCardInput = {
      ...emptyPostCard(),
      eyebrow: "新项目上线",
      headline: "YIMA",
      lede: "一个不卖你数据的经期日历。",
      points: ["记录不出手机", "立即使用：novawerk.io/portfolio/yima", "加入：info@novawerk.io"],
      footer: "novawerk.io/portfolio/yima",
    };
    for (const kind of POST_KINDS) {
      for (const [lang, card] of [
        ["zh", linked],
        ["zh", POST_TEMPLATES[kind].example.zh.card],
        ["en", POST_TEMPLATES[kind].example.en.card],
      ] as const) {
        const drawn = texts(cardTree({ kind, lang, format: xiaohongshu, card, photo: PIXEL_URI })).join("\n");
        expect(drawn.match(LINK_PATTERN), `${kind} ${lang}`).toBeNull();
      }
    }
    const zh = texts(cardTree({ kind: "launch", lang: "zh", format: xiaohongshu, card: linked })).join("\n");
    expect(zh).toContain("记录不出手机");
    expect(zh).toContain("YIMA");

    const square = texts(cardTree({ kind: "launch", lang: "en", format: "square", card: linked })).join("\n");
    expect(square).toContain("novawerk.io/portfolio/yima");
    expect(square).toContain("novawerk.io");
  });

  it("draws the real Nova Star once, and leaves out empty fields", () => {
    const tree = JSON.stringify(cardTree({ ...CARDS.statement!, lang: "en", format: "square" }));
    expect(tree.split("M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z")).toHaveLength(2);
    expect(tree).not.toContain('"“"');
  });
});

describe("fonts", () => {
  it("collects the Chinese characters to subset", () => {
    expect(cjkCharacters("YIMA 上线十天，上线！")).toBe("上十天线！，");
    expect(cjkCharacters("Launch day")).toBe("");
  });

  it("reads the TrueType URL from a stylesheet, protocol-relative or not", () => {
    expect(
      fontUrlFromCss(
        "src: url('//cdn.fontshare.com/a.woff2') format('woff2'), url('//cdn.fontshare.com/a.woff') format('woff'), url('//cdn.fontshare.com/a.ttf') format('truetype');",
      ),
    ).toBe("https://cdn.fontshare.com/a.ttf");
    expect(fontUrlFromCss("src: url(https://fonts.gstatic.com/x.ttf) format('truetype');")).toBe("https://fonts.gstatic.com/x.ttf");
    expect(fontUrlFromCss("src: url(x.woff2) format('woff2');")).toBeNull();
  });

  it("loads each font once, subsets Chinese, and renders without a font it can't get", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("IBM+Plex+Mono:wght@600")) return new Response("down", { status: 503 });
      if (u.includes("googleapis")) return new Response(`src: url(https://fonts.gstatic.com/${u.length}.ttf) format('truetype');`);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const warn = vi.fn();
    const load = createFontLoader({ fetch: fetch as unknown as typeof globalThis.fetch, warn });

    const latin = await load("Launch day");
    expect(latin.map((f) => `${f.name} ${f.weight}`)).toEqual(["Noto Serif 900", "Noto Serif 400", "IBM Plex Mono 500"]);
    expect(warn).toHaveBeenCalledOnce();

    const zh = await load("上线");
    expect(zh.map((f) => `${f.name} ${f.weight}`)).toEqual(["Noto Serif 900", "Noto Serif 400", "IBM Plex Mono 500", "Noto Serif SC 900", "Noto Serif SC 500"]);
    const urls = fetch.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.includes("family=Noto+Serif:wght@900"))).toHaveLength(1);
    expect(urls.some((u) => u.includes(`text=${encodeURIComponent("上线")}`))).toBe(true);
  });
});

describe("fitSize", () => {
  it("shrinks long headlines and keeps short ones at the maximum", () => {
    expect(fitSize("YIMA", 1000, { max: 150, min: 60, lines: 2 })).toBe(150);
    expect(fitSize("A much longer project name that needs to wrap", 1000, { max: 150, min: 60, lines: 2 })).toBeLessThan(150);
    expect(fitSize("x".repeat(500), 1000, { max: 150, min: 60, lines: 2 })).toBe(60);
  });
});

describe("photoDataUri", () => {
  it("inlines a PNG or JPEG and refuses other types", async () => {
    const ok = vi.fn(async () => new Response(PIXEL, { headers: { "content-type": "image/png" } }));
    expect(await photoDataUri("https://x.public.blob.vercel-storage.com/a.png", ok as never)).toBe(PIXEL_URI);
    const webp = vi.fn(async () => new Response(PIXEL, { headers: { "content-type": "image/webp" } }));
    await expect(photoDataUri("https://x/a.webp", webp as never)).rejects.toThrow(/PNG, JPEG or GIF/);
    const gone = vi.fn(async () => new Response("", { status: 404 }));
    await expect(photoDataUri("https://x/a.png", gone as never)).rejects.toThrow(/404/);
  });
});
