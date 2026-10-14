// Which posts a project should have by now. Pure: the project's dates in, the posts out.
//
// The six moments come from knowledge/community/promotion/README.md:
//
//   kickoff            when it starts building
//   progress           every 2 weeks while building ("week 2", "week 4", …)
//   behind_the_scenes  10 days before the launch date, while launching
//   launch             on the launch date ("T")
//   ten_day            T+10
//   retro              T+30 and T+90
//
// A post appears a few days before it is due (LEAD_DAYS), so there is time to draft and review
// it. A moment more than two weeks gone is skipped instead of created late: a project that
// predates this schedule doesn't get a pile of stale posts.

import type { LifecyclePostKind, PostKind, ProjectStatus } from "@nw/contracts";

export interface LifecycleFacts {
  status: ProjectStatus;
  /** ISO date. Planned while launching, the real day once launched. */
  launchDate: string | null;
  /** ISO date the project first became `building`, if we know. */
  buildingSince: string | null;
}

export interface PlannedPost {
  kind: LifecyclePostKind;
  /** Progress: the week. Retro: the day after launch. Otherwise 0. */
  seq: number;
  /** ISO date. */
  dueOn: string;
}

/** How many days before it is due a post appears. */
export const LEAD_DAYS: Record<LifecyclePostKind, number> = {
  kickoff: 0,
  progress: 3,
  behind_the_scenes: 5,
  launch: 7,
  ten_day: 3,
  retro: 5,
};

/** A post due longer ago than this is not created any more. */
export const STALE_AFTER_DAYS = 14;
export const PROGRESS_EVERY_WEEKS = 2;
export const BEHIND_THE_SCENES_DAYS_BEFORE = 10;
export const TEN_DAY_AFTER = 10;
export const RETRO_DAYS = [30, 90] as const;

const DAY_MS = 86_400_000;

/** "2026-10-03" + 7 → "2026-10-10". */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The UTC calendar day of a timestamp. */
export const isoDay = (at: Date) => at.toISOString().slice(0, 10);

const ACTIVE: readonly ProjectStatus[] = ["building", "launching", "launched"];

/** Every post the project should have on `today`. Already existing ones are the caller's to skip. */
export function plannedPosts(project: LifecycleFacts, today: string): PlannedPost[] {
  const out: PlannedPost[] = [];
  const consider = (kind: LifecyclePostKind, seq: number, dueOn: string) => {
    if (today < addDays(dueOn, -LEAD_DAYS[kind])) return;
    if (daysBetween(dueOn, today) > STALE_AFTER_DAYS) return;
    out.push({ kind, seq, dueOn });
  };

  const { status, launchDate, buildingSince } = project;

  if (buildingSince && ACTIVE.includes(status)) consider("kickoff", 0, buildingSince);

  if (buildingSince && status === "building") {
    const horizon = addDays(today, LEAD_DAYS.progress);
    for (let week = PROGRESS_EVERY_WEEKS; ; week += PROGRESS_EVERY_WEEKS) {
      const dueOn = addDays(buildingSince, week * 7);
      if (dueOn > horizon) break;
      consider("progress", week, dueOn);
    }
  }

  if (launchDate && status === "launching") {
    consider("behind_the_scenes", 0, addDays(launchDate, -BEHIND_THE_SCENES_DAYS_BEFORE));
  }
  if (launchDate && (status === "launching" || status === "launched")) consider("launch", 0, launchDate);
  if (launchDate && status === "launched") {
    consider("ten_day", 0, addDays(launchDate, TEN_DAY_AFTER));
    for (const day of RETRO_DAYS) consider("retro", day, addDays(launchDate, day));
  }

  return out;
}

/** How far ahead the board shows moments still to come. */
export const UPCOMING_DAYS = 120;

/**
 * Moments still ahead that have no post yet, for the board: the next progress post while
 * building, and every dated one within UPCOMING_DAYS. Launch moments show as soon as a launch
 * date is set; the posts themselves are created once the project reaches that stage.
 */
export function upcomingPosts(
  project: LifecycleFacts,
  today: string,
  existing: readonly { kind: PostKind; seq: number }[],
): PlannedPost[] {
  const out: PlannedPost[] = [];
  const horizon = addDays(today, UPCOMING_DAYS);
  const consider = (kind: LifecyclePostKind, seq: number, dueOn: string) => {
    if (existing.some((p) => p.kind === kind && p.seq === seq)) return;
    if (dueOn > horizon || daysBetween(dueOn, today) > STALE_AFTER_DAYS) return;
    out.push({ kind, seq, dueOn });
  };

  const { status, launchDate, buildingSince } = project;
  const beforeLaunch = status === "planning" || status === "building" || status === "launching";

  if (buildingSince && ACTIVE.includes(status)) consider("kickoff", 0, buildingSince);

  if (buildingSince && status === "building") {
    for (let week = PROGRESS_EVERY_WEEKS; ; week += PROGRESS_EVERY_WEEKS) {
      const dueOn = addDays(buildingSince, week * 7);
      if (dueOn > horizon) break;
      if (dueOn >= today && !existing.some((p) => p.kind === "progress" && p.seq === week)) {
        out.push({ kind: "progress", seq: week, dueOn });
        break;
      }
    }
  }

  if (launchDate && beforeLaunch) {
    consider("behind_the_scenes", 0, addDays(launchDate, -BEHIND_THE_SCENES_DAYS_BEFORE));
  }
  if (launchDate && (beforeLaunch || status === "launched")) {
    consider("launch", 0, launchDate);
    consider("ten_day", 0, addDays(launchDate, TEN_DAY_AFTER));
    for (const day of RETRO_DAYS) consider("retro", day, addDays(launchDate, day));
  }

  return out;
}

/**
 * The seq for a post a member adds by hand: the next free week or retro day, the next number for
 * a custom post, else 0.
 */
export function nextSeq(kind: PostKind, taken: number[], facts: LifecycleFacts | null, today: string): number {
  if (kind === "custom") return Math.max(0, ...taken) + 1;
  if (!facts) return 0;
  if (kind === "progress") {
    const since = facts.buildingSince ?? today;
    let week = Math.max(1, Math.ceil(daysBetween(since, today) / 7));
    while (taken.includes(week)) week++;
    return week;
  }
  if (kind === "retro") {
    const day = facts.launchDate ? Math.max(1, daysBetween(facts.launchDate, today)) : 30;
    let seq = day;
    while (taken.includes(seq)) seq++;
    return seq;
  }
  return 0;
}
