/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of apps/api, e.g. https://api.novawerk.io. Defaults to http://localhost:8787. */
  readonly VITE_API_URL?: string
  /** Google OAuth (Web) client id for Google Identity Services. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** "true" renders built-in sample data; anything else talks to the API. */
  readonly VITE_USE_SAMPLE_DATA?: string
  /** owner/repo of the agents' workflows, e.g. Novawerk/novawerk. */
  readonly VITE_GITHUB_REPOSITORY?: string
  /** "true" shows a local-dev email sign-in on /login (dev server only). */
  readonly VITE_DEV_LOGIN?: string
  /** Prefills the dev sign-in email. */
  readonly VITE_DEV_LOGIN_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
