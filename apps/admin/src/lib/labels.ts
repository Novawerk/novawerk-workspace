import { AVAILABILITY_OPTIONS, FUNCTION_OPTIONS, type DocumentKind } from "@nw/contracts"

import type { MemberSummary, WebsiteRefresh } from "./types"

/** "developer" → "Developer". Unknown values pass through. */
export const functionLabel = (value: string) =>
  FUNCTION_OPTIONS.find((o) => o.value === value)?.label ?? value

/** "2to5" → "2–5 hours a week". Unknown values pass through. */
export const availabilityLabel = (value: string) =>
  AVAILABILITY_OPTIONS.find((o) => o.value === value)?.label ?? value

/**
 * Who drafted an outbox email: "intake" → "Intake Agent", "admin:mara" → "Mara Lindqvist",
 * "assistant:mara" → "Assistant, for Mara Lindqvist".
 */
export function draftedByLabel(draftedBy: string, members: MemberSummary[]) {
  const [kind, id] = draftedBy.split(":", 2)
  const name = (memberId: string) => members.find((m) => m.id === memberId)?.displayName ?? memberId
  if (kind === "admin" && id) return name(id)
  if (kind === "assistant" && id) return `Assistant, for ${name(id)}`
  const agents: Record<string, string> = { intake: "Intake Agent", "sponsor-outreach": "Sponsor outreach agent" }
  return agents[draftedBy] ?? draftedBy
}

/** What to tell someone after a portfolio save, given what happened to the website. */
export function websiteNote(refresh: WebsiteRefresh): { tone: "success" | "warning"; text: string } {
  switch (refresh) {
    case "updated":
      return { tone: "success", text: "The website picks it up in a few seconds." }
    case "not-configured":
      return { tone: "success", text: "The website refresh hook isn't set up here, so the site catches up when its cache expires." }
    case "failed":
      return { tone: "warning", text: "We couldn't reach the website. It catches up when its cache expires." }
  }
}

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  contract: "Contract",
  nda: "NDA",
  invoice: "Invoice",
  receipt: "Receipt",
  image: "Image",
  other: "Other",
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" })

/** "DE" → "Germany". Unknown or malformed codes pass through. */
export function countryName(code: string) {
  try {
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** The 16 German states by ISO 3166-2 code. */
const GERMAN_STATES: Record<string, string> = {
  "DE-BW": "Baden-Württemberg",
  "DE-BY": "Bavaria",
  "DE-BE": "Berlin",
  "DE-BB": "Brandenburg",
  "DE-HB": "Bremen",
  "DE-HH": "Hamburg",
  "DE-HE": "Hesse",
  "DE-MV": "Mecklenburg-Vorpommern",
  "DE-NI": "Lower Saxony",
  "DE-NW": "North Rhine-Westphalia",
  "DE-RP": "Rhineland-Palatinate",
  "DE-SL": "Saarland",
  "DE-SN": "Saxony",
  "DE-ST": "Saxony-Anhalt",
  "DE-SH": "Schleswig-Holstein",
  "DE-TH": "Thuringia",
}

/** "DE-BE" → "Berlin"; other regions keep their code: "NL-NH" → "NL-NH · Netherlands". */
export function regionLabel(code: string) {
  const upper = code.toUpperCase()
  const state = GERMAN_STATES[upper]
  if (state) return state
  const country = upper.split("-")[0]
  return country ? `${code} · ${countryName(country)}` : code
}
