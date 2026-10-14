// POST /public/events: usage events from novawerk.io, counted without cookies.
//
// The browser sends a small JSON batch as text/plain: a "simple" request, so there is no CORS
// preflight and fetch(keepalive) can deliver it while the page closes. What we keep: the event
// name, the path, a few enum-like props (@nw/contracts webEventInput), the host of an external
// referrer, mobile or desktop, country and region, and the random per-page-load visit id. What
// we don't keep: the IP, the city, the user agent, or anything a visitor typed.

import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { webEventsInput } from "@nw/contracts";
import { analyticsEvents } from "@nw/db";

import { issuesFrom, validationFailed } from "../http.js";
import { FixedWindowLimiter, clientIp } from "../intake-chat/rate-limit.js";
import type { ApiEnv, AppDeps } from "../types.js";

/** 25 events of ~200 bytes each, with room to spare. */
const MAX_BODY_BYTES = 16 * 1024;
/** Batches per IP and window. A busy chat flushes every few seconds; a script floods. */
const BATCHES_PER_WINDOW = 120;
const WINDOW_MS = 10 * 60_000;

/** Crawlers, link previews, uptime checks and scripts: not people. */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|uptime|curl|wget|python|httpclient|axios|node-fetch|go-http/i;

export const isBot = (userAgent: string) => userAgent.trim() === "" || BOT_PATTERN.test(userAgent);

/** `mobile` or `desktop`, from Client Hints when the browser sends them, else the user agent. */
export function deviceOf(c: Context): "mobile" | "desktop" {
  const hint = c.req.header("sec-ch-ua-mobile");
  if (hint) return hint.trim() === "?1" ? "mobile" : "desktop";
  return /Mobi|Android|iPhone|iPad|iPod/i.test(c.req.header("user-agent") ?? "") ? "mobile" : "desktop";
}

/**
 * Country (`DE`) and region (`DE-BE`) from the headers Vercel adds from the client's IP.
 * Not set locally, so both are null there.
 */
export function locationOf(c: Context): { country: string | null; region: string | null } {
  const country = c.req.header("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(country)) return { country: null, region: null };
  const region = c.req.header("x-vercel-ip-country-region")?.trim().toUpperCase() ?? "";
  return { country, region: /^[A-Z0-9]{1,3}$/.test(region) ? `${country}-${region}` : null };
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** The referring site's host (without `www.`), or null for none, our own sites and non-web links. */
export function externalHost(referrer: string | undefined, ownHosts: ReadonlySet<string>): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (!host || ownHosts.has(host)) return null;
  return host.replace(/^www\./, "");
}

export function eventRoutes({ db, env }: AppDeps) {
  const limiter = new FixedWindowLimiter(BATCHES_PER_WINDOW, WINDOW_MS);
  const ownHosts = new Set(env.allowedOrigins.map(hostOf).filter((h): h is string => h !== null));

  return new Hono<ApiEnv>()
    .use(
      "*",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.json({ error: "Request body too large" }, 413),
      }),
    )
    .post("/", async (c) => {
      // Only our own pages count. Browsers always send Origin with a cross-origin POST.
      const origin = c.req.header("origin");
      if (!origin || !env.allowedOrigins.includes(origin)) return c.json({ error: "Not allowed" }, 403);
      if (isBot(c.req.header("user-agent") ?? "")) return c.body(null, 204);

      let body: unknown;
      try {
        body = JSON.parse(await c.req.text());
      } catch {
        return c.json({ error: "Send JSON" }, 400);
      }
      const parsed = webEventsInput.safeParse(body);
      if (!parsed.success) return c.json(validationFailed(issuesFrom(parsed.error)), 400);
      if (!limiter.take(clientIp(c))) return c.json({ error: "Too many events" }, 429);

      const { visit, events } = parsed.data;
      const device = deviceOf(c);
      const { country, region } = locationOf(c);
      await db.insert(analyticsEvents).values(
        events.map((event) => ({
          name: event.name,
          source: "web",
          visitId: visit,
          path: event.path,
          referrer: event.name === "page_view" ? externalHost(event.referrer, ownHosts) : null,
          device,
          country,
          region,
          props: event.props,
        })),
      );
      return c.body(null, 204);
    });
}
