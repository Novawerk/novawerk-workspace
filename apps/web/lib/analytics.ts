// Cookieless usage counting for novawerk.io (privacy notice: "When you visit the website";
// the event catalog: docs/analytics.md, @nw/contracts webEventInput).
//
// Events queue in memory and go to POST /public/events in small batches: a few seconds after
// the first one, and right away when the page is hidden. Nothing is stored in the browser: the
// visit id is random and lives as long as this page load. Browsers that send Do Not Track or
// Global Privacy Control aren't counted at all.
//
// Only types come from @nw/contracts: instrumentation-client.ts loads this on every page, and
// the schemas (zod) would put the whole form validation into the first download. The API
// validates every event; the sanitizers below keep paths and utm values inside its rules.

import type { WebEventInput, WebEventName, WebEventProps, WebEventsInput } from "@nw/contracts";

const FLUSH_DELAY_MS = 3000;
/** MAX_EVENTS_PER_BATCH in @nw/contracts. */
const MAX_BATCH = 25;

interface TrackerState {
  visit: string;
  queue: WebEventInput[];
  timer: ReturnType<typeof setTimeout> | null;
}

declare global {
  interface Window {
    /** In memory only. On window so every bundle that imports this module shares one visit. */
    __nwAnalytics?: TrackerState;
  }
}

function endpoint(): string | null {
  // Must be referenced literally so Next inlines it into the client bundle.
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  return base ? `${base.replace(/\/+$/, "")}/public/events` : null;
}

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function state(): TrackerState | null {
  if (typeof window === "undefined" || !endpoint() || optedOut()) return null;
  return (window.__nwAnalytics ??= { visit: randomId(), queue: [], timer: null });
}

/**
 * A pathname the API accepts: percent-encode anything outside its character set. Profile
 * addresses lose the handle (/u/lena-k → /u/_), so a count never names a person.
 */
export function cleanPath(pathname: string): string {
  const path = (pathname.startsWith("/") ? pathname : `/${pathname}`).replace(/^\/u\/[^/]+/, "/u/_");
  return path
    .replace(/[^A-Za-z0-9\-._~/()@%]/g, (c) => encodeURIComponent(c).replace(/[^%A-Za-z0-9]/g, ""))
    .slice(0, 200);
}

/** A utm value as a lowercase slug (`LinkedIn Ads` → `linkedin-ads`), or undefined. */
export function cleanSlug(value: string | null | undefined): string | undefined {
  const slug = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 64);
  return slug || undefined;
}

/** Count one event. Safe to call anywhere: it does nothing on the server or when opted out. */
export function track<N extends WebEventName>(
  name: N,
  props: WebEventProps<N>,
  options: { path?: string; referrer?: string } = {},
): void {
  const s = state();
  if (!s) return;
  const event = {
    name,
    path: cleanPath(options.path ?? window.location.pathname),
    props,
    ...(options.referrer ? { referrer: options.referrer.slice(0, 500) } : {}),
  } as WebEventInput;
  s.queue.push(event);
  if (s.queue.length >= MAX_BATCH) flush();
  else s.timer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

/** Send what's queued now. `keepalive` lets it finish while the page closes. */
export function flush(): void {
  const s = window.__nwAnalytics;
  const url = endpoint();
  if (!s || !url) return;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  while (s.queue.length > 0) {
    const body: WebEventsInput = { visit: s.visit, events: s.queue.splice(0, MAX_BATCH) };
    // text/plain keeps it a simple request: no CORS preflight. No cookies go with it.
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      // Counting is best effort.
    });
  }
}

/** The page view for the current URL: on the first load with the referrer and utm tags. */
export function trackPageView(path: string, first: boolean): void {
  if (!first) return track("page_view", {}, { path });
  const params = new URLSearchParams(window.location.search);
  const props: WebEventProps<"page_view"> = {};
  const utmSource = cleanSlug(params.get("utm_source"));
  const utmMedium = cleanSlug(params.get("utm_medium"));
  const utmCampaign = cleanSlug(params.get("utm_campaign"));
  if (utmSource) props.utmSource = utmSource;
  if (utmMedium) props.utmMedium = utmMedium;
  if (utmCampaign) props.utmCampaign = utmCampaign;
  track("page_view", props, { path, referrer: document.referrer || undefined });
}

// ─── Clicks, declared in markup ──────────────────────────────────────────────

type ClickEvent = "cta_click" | "project_click";

/**
 * `data-track*` attributes for a link whose clicks we count. Works in Server Components: one
 * document-level listener (instrumentation-client.ts) reads them, so the link stays plain HTML.
 */
export function trackClick<N extends ClickEvent>(name: N, props: WebEventProps<N>): Record<string, string> {
  const attrs: Record<string, string> = { "data-track": name };
  for (const [key, value] of Object.entries(props)) attrs[`data-track-${key}`] = String(value);
  return attrs;
}

/** The click listener for `trackClick` attributes. */
export function onTrackedClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-track]") : null;
  if (!target) return;
  const { track: name, ...data } = target.dataset;
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    // data-track-placement → dataset.trackPlacement → placement
    if (key.startsWith("track") && key.length > 5 && value !== undefined) {
      props[key[5]!.toLowerCase() + key.slice(6)] = value;
    }
  }
  if (name === "cta_click" || name === "project_click") track(name, props as never);
}
