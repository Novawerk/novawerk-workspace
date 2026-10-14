// @nw/ceremonies — the logic behind the standup-digest and all-hands-prep agents.
//
// Both read the NB board, ask Claude to write in Novawerk's voice, and write a record under
// records/operations/. The GitHub Actions workflow commits it. Nothing leaves the repo.

import { MODELS, type Claude } from "@nw/agent-core";
import { BLOCKED_JQL, OPEN_JQL, recentlyDoneJql, type JiraClient, type JiraIssue } from "@nw/jira";
import { appendSection, newRecord, type RecordStore } from "@nw/records";

// ─── Dates (Europe/Berlin is where we meet) ──────────────────────────────────

const TZ = "Europe/Berlin";

/** YYYY-MM-DD in Berlin. */
export function berlinDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** ISO week of a YYYY-MM-DD date, e.g. "2026-W40". */
export function isoWeek(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/**
 * All-hands is fortnightly. The workflow runs every Monday; this says whether this is an
 * all-hands week, counted in whole weeks from `anchor` (the Monday of any past all-hands week).
 */
export function isAllHandsWeek(todayIso: string, anchorIso: string): boolean {
  const weeks = Math.floor(daysBetween(anchorIso, todayIso) / 7);
  return weeks % 2 === 0;
}

// ─── Shared prompt bits ──────────────────────────────────────────────────────

function voiceSystem(voice: string, task: string): string {
  return (
    `You write internal notes for Novawerk. Short sentences, "we", present tense. Plain Markdown.\n\n` +
    `${task}\n\n<brand_voice>\n${voice.trim()}\n</brand_voice>`
  );
}

function issueLines(issues: JiraIssue[]): string {
  if (issues.length === 0) return "(none)";
  return issues.map((i) => `- ${i.key} [${i.status}] ${i.assignee || "no owner"}: ${i.summary}`).join("\n");
}

// ─── Standup digest ──────────────────────────────────────────────────────────

export interface CeremonyDeps {
  jira: JiraClient;
  claude: Claude;
  records: RecordStore;
  /** knowledge/brand/voice.md body. */
  voice: string;
  log: (message: string) => void;
}

export function standupPath(dateIso: string): string {
  return `records/operations/standups/${isoWeek(dateIso)}-standup-digest.md`;
}

export async function writeStandupDigest(
  deps: CeremonyDeps,
  opts: { now: Date; doneWindowDays?: number },
): Promise<{ path: string; open: number; done: number }> {
  const date = berlinDate(opts.now);
  const open = await deps.jira.listIssues(OPEN_JQL, { orderBy: "status" });
  const done = await deps.jira.listIssues(recentlyDoneJql(opts.doneWindowDays ?? 2), { orderBy: "updated" });
  deps.log(`${open.length} open issue(s), ${done.length} done recently.`);

  const digest = await deps.claude.text({
    model: MODELS.summary,
    effort: "low",
    system: voiceSystem(
      voiceText(deps.voice),
      "Write an async standup digest from the NB board. Use exactly three `###` sections: Done, Next, " +
        "Blocked. One bullet per issue: key, owner, what changed or what's next, in a few words. " +
        "Under Blocked, say who could unblock it if the issue makes that clear. No intro, no outro.",
    ),
    user: `Date: ${date}\n\nDone in the last ${opts.doneWindowDays ?? 2} days:\n${issueLines(done)}\n\nOpen:\n${issueLines(open)}`,
  });

  const path = standupPath(date);
  const week = isoWeek(date);
  await appendSection(deps.records, path, { heading: date, body: digest, updated: date }, () =>
    newRecord(
      { title: `Standup digest ${week}`, category: "operations", status: "evolving", updated: date },
      `# Standup digest ${week}\n\nWritten by the \`standup-digest\` agent from the NB board. Newest at the bottom.\n`,
    ),
  );
  deps.log(`Wrote ${path}.`);
  return { path, open: open.length, done: done.length };
}

// ─── All-hands prep ──────────────────────────────────────────────────────────

export interface AllHandsDeps extends CeremonyDeps {
  /** knowledge/operations/meetings-and-ceremonies.md body. */
  meetingDesign: string;
}

export function allHandsPath(dateIso: string): string {
  return `records/operations/all-hands/${dateIso}-all-hands.md`;
}

export type AllHandsResult =
  | { status: "written"; path: string }
  | { status: "skipped"; reason: string };

export async function writeAllHandsAgenda(
  deps: AllHandsDeps,
  opts: { now: Date; anchor: string; force?: boolean },
): Promise<AllHandsResult> {
  const date = berlinDate(opts.now);
  if (!opts.force && !isAllHandsWeek(date, opts.anchor)) {
    return { status: "skipped", reason: `${date} is not an all-hands week (fortnightly from ${opts.anchor}).` };
  }
  const path = allHandsPath(date);
  if (!opts.force && (await deps.records.read(path)) !== undefined) {
    return { status: "skipped", reason: `${path} already exists; not overwriting it.` };
  }

  const blocked = await deps.jira.listIssues(BLOCKED_JQL, { orderBy: "updated" });
  const open = await deps.jira.listIssues(OPEN_JQL, { orderBy: "status" });
  const thisWeek = await deps.records.read(standupPath(date));
  deps.log(`${blocked.length} blocked, ${open.length} open; standup digest this week: ${thisWeek ? "yes" : "no"}.`);

  const agenda = await deps.claude.text({
    model: MODELS.draft,
    effort: "medium",
    system: voiceSystem(
      voiceText(deps.voice),
      "Draft the agenda and one-page pre-read for our fortnightly all-hands. Order: blockers first, " +
        "then timeline, then ideation, then funding. Every item names one owner and one call to " +
        "action. Use `##` headings. Follow this meeting design:\n\n<meeting_design>\n" +
        `${deps.meetingDesign.trim()}\n</meeting_design>`,
    ),
    user:
      `All-hands week of ${date}.\n\nBlocked issues:\n${issueLines(blocked)}\n\nOpen issues:\n${issueLines(open)}` +
      (thisWeek ? `\n\nThis week's standup digest:\n<digest>\n${thisWeek}\n</digest>` : ""),
  });

  await deps.records.write(
    path,
    newRecord(
      { title: `All-hands ${date}`, category: "operations", status: "draft", updated: date },
      `# All-hands — week of ${date}\n\n> Drafted by the \`all-hands-prep\` agent. Edit freely before the meeting.\n\n${agenda.trim()}\n`,
    ),
  );
  deps.log(`Wrote ${path}.`);
  return { status: "written", path };
}

/** Knowledge files start with their own "# Title"; keep the body only. */
function voiceText(voice: string): string {
  return voice.replace(/^# .*\n/, "").trim();
}
