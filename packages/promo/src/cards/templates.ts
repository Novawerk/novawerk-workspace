// The picture templates, in the language of Neon Genesis Evangelion's title cards and the NERV
// screens (NB-ADR-0009): black ground, heavy Mincho (Noto Serif SC Black) and serif capitals
// squeezed tall, set big; the data around it as a HUD: monospaced readouts, ruled tables, corner
// brackets, hazard stripes, and one signal colour, the Nova Star's green lit up. Pure: card
// content in, a satori element tree out (./layout.ts has the building blocks).
//
// One template per kind of post, each degrading to what the card holds:
//
//   kickoff            EPISODE:01: the project's name as a title card, the wish, a spec readout
//   progress           PHASE:NN: the week as a big number, the small story, a DONE / NEXT log
//   behind_the_scenes  the project's own picture in a viewfinder, the trade-off, the staff
//   launch             STATUS: ONLINE: the name huge, what it does as tags, a photo or stripes
//   ten_day            one real quote as a subtitle, the numbers as readouts
//   retro              one hero readout, the rest in a grid, what's next
//   custom             a title card and the details in a ruled box
//
// The Nova Star shows once, small, in the HUD. Text is sized for a phone: nothing on a 3:4 card
// is under ~22 px, the body around 40.
//
// The 3:4 card is Xiaohongshu's, and Xiaohongshu throttles a note that shows a web address
// (videos/BRAND.md): that format prints no novawerk.io, and a line with a link is left off.

import { CARD_FORMATS, LINK_PATTERN, type CardFormat, type PostCardInput, type PostKind, type PostLang } from "@nw/contracts";

import { MONO_FONT, SERIF_CJK_FONT, SERIF_FONT } from "./fonts.js";
import {
  HAN,
  PHOTO_PLACEHOLDER,
  STAR_CORE,
  STAR_OUTER,
  column,
  fitDisplay,
  h,
  markOf,
  numberIn,
  row,
  splitCredit,
  splitLabel,
  text,
  type CardNode,
  type CardSpec,
  type Kid,
} from "./layout.js";

const SERIF = SERIF_FONT;
const SERIF_CJK = SERIF_CJK_FONT;
const MONO = MONO_FONT;

export interface Palette {
  ground: string;
  ink: string;
  dim: string;
  faint: string;
  /** The one signal colour: codes, tags, the hazard stripes, numbers that matter. */
  accent: string;
  onAccent: string;
}

/** Black, warm white, and the Nova Star's green (#1f7a4a) lit up to read as a signal on black. */
export const PALETTE: Palette = {
  ground: "#050505",
  ink: "#f3efe6",
  dim: "rgba(243,239,230,0.66)",
  faint: "rgba(243,239,230,0.2)",
  accent: "#38e07b",
  onAccent: "#050505",
};

const SCALE: Record<CardFormat, number> = { portrait: 1, square: 0.9, link: 0.6, wide: 1.06 };
const PAD: Record<CardFormat, number> = { portrait: 88, square: 80, link: 52, wide: 100 };
/** How much display type is squeezed sideways. */
const SQUEEZE = 0.8;

interface Ctx {
  s: number;
  lang: PostLang;
  width: number;
  height: number;
  pad: number;
  inner: number;
  wide: boolean;
  tall: boolean;
  /** The card may show a web address (every format but Xiaohongshu's). */
  links: boolean;
  p: Palette;
}

const serif = (lang: PostLang) => (lang === "zh" ? `${SERIF_CJK}, ${SERIF}` : `${SERIF}, ${SERIF_CJK}`);
const isHan = (t: string) => {
  const chars = [...t.replace(/\s+/g, "")];
  return chars.length > 0 && chars.filter((ch) => HAN.test(ch)).length / chars.length >= 0.5;
};

// ─── Type ────────────────────────────────────────────────────────────────────

/** The title-card type: heavy serif, squeezed tall. Latin goes to capitals. */
function display(
  c: Ctx,
  content: string,
  width: number,
  bounds: { max: number; min: number; lines: number },
  opts: { color?: string; squeeze?: number } = {},
): CardNode | null {
  if (!content) return null;
  const k = opts.squeeze ?? SQUEEZE;
  const han = isHan(content);
  // Capitals in a black serif run about 40% wider than the estimate for lowercase.
  const room = (width / k) / (han ? 1 : 1.42);
  const size = fitDisplay(content, room, { max: bounds.max * c.s, min: bounds.min * c.s, lines: bounds.lines });
  return row(
    { width, flexShrink: 0 },
    text(
      {
        width: width / k,
        flexShrink: 0,
        transform: `scaleX(${k})`,
        transformOrigin: "left top",
        fontFamily: serif(c.lang),
        fontWeight: 900,
        fontSize: size,
        lineHeight: han ? 1.06 : 0.9,
        letterSpacing: han ? 0 : -0.01 * size,
        textTransform: han ? "none" : "uppercase",
        whiteSpace: "pre-line",
        color: opts.color ?? c.p.ink,
        lineClamp: bounds.lines + 1,
      },
      content,
    ),
  );
}

/** Monospaced HUD text: codes, labels, readouts. */
function mono(c: Ctx, content: string, size: number, opts: { color?: string; weight?: number; spacing?: number } = {}): CardNode | null {
  if (!content) return null;
  return text(
    {
      fontFamily: `${MONO}, ${SERIF_CJK}`,
      fontWeight: opts.weight ?? 500,
      fontSize: size * c.s,
      letterSpacing: (opts.spacing ?? 0.08) * size * c.s,
      textTransform: "uppercase",
      color: opts.color ?? c.p.accent,
      lineHeight: 1.25,
      lineClamp: 2,
    },
    content,
  );
}

/** The episode subtitle: serif, spaced wide. */
function subtitle(c: Ctx, content: string, size: number, color?: string): CardNode | null {
  if (!content) return null;
  const han = isHan(content);
  return text(
    {
      fontFamily: serif(c.lang),
      fontWeight: han ? 900 : 400,
      fontSize: size * c.s,
      letterSpacing: (han ? 0.32 : 0.24) * size * c.s,
      textTransform: han ? "none" : "uppercase",
      color: color ?? c.p.ink,
      lineHeight: 1.3,
      lineClamp: 2,
    },
    content,
  );
}

function body(c: Ctx, content: string, size: number, opts: { lines: number; color?: string; weight?: number }): CardNode | null {
  if (!content) return null;
  return text(
    {
      fontFamily: serif(c.lang),
      fontWeight: opts.weight ?? (c.lang === "zh" ? 500 : 400),
      fontSize: size * c.s,
      lineHeight: c.lang === "zh" ? 1.6 : 1.42,
      color: opts.color ?? c.p.ink,
      lineClamp: opts.lines,
    },
    content,
  );
}

// ─── The HUD ─────────────────────────────────────────────────────────────────

/** The Nova Star as the dark mark: light star, its core punched through to the ground. */
function star(c: Ctx, size: number): CardNode {
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 100 100", style: { flexShrink: 0 } },
    h("path", { d: STAR_OUTER, fill: c.p.ink }),
    h("path", { d: STAR_CORE, fill: c.p.ground }),
  );
}

const hairline = (c: Ctx, color?: string) =>
  h("div", { style: { display: "flex", height: Math.max(1, 2 * c.s), backgroundColor: color ?? c.p.faint, flexShrink: 0 } });

/** The top bar: the mark and our name on the left, the card's code on the right, a rule under. */
function hudTop(c: Ctx, code: string): CardNode {
  return column(
    { position: "relative", gap: 20 * c.s, flexShrink: 0 },
    row(
      { alignItems: "center", justifyContent: "space-between" },
      row({ alignItems: "center", gap: 16 * c.s }, star(c, 40 * c.s), mono(c, "Novawerk", 26, { color: c.p.ink, spacing: 0.22 })),
      mono(c, code, 26, { spacing: 0.12 }),
    ),
    hairline(c),
  );
}

/** Diagonal warning stripes in the signal colour. */
function hazard(c: Ctx, width: number | string, height: number): CardNode {
  const band = 16 * c.s;
  return h("div", {
    style: {
      display: "flex",
      width,
      height,
      flexShrink: 0,
      backgroundImage: `repeating-linear-gradient(-45deg, ${c.p.accent} 0 ${band}px, transparent ${band}px ${band * 2}px)`,
    },
  });
}

/** Our own address: the bottom bar shows it already. */
const isOwnAddress = (t: string) => /^(https?:\/\/)?(www\.)?novawerk\.io\/?$/i.test(t.trim());

/** The bottom bar: stripes, the footer as a readout, our address. */
function hudBottom(c: Ctx, footer: string): CardNode {
  const t = footer.trim();
  const own = !t || isOwnAddress(t);
  return column(
    { position: "relative", gap: 20 * c.s, flexShrink: 0 },
    hairline(c),
    row(
      { alignItems: "center", gap: 24 * c.s },
      hazard(c, 120 * c.s, 22 * c.s),
      own ? null : row({ flex: 1 }, mono(c, t, 26, { color: c.p.ink, spacing: 0.06 })),
      own ? row({ flex: 1 }) : null,
      c.links ? mono(c, "novawerk.io", 24, { color: c.p.dim, spacing: 0.1 }) : null,
    ),
  );
}

/** Four corner brackets, like a viewfinder, inside the card's margin. */
function corners(c: Ctx, inset: number, opts: { size?: number; color?: string; stroke?: number } = {}): CardNode[] {
  const len = (opts.size ?? 44) * c.s;
  const w = (opts.stroke ?? 3) * c.s;
  const color = opts.color ?? c.p.dim;
  const at = (pos: Record<string, number>, sides: [string, string]) =>
    h("div", {
      style: {
        display: "flex",
        position: "absolute",
        width: len,
        height: len,
        ...pos,
        [`border${sides[0]}`]: `${w}px solid ${color}`,
        [`border${sides[1]}`]: `${w}px solid ${color}`,
      },
    });
  return [
    at({ left: inset, top: inset }, ["Left", "Top"]),
    at({ right: inset, top: inset }, ["Right", "Top"]),
    at({ left: inset, bottom: inset }, ["Left", "Bottom"]),
    at({ right: inset, bottom: inset }, ["Right", "Bottom"]),
  ];
}

/** Label in the signal colour, value in serif, a rule between rows. */
function table(c: Ctx, items: string[], opts: { width: number; size: number; max: number }): CardNode | null {
  if (!items.length) return null;
  return column(
    { width: opts.width, borderTop: `${2 * c.s}px solid ${c.p.faint}` },
    items.slice(0, opts.max).map((item, i) => {
      const { label, value } = splitLabel(item);
      return row(
        { alignItems: "baseline", gap: 28 * c.s, paddingTop: 20 * c.s, paddingBottom: 20 * c.s, borderBottom: `${2 * c.s}px solid ${c.p.faint}` },
        row({ width: opts.width * 0.28, flexShrink: 0 }, mono(c, label ?? String(i + 1).padStart(2, "0"), opts.size - 14)),
        row({ flex: 1 }, body(c, value, opts.size, { lines: 2, weight: c.lang === "zh" ? 900 : 400 })),
      );
    }),
  );
}

/** A status tag: DONE filled, NEXT outlined, anything else quiet. */
function tag(c: Ctx, kind: "done" | "next" | "dot", size: number): CardNode {
  const label = kind === "done" ? "Done" : kind === "next" ? "Next" : "Log";
  const filled = kind === "done";
  return row(
    {
      alignItems: "center",
      justifyContent: "center",
      width: size * 4.4 * c.s,
      height: size * 1.9 * c.s,
      flexShrink: 0,
      ...(filled ? { backgroundColor: c.p.accent } : { border: `${2 * c.s}px solid ${kind === "next" ? c.p.accent : c.p.faint}` }),
    },
    mono(c, label, size, { color: filled ? c.p.onAccent : kind === "next" ? c.p.accent : c.p.dim, weight: 600, spacing: 0.14 }),
  );
}

/** One number in a ruled box: the label as a readout, the value squeezed tall. */
function readout(c: Ctx, stat: PostCardInput["stats"][number], width: number, size: number, opts: { accent?: boolean } = {}): CardNode {
  return column(
    { width, gap: 10 * c.s, padding: 22 * c.s, border: `${2 * c.s}px solid ${opts.accent ? c.p.accent : c.p.faint}` },
    mono(c, stat.label || "—", 22, { color: opts.accent ? c.p.accent : c.p.dim }),
    display(c, stat.value, width - 44 * c.s, { max: size, min: 40, lines: 1 }, { color: opts.accent ? c.p.accent : c.p.ink, squeeze: 0.84 }),
  );
}

function photo(c: Ctx, src: string, width: number | string, height: number | string, label: string): CardNode {
  const inner =
    src === PHOTO_PLACEHOLDER
      ? column(
          { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 14 * c.s, backgroundColor: "rgba(243,239,230,0.05)" },
          mono(c, c.lang === "zh" ? "项目自己的照片" : "The project's own photo", 24, { color: c.p.dim }),
        )
      : h("img", { src, width: "100%", height: "100%", style: { width: "100%", height: "100%", objectFit: "cover" } });
  return row(
    { position: "relative", width, height, flexShrink: 0, overflow: "hidden", border: `${2 * c.s}px solid ${c.p.faint}` },
    inner,
    // The camera's HUD over the picture.
    row(
      { position: "absolute", left: 30 * c.s, top: 28 * c.s, alignItems: "center", gap: 10 * c.s },
      h("div", { style: { width: 16 * c.s, height: 16 * c.s, borderRadius: 999, backgroundColor: c.p.accent } }),
      mono(c, "Rec", 22, { color: c.p.ink, weight: 600 }),
    ),
    label ? row({ position: "absolute", left: 22 * c.s, bottom: 22 * c.s, backgroundColor: c.p.accent, paddingLeft: 12 * c.s, paddingRight: 12 * c.s, paddingTop: 4 * c.s, paddingBottom: 4 * c.s }, mono(c, label, 22, { color: c.p.onAccent, weight: 600 })) : null,
    // A viewfinder: brackets top right and bottom right, clear of the labels on the left.
    ...corners(c, 16 * c.s, { size: 34, color: c.p.ink, stroke: 3 }).filter((_, i) => i === 1 || i === 3),
  );
}

/** The kind's code in the top bar: EPISODE:01, PHASE:03, T+10… */
function codeFor(kind: PostKind, card: PostCardInput): string {
  const n = numberIn(card.eyebrow);
  switch (kind) {
    case "kickoff":
      return "Wish // Kickoff";
    case "progress":
      return n ? `Phase:${n}` : "Phase";
    case "behind_the_scenes":
      return "T-10 // Making of";
    case "launch":
      return "T-0 // Launch";
    case "ten_day":
      return "T+10 // Report";
    case "retro":
      return n ? `T+${Number(n)} // Report` : "Report";
    case "custom":
      return "Notice";
  }
}

// ─── The templates ───────────────────────────────────────────────────────────

type Template = (c: Ctx, card: PostCardInput, photoSrc: string | null, code: string) => Kid[];

/** Top bar, the middle, bottom bar. */
const frame = (c: Ctx, card: PostCardInput, code: string, middle: Kid[], opts: { justify?: string; gap?: number } = {}): Kid[] => [
  ...corners(c, c.pad * 0.36),
  hudTop(c, code),
  column({ position: "relative", flex: 1, justifyContent: opts.justify ?? "space-between", gap: (opts.gap ?? 36) * c.s, paddingTop: 44 * c.s, paddingBottom: 44 * c.s }, middle),
  hudBottom(c, card.footer),
];

/** The same, split: text on the left, the hero on the right. */
const wideFrame = (c: Ctx, card: PostCardInput, code: string, left: Kid[], right: Kid, share = 0.54): Kid[] => [
  ...corners(c, c.pad * 0.36),
  hudTop(c, code),
  row(
    { position: "relative", flex: 1, gap: 72 * c.s, alignItems: "center", paddingTop: 36 * c.s, paddingBottom: 36 * c.s },
    column({ width: c.inner * share, flexShrink: 0, gap: 22 * c.s }, left),
    column({ flex: 1, justifyContent: "center", alignSelf: "stretch" }, right),
  ),
  hudBottom(c, card.footer),
];
const rightWidth = (c: Ctx, share: number) => c.inner * (1 - share) - 72 * c.s;

const kickoff: Template = (c, card, _photo, code) => {
  const title = [mono(c, "Episode:01", 32, { spacing: 0.16 }), subtitle(c, card.eyebrow, c.wide ? 30 : 36)];
  if (c.wide) {
    return wideFrame(
      c,
      card,
      code,
      [...title, display(c, card.headline, c.inner * 0.54, { max: 220, min: 70, lines: 2 }), body(c, card.lede, 34, { lines: 2, color: c.p.dim })],
      table(c, card.points, { width: rightWidth(c, 0.54), size: 34, max: 3 }),
    );
  }
  return frame(c, card, code, [
    column(
      { gap: 26 * c.s },
      ...title,
      display(c, card.headline, c.inner, { max: c.tall ? 300 : 230, min: 90, lines: 2 }),
      hairline(c, c.p.accent),
      body(c, card.lede, c.tall ? 44 : 38, { lines: 3, color: c.p.dim }),
    ),
    table(c, card.points, { width: c.inner, size: c.tall ? 40 : 36, max: c.tall ? 3 : 2 }),
  ]);
};

const progress: Template = (c, card, _photo, code) => {
  const week = numberIn(card.eyebrow);
  const numeral = (max: number) => (week ? display(c, week, c.inner * (c.wide ? 0.26 : 0.5), { max, min: 120, lines: 1 }, { color: c.p.accent, squeeze: 0.86 }) : null);
  const log = (size: number, max: number) =>
    card.points.length
      ? column(
          { borderTop: `${2 * c.s}px solid ${c.p.faint}` },
          card.points.slice(0, max).map((item) => {
            const { value } = splitLabel(item);
            return row(
              { alignItems: "center", gap: 26 * c.s, paddingTop: 20 * c.s, paddingBottom: 20 * c.s, borderBottom: `${2 * c.s}px solid ${c.p.faint}` },
              tag(c, markOf(item), size - 18),
              row({ flex: 1 }, body(c, value, size, { lines: 2, weight: c.lang === "zh" ? 900 : 400 })),
            );
          }),
        )
      : null;
  const heading = (max: number, width: number) => column({ gap: 14 * c.s }, subtitle(c, card.eyebrow, c.wide ? 28 : 32, c.p.dim), display(c, card.headline, width, { max, min: 60, lines: 2 }));
  if (c.wide) {
    return wideFrame(c, card, code, [numeral(240), heading(96, c.inner * 0.48), body(c, card.lede, 30, { lines: 2, color: c.p.dim })], log(34, 4), 0.48);
  }
  return frame(c, card, code, [
    column(
      { gap: 22 * c.s },
      row({ alignItems: "flex-end", gap: 32 * c.s }, numeral(c.tall ? 520 : 360), column({ flex: 1, paddingBottom: 28 * c.s, gap: 8 * c.s }, mono(c, "Week", 28, { color: c.p.dim }), mono(c, "Status: building", 24))),
      heading(c.tall ? 150 : 120, c.inner),
      body(c, card.lede, c.tall ? 42 : 36, { lines: 3, color: c.p.dim }),
    ),
    log(c.tall ? 42 : 36, c.tall ? 4 : 3),
  ]);
};

/** The credits: role as a readout, name in serif, two to a row. */
function credits(c: Ctx, items: string[], width: number, max: number): CardNode | null {
  if (!items.length) return null;
  const gap = 32 * c.s;
  const w = (width - gap) / 2;
  return row(
    { flexWrap: "wrap", width, columnGap: gap, rowGap: 18 * c.s },
    items.slice(0, max).map((item) => {
      const { role, name } = splitCredit(item);
      return column(
        { width: w, gap: 6 * c.s, paddingTop: 14 * c.s, borderTop: `${2 * c.s}px solid ${c.p.faint}` },
        mono(c, role ?? "Staff", 22, { color: c.p.accent }),
        body(c, name, 40, { lines: 1, weight: 900 }),
      );
    }),
  );
}

const behindTheScenes: Template = (c, card, photoSrc, code) => {
  const noFooter = { ...card, footer: "" };
  const picture = (w: number | string, hgt: number | string) => (photoSrc ? photo(c, photoSrc, w, hgt, card.footer) : null);
  if (c.wide) {
    return wideFrame(
      c,
      noFooter,
      code,
      [subtitle(c, card.eyebrow, 28, c.p.dim), display(c, card.headline, c.inner * 0.48, { max: 150, min: 60, lines: 2 }), body(c, card.lede, 32, { lines: 2, color: c.p.dim }), credits(c, card.points, c.inner * 0.48, 4)],
      picture("100%", "100%") ?? column({ gap: 16 * c.s }, mono(c, card.footer, 40)),
      0.48,
    );
  }
  return frame(c, noFooter, code, [
    column(
      { gap: 30 * c.s },
      picture(c.inner, (c.height - c.pad * 2) * (c.tall ? 0.38 : 0.32)),
      column({ gap: 12 * c.s }, subtitle(c, card.eyebrow, 32, c.p.dim), display(c, card.headline, c.inner, { max: c.tall ? 200 : 150, min: 70, lines: 2 })),
      photoSrc ? null : mono(c, card.footer, 34),
    ),
    column({ gap: 28 * c.s }, body(c, card.lede, c.tall ? 40 : 34, { lines: 2, color: c.p.dim }), credits(c, card.points, c.inner, c.tall ? 4 : 2)),
  ]);
};

/**
 * A NERV honeycomb: pointy-top hexagons in staggered rows, a few lit in the signal colour, the
 * rest drawn as faint outlines. Deterministic, so the same card always looks the same.
 */
function honeycomb(c: Ctx, width: number, height: number, seed: string): CardNode {
  const r = 46 * c.s;
  const w = Math.sqrt(3) * r;
  const cols = Math.ceil(width / w) + 1;
  const rows = Math.ceil(height / (r * 1.5)) + 1;
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const lit = (i: number) => ((hash >>> (i % 24)) ^ (i * 2654435761)) % 7 === 0;
  const cells: CardNode[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x * w + (y % 2 ? w / 2 : 0);
      const cy = y * r * 1.5 + r;
      const points = [0, 1, 2, 3, 4, 5]
        .map((k) => {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          return `${(cx + (r - 3 * c.s) * Math.cos(a)).toFixed(1)},${(cy + (r - 3 * c.s) * Math.sin(a)).toFixed(1)}`;
        })
        .join(" ");
      const on = lit(y * cols + x);
      cells.push(
        h("polygon", on ? { points, fill: c.p.accent, fillOpacity: 0.9 } : { points, fill: "none", stroke: c.p.faint, strokeWidth: 2 * c.s }),
      );
    }
  }
  return h("svg", { width, height, viewBox: `0 0 ${width} ${height}`, style: { flexShrink: 0 } }, ...cells);
}

const launch: Template = (c, card, photoSrc, code) => {
  const tags = card.points.length
    ? row(
        { flexWrap: "wrap", gap: 14 * c.s },
        card.points.slice(0, 3).map((p) =>
          row(
            { border: `${2 * c.s}px solid ${c.p.faint}`, paddingLeft: 18 * c.s, paddingRight: 18 * c.s, paddingTop: 10 * c.s, paddingBottom: 10 * c.s },
            body(c, p, c.wide ? 26 : 30, { lines: 1, weight: c.lang === "zh" ? 900 : 400 }),
          ),
        ),
      )
    : null;
  const status = row(
    { alignItems: "center", gap: 14 * c.s },
    h("div", { style: { width: 18 * c.s, height: 18 * c.s, borderRadius: 999, backgroundColor: c.p.accent } }),
    mono(c, "Status: online", c.wide ? 24 : 28, { spacing: 0.14 }),
  );
  const link = card.footer && !isOwnAddress(card.footer) ? mono(c, `→ ${card.footer}`, c.wide ? 24 : 28, { color: c.p.ink }) : null;
  const noFooter = { ...card, footer: "" };
  if (c.wide) {
    return wideFrame(
      c,
      noFooter,
      code,
      [hazard(c, "100%", 26 * c.s), status, display(c, card.headline, c.inner * 0.56, { max: 280, min: 80, lines: 2 }), subtitle(c, card.eyebrow, 26, c.p.dim), body(c, card.lede, 32, { lines: 2, color: c.p.dim }), tags, link],
      photoSrc ? photo(c, photoSrc, "100%", "100%", "") : honeycomb(c, c.inner * 0.44 - 72 * c.s, c.height - c.pad * 2 - 200 * c.s, card.headline),
      0.56,
    );
  }
  return frame(
    c,
    noFooter,
    code,
    [
      column(
        { gap: 24 * c.s },
        photoSrc ? photo(c, photoSrc, c.inner, (c.height - c.pad * 2) * (c.tall ? 0.34 : 0.28), "") : hazard(c, "100%", 44 * c.s),
        status,
        photoSrc ? null : honeycomb(c, c.inner, (c.height - c.pad * 2) * (c.tall ? 0.2 : 0.1), card.headline),
      ),
      column(
        { gap: 24 * c.s },
        subtitle(c, card.eyebrow, c.tall ? 34 : 30, c.p.dim),
        display(c, card.headline, c.inner, { max: c.tall ? 380 : 280, min: 90, lines: 2 }),
        body(c, card.lede, c.tall ? 42 : 36, { lines: 2, color: c.p.dim }),
        tags,
        link,
      ),
    ],
    { gap: 30 },
  );
};

const tenDay: Template = (c, card, _photo, code) => {
  const label = [card.eyebrow, card.headline].filter(Boolean).join(" · ");
  const quoteText = isHan(card.quote.text) ? `「${card.quote.text}」` : `“${card.quote.text}”`;
  const by = card.quote.by ? mono(c, `— ${card.quote.by}`, c.wide ? 24 : 28, { color: c.p.dim }) : null;
  const fixed = card.lede ? row({ alignItems: "center", gap: 20 * c.s }, tag(c, "done", 22), row({ flex: 1 }, body(c, card.lede, c.wide ? 30 : 36, { lines: 2 }))) : null;
  const numbers = (width: number, perRow: number, size: number) =>
    card.stats.length
      ? row(
          { flexWrap: "wrap", gap: 20 * c.s, width },
          card.stats.slice(0, perRow === 1 ? 2 : 3).map((stat, i) => readout(c, stat, perRow === 1 ? width : (width - 20 * c.s * (Math.min(3, card.stats.length) - 1)) / Math.min(3, card.stats.length), size, { accent: i === 0 })),
        )
      : null;
  if (c.wide) {
    return wideFrame(c, card, code, [subtitle(c, label, 26, c.p.dim), display(c, quoteText, c.inner * 0.6, { max: 130, min: 50, lines: 3 }), by], column({ gap: 24 * c.s }, numbers(rightWidth(c, 0.6), 1, 110), fixed), 0.6);
  }
  return frame(c, card, code, [
    subtitle(c, label, c.tall ? 32 : 28, c.p.dim),
    column({ gap: 26 * c.s }, display(c, quoteText, c.inner, { max: c.tall ? 150 : 120, min: 50, lines: c.tall ? 4 : 3 }), by),
    column({ gap: 30 * c.s }, fixed, numbers(c.inner, 3, c.tall ? 120 : 96)),
  ]);
};

const retro: Template = (c, card, _photo, code) => {
  const [first, ...rest] = card.stats.slice(0, 4);
  const grid = (width: number, size: number) =>
    first
      ? column(
          { gap: 18 * c.s, width },
          readout(c, first, width, size * 1.7, { accent: true }),
          rest.length ? row({ gap: 18 * c.s }, rest.map((s) => readout(c, s, (width - 18 * c.s * (rest.length - 1)) / rest.length, size))) : null,
        )
      : null;
  const next = card.lede ? row({ alignItems: "center", gap: 20 * c.s }, tag(c, "next", 22), row({ flex: 1 }, body(c, card.lede, c.wide ? 30 : 36, { lines: 2 }))) : null;
  const heading = (max: number, width: number) => column({ gap: 12 * c.s }, subtitle(c, card.eyebrow, c.wide ? 28 : 32, c.p.dim), display(c, card.headline, width, { max, min: 60, lines: 1 }));
  if (c.wide) return wideFrame(c, card, code, [heading(200, c.inner * 0.4), next], grid(rightWidth(c, 0.4), 90), 0.4);
  return frame(c, card, code, [heading(c.tall ? 220 : 170, c.inner), grid(c.inner, c.tall ? 120 : 90), next]);
};

/** Details as a ruled list in a bordered box. */
function notice(c: Ctx, items: string[], width: number, size: number, max: number): CardNode | null {
  if (!items.length) return null;
  return column(
    { width, border: `${2 * c.s}px solid ${c.p.faint}`, paddingLeft: 30 * c.s, paddingRight: 30 * c.s },
    items.slice(0, max).map((item, i) => {
      const { label, value } = splitLabel(item);
      return row(
        { alignItems: "baseline", gap: 24 * c.s, paddingTop: 20 * c.s, paddingBottom: 20 * c.s, borderTop: i === 0 ? "none" : `${2 * c.s}px solid ${c.p.faint}` },
        mono(c, label ?? String(i + 1).padStart(2, "0"), size - 14),
        row({ flex: 1 }, body(c, value, size, { lines: 2, weight: c.lang === "zh" ? 900 : 400 })),
      );
    }),
  );
}

const poster: Template = (c, card, photoSrc, code) => {
  if (c.wide) {
    return wideFrame(
      c,
      card,
      code,
      [subtitle(c, card.eyebrow, 28, c.p.accent), display(c, card.headline, c.inner * 0.54, { max: 230, min: 70, lines: 2 }), body(c, card.lede, 32, { lines: 2, color: c.p.dim })],
      photoSrc ? photo(c, photoSrc, "100%", "100%", "") : notice(c, card.points, rightWidth(c, 0.54), 32, 4),
    );
  }
  return frame(c, card, code, [
    column(
      { gap: 26 * c.s },
      photoSrc ? photo(c, photoSrc, c.inner, (c.height - c.pad * 2) * (c.tall ? 0.3 : 0.26), "") : null,
      subtitle(c, card.eyebrow, c.tall ? 36 : 30, c.p.accent),
      display(c, card.headline, c.inner, { max: photoSrc ? (c.tall ? 200 : 150) : c.tall ? 300 : 220, min: 80, lines: 2 }),
      body(c, card.lede, c.tall ? 42 : 36, { lines: 2, color: c.p.dim }),
    ),
    notice(c, card.points, c.inner, c.tall ? 38 : 34, c.tall ? 3 : 2),
  ]);
};

function templateFor(spec: CardSpec): Template {
  const { kind, card } = spec;
  const hasQuote = Boolean(card.quote.text);
  const hasStats = card.stats.length > 0;
  switch (kind) {
    case "kickoff":
      return kickoff;
    case "progress":
      return progress;
    case "behind_the_scenes":
      return behindTheScenes;
    case "launch":
      return launch;
    case "ten_day":
      return hasQuote ? tenDay : hasStats ? retro : poster;
    case "retro":
      return hasStats ? retro : hasQuote ? tenDay : poster;
    case "custom":
      return hasQuote && !spec.photo ? tenDay : poster;
  }
}

/** The formats a link may show on: every one but Xiaohongshu's 3:4. */
export const showsLinks = (format: CardFormat) => format !== "portrait";

const hasLink = (t: string) => (t.match(LINK_PATTERN) ?? []).length > 0;

/** The card with every line that carries a web address or an email left out. */
export function withoutLinks(card: PostCardInput): PostCardInput {
  const keep = (t: string) => (hasLink(t) ? "" : t);
  return {
    eyebrow: keep(card.eyebrow),
    headline: keep(card.headline),
    lede: keep(card.lede),
    points: card.points.filter((p) => !hasLink(p)),
    quote: hasLink(card.quote.text) || hasLink(card.quote.by) ? { text: "", by: "" } : card.quote,
    stats: card.stats.filter((st) => !hasLink(st.value) && !hasLink(st.label)),
    footer: keep(card.footer),
  };
}

/** The whole picture for one card. */
export function cardTree(spec: CardSpec, palette: Palette = PALETTE): CardNode {
  const { width, height } = CARD_FORMATS[spec.format];
  const s = SCALE[spec.format];
  const pad = PAD[spec.format];
  const c: Ctx = {
    s,
    lang: spec.lang,
    width,
    height,
    pad,
    inner: width - pad * 2,
    wide: spec.format === "link" || spec.format === "wide",
    tall: spec.format === "portrait",
    links: showsLinks(spec.format),
    p: palette,
  };
  const card = c.links ? spec.card : withoutLinks(spec.card);
  return h(
    "div",
    {
      style: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width,
        height,
        padding: pad,
        backgroundColor: palette.ground,
        color: palette.ink,
        fontFamily: serif(spec.lang),
        overflow: "hidden",
      },
    },
    ...templateFor({ ...spec, card })(c, card, spec.photo ?? null, codeFor(spec.kind, card)),
  );
}
