import type { ClientResponse, parseResponse } from "hono/client"

import type { ApiError as ApiErrorBody } from "@nw/contracts"

/** Thrown for any non-2xx answer from apps/api. Body follows `ApiError` in @nw/contracts. */
export class ApiError extends Error {
  readonly status: number
  readonly issues?: Record<string, string[]>

  constructor(status: number, body: Partial<ApiErrorBody> | null) {
    super(body?.error ?? `Request failed (${status})`)
    this.name = "ApiError"
    this.status = status
    this.issues = body?.issues
  }
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401

/** The 2xx JSON body of a typed Hono client call. */
type SuccessBody<R extends ClientResponse<unknown>> = Awaited<ReturnType<typeof parseResponse<R>>>

/**
 * Await a typed client call (`client.admin.me.$get()`), return its 2xx body, throw ApiError
 * otherwise. Network failures surface as the TypeError from fetch.
 */
export async function call<R extends ClientResponse<unknown>>(request: Promise<R>): Promise<SuccessBody<R>> {
  const response = await request
  if (!response.ok) {
    let body: Partial<ApiErrorBody> | null = null
    try {
      body = (await response.json()) as Partial<ApiErrorBody>
    } catch {
      // Not JSON. Keep the status code.
    }
    throw new ApiError(response.status, body)
  }
  return (await response.json()) as SuccessBody<R>
}

/** Like `call`, for routes that answer with plain text (CSV). */
export async function callText(request: Promise<Response>): Promise<string> {
  const response = await request
  if (!response.ok) {
    let body: Partial<ApiErrorBody> | null = null
    try {
      body = (await response.json()) as Partial<ApiErrorBody>
    } catch {
      // Not JSON. Keep the status code.
    }
    throw new ApiError(response.status, body)
  }
  return response.text()
}
