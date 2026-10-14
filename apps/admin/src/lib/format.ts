const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** "3 Oct 2026, 09:12" */
export function formatDateTime(iso: string) {
  return dateTime.format(new Date(iso))
}

/** "3 hours ago", "yesterday", "5 days ago". Falls back to a date after four weeks. */
export function formatRelative(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return "just now"
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute")
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour")
  if (abs < 28 * 86_400) return relative.format(Math.round(seconds / 86_400), "day")
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  )
}

/** Split a free-text links field into URLs (by whitespace, commas or new lines). */
export function splitLinks(links: string | null | undefined) {
  return (links ?? "")
    .split(/[\s,]+/)
    .map((l) => l.trim())
    .filter(Boolean)
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" })

/** 123456 → "€1,234.56". Display only; amounts stay integer cents everywhere else. */
export function formatCents(cents: number) {
  return euro.format(cents / 100)
}

const calendarDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/** "2026-10-03" (a date column) → "3 Oct 2026". No time zone shifts. */
export function formatDate(isoDate: string) {
  return calendarDate.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}

/** Today as YYYY-MM-DD in the browser's time zone (for date inputs). */
export function todayIso() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/** First name for a greeting: "Ada Lovelace" → "Ada". */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

const count = new Intl.NumberFormat("en-GB")
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 })

/** 1284 → "1,284". */
export function formatCount(n: number) {
  return count.format(n)
}

/** 912000 → "912K", 1250000 → "1.3M". For token counts. */
export function formatCompact(n: number) {
  return compact.format(n)
}

/** part ÷ whole, or null when there is nothing to divide by. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** 0.618 → "62%", 0.004 → "<1%", null → "—". */
export function formatPercent(share: number | null) {
  if (share === null || !Number.isFinite(share)) return "—"
  if (share > 0 && share < 0.005) return "<1%"
  return `${Math.round(share * 100)}%`
}

/** 4210 → "4.2 s", null → "—". */
export function formatSeconds(ms: number | null) {
  if (ms === null) return "—"
  return `${(ms / 1000).toFixed(1)} s`
}

/** How long something has waited: "under an hour", "5 hours", "4 days". */
export function formatAge(iso: string, now = Date.now()) {
  const hours = Math.floor((now - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return "under an hour"
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`
  return `${Math.floor(hours / 24)} days`
}

const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** "2026-10-03" → "3 Oct" (an axis label). */
export function formatShortDate(isoDate: string) {
  return shortDay.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}

/** "2026-10-03" → "Sat 3 Oct" (a tooltip). */
export function formatDayLabel(isoDate: string) {
  return longDay.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}
