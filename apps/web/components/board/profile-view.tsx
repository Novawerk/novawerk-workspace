// A contributor's profile (/u/<handle>), also the live preview in edit mode. Server-safe.

import type { ProfileAccent, ProfileBanner, PublicContributorProfile } from "@nw/contracts";
import Link from "next/link";

import { container } from "../ui";
import { AreaChip, Avatar, Markdown } from "./bits";
import { formatDate, formatMonth, safeHref } from "./labels";
import type { ProjectRef } from "./wall";

const ACCENT_VAR: Record<ProfileAccent, string> = {
  green: "var(--color-pa-green)",
  blue: "var(--color-pa-blue)",
  plum: "var(--color-pa-plum)",
  amber: "var(--color-pa-amber)",
  teal: "var(--color-pa-teal)",
  ink: "var(--color-pa-ink)",
};

function bannerStyle(banner: ProfileBanner, accent: ProfileAccent): React.CSSProperties {
  const pa = ACCENT_VAR[accent];
  const tint = `color-mix(in srgb, ${pa} 12%, var(--color-paper))`;
  if (banner === "grid") {
    const line = `color-mix(in srgb, ${pa} 22%, transparent)`;
    return {
      backgroundColor: tint,
      backgroundImage: `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 24px)`,
    };
  }
  if (banner === "dots") {
    return { backgroundColor: tint, backgroundImage: `radial-gradient(color-mix(in srgb, ${pa} 45%, transparent) 1.4px, transparent 1.6px)`, backgroundSize: "16px 16px" };
  }
  return { backgroundColor: tint };
}

export type ProfileData = Pick<
  PublicContributorProfile,
  "handle" | "name" | "avatarUrl" | "bio" | "about" | "links" | "accent" | "banner" | "since" | "stats" | "inProgress" | "done" | "ideasAccepted"
> & {
  /** Initiators (Members who started a project and opted in) have projects instead of task stats. */
  kind?: "contributor" | "initiator";
  projects?: ProjectRef[];
};

export function ProfileView({ profile, actions, compact = false }: { profile: ProfileData; actions?: React.ReactNode; compact?: boolean }) {
  const p = profile;
  const wrap = compact ? "px-5" : container;
  return (
    <div>
      <div aria-hidden="true" className="relative h-[148px] overflow-hidden border-b border-line" style={bannerStyle(p.banner, p.accent)}>
        {p.banner === "star" ? (
          <svg viewBox="0 0 100 100" className="absolute -top-10 right-[8%] size-[220px] opacity-[0.22]">
            <path d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z" style={{ fill: ACCENT_VAR[p.accent] }} />
          </svg>
        ) : null}
      </div>
      <div className={wrap}>
        <div className={`relative -mt-11 grid items-end gap-3 ${compact ? "" : "sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-5"}`}>
          <Avatar name={p.name || p.handle} url={p.avatarUrl} accent={p.accent} size="lg" className="border-[3px] border-canvas!" />
          <div className="min-w-0 pb-1">
            <h1 className="text-3xl font-semibold tracking-tight">{p.name || p.handle}</h1>
            <p className="text-muted">
              @{p.handle}
              {p.kind === "initiator" && p.projects?.length ? (
                <>
                  {" · "}
                  <span className="bg-accent px-1 font-mono text-[11px] text-white">Initiator</span> Started{" "}
                  {p.projects.map((proj, i) => (
                    <span key={proj.slug}>
                      {i > 0 ? ", " : null}
                      <Link className="underline decoration-line-strong underline-offset-4 hover:decoration-ink" href="/#projects">
                        {proj.title}
                      </Link>
                    </span>
                  ))}
                </>
              ) : null}
            </p>
          </div>
          {actions ? <div className="pb-1.5">{actions}</div> : null}
        </div>

        <div className={`grid gap-8 pt-7 pb-16 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_300px]"}`}>
          <div className="grid min-w-0 content-start gap-7">
            {p.bio ? <p className="max-w-[60ch] text-[17px]">{p.bio}</p> : null}
            {p.kind === "initiator" ? null : (
              <p className="flex flex-wrap gap-5 text-sm">
                <span>
                  <b className="font-mono font-medium tabular-nums">{p.stats.done}</b> done
                </span>
                <span>
                  <b className="font-mono font-medium tabular-nums">{p.stats.inProgress}</b> in progress
                </span>
                <span>
                  <b className="font-mono font-medium tabular-nums">{p.stats.werk}</b> Werk
                </span>
                <span>
                  <b className="font-mono font-medium tabular-nums">{p.ideasAccepted.length}</b> ideas accepted
                </span>
              </p>
            )}
            {p.about ? (
              <section className="grid gap-2">
                <h2 className="text-[15px] font-semibold">About</h2>
                <Markdown variant="profile" className="max-w-[62ch]">
                  {p.about}
                </Markdown>
              </section>
            ) : null}
            {p.kind === "initiator" ? null : (
              <>
                <TaskRefs title="In progress" empty="Nothing right now." rows={p.inProgress.map((t) => ({ ...t, right: <AreaChip area={t.area} /> }))} />
                {p.ideasAccepted.length ? <TaskRefs title="Ideas accepted" empty="" rows={p.ideasAccepted.map((t) => ({ ...t, right: <AreaChip area={t.area} /> }))} /> : null}
                <TaskRefs
                  title="Done"
                  empty="No merged tasks yet."
                  rows={p.done.map((t) => ({
                    ...t,
                    right: t.werk ? <span className="font-mono text-[13px] tabular-nums">+{t.werk} Werk</span> : null,
                    sub: t.mergedAt ? `merged ${formatDate(t.mergedAt)}` : undefined,
                  }))}
                />
              </>
            )}
          </div>
          <aside className="grid content-start gap-4">
            {p.links.length ? (
              <div className="grid gap-2 border border-line bg-paper p-5">
                <h2 className="text-sm font-semibold">Links</h2>
                {p.links.map((l) => {
                  const href = safeHref(l);
                  return href ? (
                    <a key={l} href={href} target="_blank" rel="nofollow noopener noreferrer me" className="truncate text-sm underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                      {l.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
                    </a>
                  ) : null;
                })}
              </div>
            ) : null}
            <div className="grid gap-2 border border-line bg-paper p-5">
              <h2 className="text-sm font-semibold">Contributor since</h2>
              <p className="text-sm text-muted">{formatMonth(p.since)}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TaskRefs({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; title: string; right?: React.ReactNode; sub?: string }[];
}) {
  return (
    <section className="grid gap-1">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-[13px] text-muted">{empty}</p> : null}
      {rows.map((t) => (
        <div key={t.id} className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-line py-3 first-of-type:border-t-0">
          <Link href={`/tasks/${t.id}`} className="after:absolute after:inset-0 hover:underline">
            {t.title}
          </Link>
          <span>{t.right}</span>
          <span className="text-[13px] text-muted">
            <span className="font-mono">{t.id}</span>
            {t.sub ? ` · ${t.sub}` : ""}
          </span>
        </div>
      ))}
    </section>
  );
}
