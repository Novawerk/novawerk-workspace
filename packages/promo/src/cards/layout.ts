// The building blocks of the cards: satori element trees as plain objects (no React), the
// sizing of display type (whole Chinese characters per line, no lone character at the end), and
// reading the card's plain lines ("label: value", "role — name", "Done: …"). ./templates.ts puts
// them together.

import type { CardFormat, PostCardInput, PostKind, PostLang } from "@nw/contracts";

// The Nova Star on its 100 × 100 grid (knowledge/brand/assets/nova-star.svg).
export const STAR_OUTER = "M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z";
export const STAR_CORE = "M50 36 L51.4 48.6 L64 50 L51.4 51.4 L50 64 L48.6 51.4 L36 50 L48.6 48.6 Z";

export type CardChild = CardNode | string;
export interface CardNode {
  type: string;
  props: { style?: Style; children?: CardChild | CardChild[]; [attr: string]: unknown };
}

export type Kid = CardChild | Kid[] | null | undefined | false;
export type Style = Record<string, string | number>;

export function h(type: string, props: Omit<CardNode["props"], "children"> | null, ...children: Kid[]): CardNode {
  const kids = (children.flat(4) as (CardChild | null | undefined | false)[]).filter(
    (c): c is CardChild => c !== null && c !== undefined && c !== false && c !== "",
  );
  return { type, props: { ...(props ?? {}), ...(kids.length ? { children: kids.length === 1 ? kids[0]! : kids } : {}) } };
}

/** In place of a photo: the template previews show where one goes, without fetching any. */
export const PHOTO_PLACEHOLDER = "placeholder:photo";


export interface CardSpec {
  kind: PostKind;
  lang: PostLang;
  format: CardFormat;
  card: PostCardInput;
  /** A data: URI (or URL) of the project's picture, if the card has one, or PHOTO_PLACEHOLDER. */
  photo?: string | null;
}



export const HAN = /[　-〿㐀-鿿＀-￯]/;

/** Rough width in ems: Chinese glyphs are square, Latin ones about half as wide. */
export function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += HAN.test(ch) ? 1 : ch === " " ? 0.28 : 0.56;
  return w;
}

/** The biggest size (within bounds) at which `text` fits `width` in about `lines` lines. */
export function fitSize(text: string, width: number, bounds: { max: number; min: number; lines: number }): number {
  const em = emWidth(text);
  if (em === 0) return bounds.max;
  return Math.round(Math.max(bounds.min, Math.min(bounds.max, (width * bounds.lines) / (em * 1.12))));
}

/**
 * Chinese sets on a square grid, so this is exact: whole characters per line, and no line of one
 * or two characters at the end.
 */
function fitHan(count: number, width: number, bounds: { max: number; min: number; lines: number }): number {
  const perLineAt = (size: number) => Math.max(1, Math.floor((width + 0.5) / size));
  /** The biggest size that puts at most `per` characters on a line. */
  const sizeFor = (per: number) => Math.floor((width * 0.985) / per);
  let size = bounds.max;
  if (Math.ceil(count / perLineAt(size)) > bounds.lines) size = sizeFor(Math.ceil(count / bounds.lines));
  const per = perLineAt(size);
  const n = Math.ceil(count / per);
  const last = count - (n - 1) * per;
  const orphan = n > 1 && (last === 1 || (last === 2 && per >= 7));
  if (orphan) {
    // One line fewer if that stays big enough, else the same lines evened out.
    const shorter = sizeFor(Math.ceil(count / (n - 1)));
    size = shorter >= bounds.min && shorter >= size * 0.75 ? shorter : Math.min(size, sizeFor(Math.ceil(count / n)));
  }
  return Math.max(bounds.min, Math.min(bounds.max, size));
}

/**
 * The size for display text: as big as `bounds` allow in at most `lines` lines, never leaving a
 * word or two alone on the last line (it shrinks to one line fewer instead). Line breaks the
 * writer put in ("来工作坊\n坐坐") are kept: each line then has to fit on its own.
 */
export function fitDisplay(text: string, width: number, bounds: { max: number; min: number; lines: number }): number {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    const widest = Math.max(...lines.map(emWidth));
    return Math.round(Math.max(bounds.min, Math.min(bounds.max, width / (widest * 1.04))));
  }
  const chars = [...text.replace(/\s+/g, " ").trim()];
  const han = chars.filter((ch) => HAN.test(ch)).length;
  if (chars.length && han / chars.length >= 0.7) return fitHan(chars.length, width, bounds);
  const em = emWidth(text);
  if (em === 0) return bounds.max;
  let size = Math.min(bounds.max, (width * bounds.lines) / (em * 1.04));
  const perLine = width / (size * 1.04);
  const n = Math.ceil(em / perLine);
  const last = em - (n - 1) * perLine;
  // A short last line: set it one line shorter, as long as that stays big enough.
  if (n > 1 && last < Math.min(HAN.test(text) ? 2.6 : 5.5, perLine * 0.34)) {
    const tighter = (width * (n - 1)) / (em * 1.04);
    if (tighter >= bounds.min) size = tighter;
  }
  return Math.round(Math.max(bounds.min, size));
}


// ─── Nodes ───────────────────────────────────────────────────────────────────


export const row = (style: Style, ...children: Kid[]) => h("div", { style: { display: "flex", ...style } }, ...children);
export const column = (style: Style, ...children: Kid[]) =>
  h("div", { style: { display: "flex", flexDirection: "column", ...style } }, ...children);
/** A run of text. Clamped, so nothing spills off the card. */
export const text = (style: Style, content: string) => h("div", { style: { display: "block", ...style } }, content);



// ─── Reading the lines ───────────────────────────────────────────────────────


/** "First deliverable: 20 places · Yu" → a label and a value. Times like 14:00 aren't labels. */
export function splitLabel(line: string): { label: string | null; value: string } {
  const m = line.match(/^([^\d:：]{1,18})[：:]\s*(.+)$/);
  return m ? { label: m[1]!.trim(), value: m[2]!.trim() } : { label: null, value: line };
}

/** "Design — Aiko", "设计 —— Aiko" → a role and a name. */
export function splitCredit(line: string): { role: string | null; name: string } {
  const m = line.match(/^(.+?)\s+[—–]{1,2}\s+(.+)$/) ?? line.match(/^(.+?)——(.+)$/);
  return m ? { role: m[1]!.trim(), name: m[2]!.trim() } : { role: null, name: line };
}


export type Mark = "done" | "next" | "dot";

/** What a progress line is about, from its first words. */
export function markOf(line: string): Mark {
  if (/^(完成|已完成|已经|done|shipped|finished)/i.test(line)) return "done";
  if (/^(下一|接下来|next|up next|coming)/i.test(line)) return "next";
  return "dot";
}


/** Two digits from a line like "第 3 周进展" or "Day 90": "03", "90". */
export function numberIn(line: string): string | null {
  const m = line.match(/\d+/);
  if (!m) return null;
  return m[0].length === 1 ? `0${m[0]}` : m[0];
}


/** Every string on the card, for font subsetting. */
export function cardText(card: PostCardInput): string {
  return [
    "Novawerk novawerk.io “—·→「」 项目自己的照片 The project's own photo 0123456789",
    card.eyebrow,
    card.headline,
    card.lede,
    ...card.points,
    card.quote.text,
    card.quote.by,
    ...card.stats.flatMap((s) => [s.value, s.label]),
    card.footer,
  ].join(" ");
}
