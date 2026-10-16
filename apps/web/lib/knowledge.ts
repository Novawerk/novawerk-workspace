// Reads Novawerk's canonical facts from `knowledge/` at the monorepo root.
//
// Pages call these during prerender, so the copy is baked in at build time. The files are
// also traced into the server bundle (see `outputFileTracingIncludes` in next.config.ts)
// for request-time re-renders. Never read `records/` from here.
//
// Every loader prefers a `summary` frontmatter field and otherwise derives a short version
// from the Markdown body.

import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { Lexer, Parser, type Token, type Tokens } from "marked";

// ─── Locating and parsing files ──────────────────────────────────────────────

let knowledgeDir: string | undefined;

/** Walk up from the working directory until we find `knowledge/` (or use NW_KNOWLEDGE_DIR). */
function getKnowledgeDir(): string {
  if (knowledgeDir) return knowledgeDir;

  const override = process.env.NW_KNOWLEDGE_DIR;
  if (override && fs.existsSync(path.join(override, "culture"))) {
    return (knowledgeDir = path.resolve(override));
  }

  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    const candidate = path.join(dir, "knowledge");
    if (fs.existsSync(path.join(candidate, "culture"))) return (knowledgeDir = candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not find the knowledge/ directory above ${process.cwd()}. Set NW_KNOWLEDGE_DIR to its absolute path.`,
  );
}

interface KnowledgeDoc {
  data: Record<string, unknown>;
  tokens: Token[];
}

const docs = new Map<string, KnowledgeDoc>();

function readDoc(relativePath: string): KnowledgeDoc {
  const cached = docs.get(relativePath);
  if (cached) return cached;
  // turbopackIgnore: these files are traced explicitly via `outputFileTracingIncludes`;
  // without the hint the bundler would trace the whole repo.
  const file = fs.readFileSync(path.join(/*turbopackIgnore: true*/ getKnowledgeDir(), relativePath), "utf8");
  const { data, content } = matter(file);
  const doc = { data, tokens: Lexer.lex(content) };
  docs.set(relativePath, doc);
  return doc;
}

function listDocs(relativeDir: string, pattern: RegExp): string[] {
  return fs
    .readdirSync(path.join(/*turbopackIgnore: true*/ getKnowledgeDir(), relativeDir))
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => path.posix.join(relativeDir, name));
}

// ─── Token helpers ───────────────────────────────────────────────────────────

/** Inline Markdown → plain text (drops *emphasis*, `code` and link markup). */
function plain(token: Token | Token[] | undefined): string {
  if (!token) return "";
  if (Array.isArray(token)) return token.map(plain).join("");
  if ("tokens" in token && Array.isArray(token.tokens) && token.tokens.length > 0) return plain(token.tokens);
  if (token.type === "br") return " ";
  return "text" in token && typeof token.text === "string" ? decodeEntities(token.text) : "";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Tokens after the `## <title>` heading, up to the next heading of the same depth or higher. */
function section(tokens: Token[], title: string, depth = 2): Token[] {
  const start = tokens.findIndex(
    (t) => t.type === "heading" && (t as Tokens.Heading).depth === depth && clean(plain(t)) === title,
  );
  if (start === -1) return [];
  const rest = tokens.slice(start + 1);
  const end = rest.findIndex((t) => t.type === "heading" && (t as Tokens.Heading).depth <= depth);
  return end === -1 ? rest : rest.slice(0, end);
}

const firstOf = <T extends Token["type"]>(tokens: Token[], type: T) =>
  tokens.find((t) => t.type === type) as Extract<Token, { type: T }> | undefined;

function summaryOf(doc: KnowledgeDoc): string | undefined {
  const summary = doc.data.summary;
  return typeof summary === "string" && summary.trim() ? clean(summary) : undefined;
}

function firstSentence(text: string): string {
  const match = text.match(/^.+?[.!?](?=\s|$)/);
  return clean(match ? match[0] : text);
}

// ─── Public loaders ──────────────────────────────────────────────────────────

export interface Identity {
  /** One sentence on what Novawerk is. */
  description: string;
  /** The short line at the top of the home page. */
  headline: string;
  tagline: string;
}

/** `culture/name-and-tagline.md` */
export function getIdentity(): Identity {
  const doc = readDoc("culture/name-and-tagline.md");
  const details = section(doc.tokens, "Details");
  const bullets = firstOf(details, "list")?.items.map((item) => clean(plain(item.tokens))) ?? [];
  const bullet = (label: string) =>
    bullets.find((b) => b.startsWith(label))?.replace(new RegExp(`^${label}\\s*[—:-]\\s*`), "");

  const oneLiner = bullet("One-line description");
  const description =
    summaryOf(doc) ??
    (oneLiner ? `Novawerk is ${lowerFirst(oneLiner)}` : clean(plain(firstOf(doc.tokens, "paragraph"))));

  return {
    description,
    headline: bullet("Headline") ?? description,
    tagline: bullet("Tagline")?.replace(/^\*|\*$/g, "") ?? "An open workshop for early ideas.",
  };
}

const lowerFirst = (s: string) => (/^(An?|The)\s/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export interface Mission {
  lead: string;
  points: string[];
}

/** `culture/vision-and-mission.md` — the mission line and its five verbs. */
export function getMission(): Mission {
  const doc = readDoc("culture/vision-and-mission.md");
  const mission = section(doc.tokens, "Mission");
  return {
    lead: summaryOf(doc) ?? clean(plain(firstOf(mission, "paragraph"))),
    points: firstOf(mission, "list")?.items.map((item) => clean(plain(item.tokens))) ?? [],
  };
}

export interface Principle {
  number: string;
  name: string;
  summary: string;
}

/** `culture/principles/0*.md` — the three principles, in order. */
export function getPrinciples(): Principle[] {
  return listDocs("culture/principles", /^\d+-.+\.md$/).map((file) => {
    const doc = readDoc(file);
    const title = typeof doc.data.title === "string" ? doc.data.title : clean(plain(firstOf(doc.tokens, "heading")));
    const match = title.match(/^Principle\s+(\d+)\s*[—–-]\s*(.+)$/);
    const quote = firstOf(doc.tokens, "blockquote");
    return {
      number: match?.[1] ?? path.basename(file).split("-")[0]!,
      name: match?.[2] ?? title,
      summary: summaryOf(doc) ?? clean(plain(quote?.tokens ?? firstOf(doc.tokens, "paragraph"))),
    };
  });
}

/** `culture/principles/pledge.md` — the four lines of the community pledge. */
export function getPledge(): string[] {
  const doc = readDoc("culture/principles/pledge.md");
  return firstOf(section(doc.tokens, "The pledge"), "list")?.items.map((item) => clean(plain(item.tokens))) ?? [];
}

export interface Step {
  number: string;
  name: string;
  description: string;
}

/** `operations/how-we-work.md` — the four steps every project moves through. */
export function getProcess(): { intro: string; steps: Step[] } {
  const doc = readDoc("operations/how-we-work.md");
  const table = firstOf(section(doc.tokens, "The four steps"), "table");
  const steps =
    table?.rows.map((row) => ({
      number: clean(plain(row[0]?.tokens)),
      name: clean(plain(row[1]?.tokens)),
      description: clean(plain(row[2]?.tokens)),
    })) ?? [];
  return {
    intro: summaryOf(doc) ?? firstSentence(clean(plain(firstOf(doc.tokens, "paragraph")))),
    steps,
  };
}

// ─── Legal pages ─────────────────────────────────────────────────────────────

export interface LegalPage {
  title: string;
  updated: string | undefined;
  /** Rendered from our own Markdown in knowledge/legal — trusted content. */
  html: string;
  /** Placeholders like {{controller_name}} that still need real values. */
  missing: string[];
}

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/**
 * `legal/<slug>.md` → HTML. Drops the H1 (the page renders its own title) and the
 * `## Related` section (its links point at other Markdown files).
 *
 * Unfilled `{{placeholders}}` are highlighted for review — but a Vercel production build
 * fails on purpose, so a privacy notice or imprint with blanks can never go live.
 */
export function getLegalPage(slug: "privacy" | "imprint"): LegalPage {
  const relativePath = `legal/${slug}.md`;
  const raw = fs.readFileSync(path.join(/*turbopackIgnore: true*/ getKnowledgeDir(), relativePath), "utf8");
  const { data, content } = matter(raw);

  const missing = [...new Set([...content.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
  if (missing.length > 0 && process.env.VERCEL_ENV === "production") {
    throw new Error(`knowledge/${relativePath} still has unfilled placeholders: ${missing.join(", ")}`);
  }

  const tokens = Lexer.lex(content).filter((t) => !(t.type === "heading" && (t as Tokens.Heading).depth === 1));
  const related = tokens.findIndex(
    (t) => t.type === "heading" && (t as Tokens.Heading).depth === 2 && clean(plain(t)) === "Related",
  );
  const body = related === -1 ? tokens : tokens.slice(0, related);

  const html = Parser.parse(body).replace(
    PLACEHOLDER,
    (_, key: string) => `<mark class="legal-placeholder">to be added: ${key.replace(/_/g, " ")}</mark>`,
  );

  return {
    title: typeof data.title === "string" ? data.title : slug,
    updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : (data.updated as string | undefined),
    html,
    missing,
  };
}

// ─── The contribution guide ──────────────────────────────────────────────────

/** Links in CONTRIBUTING.md to other files in the repo open them on GitHub. */
const REPO_BLOB = "https://github.com/Novawerk/novawerk-workspace/blob/main/";

/**
 * `CONTRIBUTING.md` at the repo root → HTML, for /contribute/guide (NB-ADR-0014: the general
 * guide lives in one place, and the welcome email links to it). Drops the H1; relative links
 * point at the file on GitHub.
 */
export function getContributingGuide(): LegalPage {
  const file = path.join(/*turbopackIgnore: true*/ path.dirname(getKnowledgeDir()), "CONTRIBUTING.md");
  const raw = fs.readFileSync(file, "utf8").replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, `](${REPO_BLOB}$1)`);
  const tokens = Lexer.lex(raw).filter((t) => !(t.type === "heading" && (t as Tokens.Heading).depth === 1));
  return { title: "Contribution guide", updated: undefined, html: Parser.parse(tokens), missing: [] };
}
