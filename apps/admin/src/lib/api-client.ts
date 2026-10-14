import { hc } from "hono/client"
import type { AppType } from "@nw/api"

import { API_URL } from "./env"

/** Typed client for apps/api. Sends the `nw_session` cookie on every request. */
export const client = hc<AppType>(API_URL, { init: { credentials: "include" } })
