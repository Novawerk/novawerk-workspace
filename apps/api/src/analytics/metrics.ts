// The numbers behind the admin panel's Metrics page (GET /admin/metrics).
// Traffic and the intake funnel come from analytics_events; the inbox from its own tables.
// A range is whole calendar days in Europe/Berlin, today included. Each field's meaning is on
// AdminMetrics in @nw/contracts; the events themselves are listed in docs/analytics.md.

import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNotNull, lt, min, sql, type SQL } from "drizzle-orm";

import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  APPLICATION_STATUSES,
  CTA_PLACEMENTS,
  CTA_TARGETS,
  FORM_KINDS,
  INTAKE_FAILURE_REASONS,
  INTAKE_MODES,
  SUBMISSION_STATUSES,
  type AdminMetrics,
  type CtaPlacement,
  type CtaTarget,
  type IntakeChats,
  type IntakeExits,
  type IntakeFailureReason,
  type IntakeFunnel,
  type IntakeMode,
} from "@nw/contracts";
import {
  analyticsEvents as ae,
  memberApplications,
  newsletterSubscribers,
  outbox,
  projectSubmissions,
  type Database,
} from "@nw/db";

const TIME_ZONE = "Europe/Berlin";
/** Rows in each "top" list. */
const TOP = 10;

const berlinDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` plus `n` days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Midnight at the start of a Berlin calendar day, as an instant. */
const startOf = (day: string) => sql`(${day}::date::timestamp at time zone ${sql.raw(`'${TIME_ZONE}'`)})`;

// Expressions below are built without bound parameters (sql.raw for our own constants), so the
// same expression in SELECT and GROUP BY renders identically and Postgres accepts the grouping.

/** A text prop of the event, e.g. `props ->> 'mode'`. */
const prop = (key: string) => sql<string | null>`${ae.props} ->> ${sql.raw(`'${key}'`)}`;
/** A number prop. `numeric`, not `bigint`: one `12.0` in a row must not fail the whole page. */
const intProp = (key: string) => sql`(${ae.props} ->> ${sql.raw(`'${key}'`)})::numeric`;
const isEvent = (name: string) => sql`${ae.name} = ${sql.raw(`'${name}'`)}`;
const countWhere = (condition: SQL) => sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
const visitsWhere = (condition: SQL) =>
  sql<number>`count(distinct ${ae.visitId}) filter (where ${condition})`.mapWith(Number);
const sumOf = (key: string) => sql<number>`coalesce(sum(${intProp(key)}), 0)`.mapWith(Number);
const berlinDay = sql<string>`to_char((${ae.createdAt} at time zone ${sql.raw(`'${TIME_ZONE}'`)})::date, 'YYYY-MM-DD')`;

const byMode = <T>(make: () => T): Record<IntakeMode, T> =>
  Object.fromEntries(INTAKE_MODES.map((mode) => [mode, make()])) as Record<IntakeMode, T>;
const isMode = (value: string | null): value is IntakeMode => INTAKE_MODES.includes(value as IntakeMode);
const isOneOf = <T extends string>(list: readonly T[], value: string | null): value is T => list.includes(value as T);
const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);
const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export async function loadMetrics(db: Database, days: number, now = new Date()): Promise<AdminMetrics> {
  const to = berlinDate.format(now);
  const from = addDays(to, -(days - 1));
  const rangeOf = (column: AnyPgColumn) => and(gte(column, startOf(from)), lt(column, startOf(addDays(to, 1))))!;
  const inRange = rangeOf(ae.createdAt);
  const named = (...names: string[]) => and(inRange, inArray(ae.name, names))!;
  const web = (...names: string[]) => and(named(...names), eq(ae.source, "web"))!;
  const server = (...names: string[]) => and(named(...names), eq(ae.source, "api"))!;
  const pageViews = web("page_view");

  const chatSentBy = sql`${isEvent("form_received")} and ${prop("via")} = 'chat'`;
  /** Server events carry the chat's mode as `mode`, a sent chat as `form` (pitch / join). */
  const serverMode = sql<string | null>`coalesce(${prop("mode")}, ${prop("form")})`;
  const lastClose = db
    .selectDistinctOn([ae.visitId, prop("mode")], {
      mode: prop("mode").as("mode"),
      turns: intProp("turns").mapWith(Number).as("turns"),
      filled: intProp("filled").mapWith(Number).as("filled"),
      required: intProp("required").mapWith(Number).as("required"),
      submitted: sql<boolean>`(${ae.props} ->> 'submitted')::boolean`.as("submitted"),
    })
    .from(ae)
    .where(web("intake_close"))
    .orderBy(ae.visitId, prop("mode"), desc(ae.createdAt))
    .as("last_close");
  const draftReady = sql`${lastClose.required} > 0 and ${lastClose.filled} >= ${lastClose.required}`;
  const counted = sql`(${ae.props} ->> 'error') is null and not coalesce((${ae.props} ->> 'aborted')::boolean, false)`;
  const percentile = (p: number) =>
    sql<number | null>`percentile_cont(${sql.raw(String(p))}) within group (order by ${intProp("ms")}) filter (where ${counted})`.mapWith(
      toNumber,
    );

  const [
    [totals],
    daily,
    topPages,
    topReferrers,
    topCampaigns,
    topCountries,
    topRegions,
    devices,
    ctaClicks,
    projectClicks,
    funnelRows,
    exitRows,
    chatRows,
    failureRows,
    [fallbacks],
    formRows,
    agentRows,
    [pitches],
    [applications],
    [newsletter],
    submissionStatus,
    applicationStatus,
    [pendingEmails],
  ] = await Promise.all([
    db.select({ pageViews: count(), visits: countDistinct(ae.visitId) }).from(ae).where(pageViews),
    db
      .select({ date: berlinDay, pageViews: count(), visits: countDistinct(ae.visitId) })
      .from(ae)
      .where(pageViews)
      .groupBy(berlinDay),
    db
      .select({ path: ae.path, views: count() })
      .from(ae)
      .where(and(pageViews, isNotNull(ae.path)))
      .groupBy(ae.path)
      .orderBy(desc(count()), asc(ae.path))
      .limit(TOP),
    db
      .select({ host: ae.referrer, visits: countDistinct(ae.visitId) })
      .from(ae)
      .where(and(pageViews, isNotNull(ae.referrer)))
      .groupBy(ae.referrer)
      .orderBy(desc(countDistinct(ae.visitId)), asc(ae.referrer))
      .limit(TOP),
    db
      .select({ source: prop("utmSource"), visits: countDistinct(ae.visitId) })
      .from(ae)
      .where(and(pageViews, isNotNull(prop("utmSource"))))
      .groupBy(prop("utmSource"))
      .orderBy(desc(countDistinct(ae.visitId)), asc(prop("utmSource")))
      .limit(TOP),
    db
      .select({ country: ae.country, visits: countDistinct(ae.visitId) })
      .from(ae)
      .where(pageViews)
      .groupBy(ae.country)
      .orderBy(desc(countDistinct(ae.visitId)), asc(ae.country)),
    db
      .select({ region: ae.region, visits: countDistinct(ae.visitId) })
      .from(ae)
      .where(and(pageViews, isNotNull(ae.region)))
      .groupBy(ae.region)
      .orderBy(desc(countDistinct(ae.visitId)), asc(ae.region))
      .limit(TOP),
    db.select({ device: ae.device, visits: countDistinct(ae.visitId) }).from(ae).where(pageViews).groupBy(ae.device),
    db
      .select({ target: prop("target"), placement: prop("placement"), clicks: count() })
      .from(ae)
      .where(web("cta_click"))
      .groupBy(prop("target"), prop("placement")),
    db
      .select({ project: prop("project"), clicks: count() })
      .from(ae)
      .where(web("project_click"))
      .groupBy(prop("project"))
      .orderBy(desc(count()), asc(prop("project")))
      .limit(TOP),
    db
      .select({
        mode: prop("mode"),
        opened: visitsWhere(isEvent("intake_open")),
        engaged: visitsWhere(isEvent("intake_message")),
        ready: visitsWhere(isEvent("intake_draft_ready")),
        submitted: visitsWhere(isEvent("intake_submitted")),
      })
      .from(ae)
      .where(web("intake_open", "intake_message", "intake_draft_ready", "intake_submitted"))
      .groupBy(prop("mode")),
    db
      .select({
        mode: lastClose.mode,
        beforeFirstMessage: sql<number>`count(*) filter (where ${lastClose.turns} = 0)`.mapWith(Number),
        whileDrafting: sql<number>`count(*) filter (where ${lastClose.turns} > 0 and not (${draftReady}))`.mapWith(Number),
        withDraftReady: sql<number>`count(*) filter (where ${lastClose.turns} > 0 and ${draftReady})`.mapWith(Number),
      })
      .from(lastClose)
      .where(eq(lastClose.submitted, false))
      .groupBy(lastClose.mode),
    db
      .select({
        mode: serverMode,
        started: countWhere(isEvent("intake_session_created")),
        engaged: countWhere(sql`${isEvent("agent_turn")} and ${prop("agent")} = 'intake' and ${prop("turn")} = '1'`),
        submitted: countWhere(chatSentBy),
        avgTurnsToSubmit: sql<number | null>`avg(${intProp("turns")}) filter (where ${chatSentBy})`.mapWith(toNumber),
      })
      .from(ae)
      .where(server("intake_session_created", "agent_turn", "form_received"))
      .groupBy(serverMode),
    db.select({ reason: prop("reason"), count: count() }).from(ae).where(web("intake_reply_failed")).groupBy(prop("reason")),
    db.select({ count: count() }).from(ae).where(web("intake_unavailable")),
    db
      .select({
        form: prop("form"),
        submitted: countWhere(sql`${isEvent("form_received")} and ${prop("via")} = 'form'`),
        failed: countWhere(isEvent("form_failed")),
      })
      .from(ae)
      .where(and(named("form_received", "form_failed")))
      .groupBy(prop("form")),
    db
      .select({
        agent: prop("agent"),
        turns: count(),
        errors: countWhere(sql`(${ae.props} ->> 'error') is not null`),
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        inputTokens: sumOf("inputTokens"),
        cachedInputTokens: sumOf("cachedInputTokens"),
        outputTokens: sumOf("outputTokens"),
      })
      .from(ae)
      .where(server("agent_turn"))
      .groupBy(prop("agent"))
      .orderBy(desc(count())),
    db.select({ count: count() }).from(projectSubmissions).where(rangeOf(projectSubmissions.createdAt)),
    db.select({ count: count() }).from(memberApplications).where(rangeOf(memberApplications.createdAt)),
    db.select({ count: count() }).from(newsletterSubscribers).where(rangeOf(newsletterSubscribers.createdAt)),
    db
      .select({ status: projectSubmissions.status, count: count(), oldest: min(projectSubmissions.createdAt) })
      .from(projectSubmissions)
      .groupBy(projectSubmissions.status),
    db
      .select({ status: memberApplications.status, count: count(), oldest: min(memberApplications.createdAt) })
      .from(memberApplications)
      .groupBy(memberApplications.status),
    db.select({ count: count(), oldest: min(outbox.createdAt) }).from(outbox).where(eq(outbox.status, "pending")),
  ]);

  // ─── Fold into the response shape ──────────────────────────────────────────

  const perDay = new Map(daily.map((d) => [d.date, d]));
  const dailyRows: AdminMetrics["traffic"]["daily"] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const row = perDay.get(day);
    dailyRows.push({ date: day, visits: row?.visits ?? 0, pageViews: row?.pageViews ?? 0 });
  }

  const funnel = byMode<IntakeFunnel>(() => ({ opened: 0, engaged: 0, ready: 0, submitted: 0 }));
  for (const { mode, ...row } of funnelRows) if (isMode(mode)) funnel[mode] = row;

  const exits = byMode<IntakeExits>(() => ({ beforeFirstMessage: 0, whileDrafting: 0, withDraftReady: 0 }));
  for (const { mode, ...row } of exitRows) if (isMode(mode)) exits[mode] = row;

  const chats = byMode<IntakeChats>(() => ({ started: 0, engaged: 0, submitted: 0, avgTurnsToSubmit: null }));
  for (const { mode, avgTurnsToSubmit, ...row } of chatRows) {
    if (isMode(mode)) {
      chats[mode] = { ...row, avgTurnsToSubmit: avgTurnsToSubmit === null ? null : Math.round(avgTurnsToSubmit * 10) / 10 };
    }
  }

  const forms = Object.fromEntries(FORM_KINDS.map((kind) => [kind, { submitted: 0, failed: 0 }])) as AdminMetrics["forms"];
  for (const { form, ...row } of formRows) if (isOneOf(FORM_KINDS, form)) forms[form] = row;

  const statusCounts = <S extends string>(
    statuses: readonly S[],
    rows: { status: S; count: number; oldest: Date | null }[],
  ) => ({
    counts: Object.fromEntries(statuses.map((s) => [s, rows.find((r) => r.status === s)?.count ?? 0])) as Record<S, number>,
    oldestNew: iso(rows.find((r) => r.status === ("new" as S))?.oldest),
  });
  const submissions = statusCounts(SUBMISSION_STATUSES, submissionStatus);
  const apps = statusCounts(APPLICATION_STATUSES, applicationStatus);

  return {
    range: { days, from, to },
    traffic: {
      visits: totals?.visits ?? 0,
      pageViews: totals?.pageViews ?? 0,
      daily: dailyRows,
      topPages: topPages.map((r) => ({ path: r.path ?? "", views: r.views })),
      topReferrers: topReferrers.map((r) => ({ host: r.host ?? "", visits: r.visits })),
      topCampaigns: topCampaigns.map((r) => ({ source: r.source ?? "", visits: r.visits })),
      topCountries: topCountries
        .filter((r): r is { country: string; visits: number } => r.country !== null)
        .slice(0, TOP),
      topRegions: topRegions.map((r) => ({ region: r.region ?? "", visits: r.visits })),
      unknownLocation: topCountries.find((r) => r.country === null)?.visits ?? 0,
      devices: {
        mobile: devices.find((d) => d.device === "mobile")?.visits ?? 0,
        desktop: devices.find((d) => d.device === "desktop")?.visits ?? 0,
      },
      ctaClicks: ctaClicks
        .filter(
          (r): r is { target: CtaTarget; placement: CtaPlacement; clicks: number } =>
            isOneOf(CTA_TARGETS, r.target) && isOneOf(CTA_PLACEMENTS, r.placement),
        )
        .sort((a, b) => b.clicks - a.clicks),
      projectClicks: projectClicks.map((r) => ({ project: r.project ?? "", clicks: r.clicks })),
    },
    intake: {
      funnel,
      exits,
      chats,
      replyFailures: failureRows
        .filter((r): r is { reason: IntakeFailureReason; count: number } => isOneOf(INTAKE_FAILURE_REASONS, r.reason))
        .sort((a, b) => b.count - a.count),
      fallbacks: fallbacks?.count ?? 0,
    },
    forms,
    agents: agentRows.map((r) => ({ ...r, agent: r.agent ?? "unknown" })),
    received: {
      pitches: pitches?.count ?? 0,
      applications: applications?.count ?? 0,
      newsletter: newsletter?.count ?? 0,
      pitchesViaChat: chats.pitch.submitted,
      applicationsViaChat: chats.join.submitted,
    },
    inbox: {
      submissions: submissions.counts,
      applications: apps.counts,
      oldestNewSubmissionAt: submissions.oldestNew,
      oldestNewApplicationAt: apps.oldestNew,
      outboxPending: pendingEmails?.count ?? 0,
      oldestPendingEmailAt: iso(pendingEmails?.oldest),
    },
  };
}
