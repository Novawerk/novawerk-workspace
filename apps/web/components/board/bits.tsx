// Small pieces every task board page uses. Server-safe: no hooks.

import type { ProfileAccent, PublicPerson, PublicTask, TaskArea, TaskKind, TaskSize } from "@nw/contracts";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { boardState, plural, personLabel, prLabel, safeMarkdownHref, STATE_DOT, UGC_REL, werkOf, type BoardState } from "./labels";

// ─── Tags ────────────────────────────────────────────────────────────────────
// One component: size, area, skills and type share height, border and type; area adds a square.

const chipBase = "inline-flex h-6 items-center gap-1.5 border border-line-strong bg-paper px-2 text-xs leading-none whitespace-nowrap text-ink";

export function Chip({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <span className={`${chipBase} ${mono ? "font-mono" : ""}`}>{children}</span>;
}

export function AreaChip({ area }: { area: TaskArea | null }) {
  if (!area) return null;
  return (
    <span className={chipBase}>
      <span aria-hidden="true" className="size-1.5 bg-muted" />
      {area}
    </span>
  );
}

/** `M · 3 Werk`, a two-part badge. */
export function SizeBadge({ size }: { size: TaskSize }) {
  return (
    <span className={chipBase} title={`Size ${size}, ${werkOf(size)} Werk`}>
      <b className="font-semibold">{size}</b>
      <span className="text-muted">· {werkOf(size)} Werk</span>
    </span>
  );
}

export function KindChip({ kind }: { kind: TaskKind }) {
  return <Chip>{kind === "bug" ? "Bug" : kind === "improvement" ? "Improvement" : "Task"}</Chip>;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function StatusDot({ state, className = "" }: { state: BoardState; className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 ${STATE_DOT[state]} ${className}`} />;
}

/** "Open", "3 proposals", "In progress · @mira", "In review · PR #212", "Done · +1 Werk". */
export function statusText(task: PublicTask): string {
  const state = boardState(task);
  switch (state) {
    case "suggested":
      return task.needsInfo ? "Suggested · needs info" : "Suggested";
    case "open":
      return "Open";
    case "proposed":
      return plural(task.proposalCount, "proposal");
    case "assigned":
      return task.assignee ? `In progress · ${personLabel(task.assignee)}` : "In progress";
    case "in_review":
      return task.prUrl ? `In review · ${prLabel(task.prUrl)}` : "In review";
    case "done":
      return task.werk ? `Done · +${task.werk} Werk` : "Done";
    case "closed":
      return task.status === "declined" ? "Declined" : task.status === "duplicate" ? "Duplicate" : "Closed";
  }
}

export function StatusLabel({ task }: { task: PublicTask }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap text-ink">
      <StatusDot state={boardState(task)} />
      {statusText(task)}
    </span>
  );
}

// ─── People ──────────────────────────────────────────────────────────────────

const ACCENT_CLASS: Record<ProfileAccent, string> = {
  green: "text-pa-green bg-pa-green/15 border-pa-green/35",
  blue: "text-pa-blue bg-pa-blue/15 border-pa-blue/35",
  plum: "text-pa-plum bg-pa-plum/15 border-pa-plum/35",
  amber: "text-pa-amber bg-pa-amber/15 border-pa-amber/35",
  teal: "text-pa-teal bg-pa-teal/15 border-pa-teal/35",
  ink: "text-pa-ink bg-pa-ink/10 border-pa-ink/30",
};

const AVATAR_SIZE = { xs: "size-[22px] text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-[88px] text-[28px]" };

export function initials(name: string): string {
  const parts = name.replace(/^@/, "").split(/[\s_-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** A picture when there is one (GitHub's), else initials on the person's accent. */
export function Avatar({
  name,
  url,
  accent = "green",
  size = "sm",
  className = "",
}: {
  name: string;
  url?: string | null;
  accent?: ProfileAccent;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
}) {
  const box = `${AVATAR_SIZE[size]} inline-grid shrink-0 place-items-center border font-semibold ${className}`;
  if (url && /^https:\/\//.test(url)) {
    // A remote GitHub picture: no next/image optimisation for user pictures.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" aria-hidden="true" className={`${box} border-line object-cover`} loading="lazy" />;
  }
  return (
    <span aria-hidden="true" className={`${box} ${ACCENT_CLASS[accent]}`}>
      {initials(name)}
    </span>
  );
}

/**
 * A person on a task, a post or a vote. Public contributors link to their profile; a private
 * profile shows the handle unlinked; a Member gets the Novawerk tag.
 */
export function Person({ person, avatar = false }: { person: PublicPerson | null; avatar?: boolean }) {
  if (!person || person.kind === "former") return <span className="text-muted">a former contributor</span>;
  if (person.kind === "member") {
    return (
      <span className="inline-flex items-center gap-2">
        {avatar ? <Avatar name={person.name} accent="ink" size="xs" /> : null}
        <span className="font-medium">{person.name}</span>
        <span className="border border-line-strong px-1 font-mono text-[11px] text-muted">Novawerk</span>
      </span>
    );
  }
  const face = avatar ? <Avatar name={person.name ?? person.handle} url={person.avatarUrl} size="xs" /> : null;
  return (
    <span className="inline-flex items-center gap-2">
      {face}
      {person.public ? (
        <Link href={`/u/${person.handle}`} className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          @{person.handle}
        </Link>
      ) : (
        <span className="font-medium">@{person.handle}</span>
      )}
    </span>
  );
}

// ─── Markdown ────────────────────────────────────────────────────────────────

const PROFILE_ELEMENTS = ["p", "strong", "ul", "ol", "li", "a", "br"];
const BOARD_ELEMENTS = [...PROFILE_ELEMENTS, "em", "code", "pre", "blockquote", "h3", "h4", "del", "hr"];

const mdComponents: Components = {
  a: ({ href, children }) => {
    const safe = safeMarkdownHref(href);
    if (!safe) return <span>{children}</span>;
    return (
      <a href={safe.href} {...(safe.external ? { target: "_blank", rel: UGC_REL } : {})}>
        {children}
      </a>
    );
  },
  // Headings people write become small headings, never a second h1.
  h1: ({ children }) => <h3 className="font-semibold">{children}</h3>,
  h2: ({ children }) => <h4 className="font-semibold">{children}</h4>,
};

/**
 * Markdown someone wrote. No raw HTML and no images ever; `profile` allows only bold, lists and
 * links (the About text). Anything else keeps its text and loses its markup.
 */
export function Markdown({ children, variant = "board", className = "" }: { children: string; variant?: "board" | "profile"; className?: string }) {
  return (
    <div className={`board-md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={variant === "profile" ? PROFILE_ELEMENTS : [...BOARD_ELEMENTS, "h1", "h2"]}
        unwrapDisallowed
        skipHtml
        components={mdComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

// ─── Notes and empty states ──────────────────────────────────────────────────

const NOTE_TONE = {
  plain: "border-line bg-subtle",
  ok: "border-accent/35 bg-accent-soft",
  warn: "border-warn/35 bg-warn-soft",
  info: "border-info/30 bg-info-soft",
  danger: "border-danger/35 bg-danger-soft",
};

export function Note({ tone = "plain", children, className = "" }: { tone?: keyof typeof NOTE_TONE; children: React.ReactNode; className?: string }) {
  return <div className={`border px-4 py-3 text-sm ${NOTE_TONE[tone]} ${className}`}>{children}</div>;
}

export function StarMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" className="fill-line-strong" />
    </svg>
  );
}

export function EmptyState({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 border border-dashed border-line-strong bg-paper px-6 py-12 text-center">
      <StarMark />
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {children ? <div className="max-w-[44ch] text-sm text-muted">{children}</div> : null}
      {actions ? <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The API is down or not configured. */
export function BoardOffline({ what = "The task board" }: { what?: string }) {
  return (
    <EmptyState title={`${what} is offline right now`}>
      We couldn&apos;t load it. Please try again in a few minutes.
    </EmptyState>
  );
}
