// The only place apps/admin reads import.meta.env. Everything else imports from here.

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(/\/+$/, "")

/** The public website (profile and task links). Defaults to https://novawerk.io. */
export const WEB_URL = (import.meta.env.VITE_WEB_URL || "https://novawerk.io").replace(/\/+$/, "")

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

/**
 * Local development only: show an email sign-in that calls POST /auth/dev (the API must run
 * with DEV_LOGIN=true). `import.meta.env.DEV` is false in production builds, so this can
 * never appear on admin.novawerk.io.
 */
export const DEV_LOGIN = import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN === "true"
export const DEV_LOGIN_EMAIL = import.meta.env.VITE_DEV_LOGIN_EMAIL ?? ""

/**
 * Sample-data mode: fictional in-memory data, no sign-in. Off unless VITE_USE_SAMPLE_DATA=true;
 * handy for UI work without the API.
 */
export const USE_SAMPLE_DATA = import.meta.env.VITE_USE_SAMPLE_DATA === "true"

/** Where the agents' GitHub Actions workflows live (the Agents page links there). */
export const GITHUB_REPOSITORY = import.meta.env.VITE_GITHUB_REPOSITORY || "Novawerk/novawerk"
