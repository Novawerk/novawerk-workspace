// One GET to the API from the website's servers, for the cached reads in ./board.ts. Kept apart
// from next/cache so it can be tested. Every failure is logged with its reason: a page that says
// "offline" should leave a line in the function logs saying why.

export type ApiRead<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

type Env = { apiUrl?: string; webKey?: string };

export async function readApi<T>(path: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<ApiRead<T>> {
  const fail = (reason: string): ApiRead<T> => {
    console.warn(`[web] task board read failed: GET ${path}: ${reason}`);
    return { ok: false, notFound: false };
  };
  const apiUrl = env.apiUrl?.trim();
  // In a build, this means turbo.json doesn't pass API_URL through (strict env mode).
  if (!apiUrl) return fail("API_URL is not set");
  const webKey = env.webKey?.trim();
  let res: Response;
  try {
    // The website's own key skips the API's anonymous limit (600 an hour per IP): its servers share IPs.
    res = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}${path}`, {
      headers: { accept: "application/json", ...(webKey ? { "x-nw-web-key": webKey } : {}) },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    return fail(`no answer (${error instanceof Error ? error.message : String(error)})`);
  }
  if (res.status === 404) return { ok: false, notFound: true };
  if (!res.ok) return fail(`answered ${res.status}${res.status === 429 && !webKey ? " (WEB_READ_KEY is not set)" : ""}`);
  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return fail("answered with something that isn't JSON");
  }
}
