"use client";

import {
  TOKEN_EXPIRY_DAYS,
  TOKEN_LIMITS,
  TOKEN_SCOPES,
  tokenCreateInput,
  type ContributorTokenInfo,
  type CreatedToken,
  type TokenScope,
} from "@nw/contracts";
import { useEffect, useId, useState } from "react";

import { EmptyState, Note } from "@/components/board/bits";
import { Pills } from "@/components/board/dialog";
import { formatDate } from "@/components/board/labels";
import { Check, SignInPanel } from "@/components/board/sign-in";
import { buttonInk, buttonSmallDanger, buttonSmallOutline, field, fieldLabel } from "@/components/ui";
import { api, apiBase } from "@/lib/contrib-api";
import { useSession, useToast } from "@/lib/session";

/** The API this site talks to (NEXT_PUBLIC_API_URL), so local and production show their own address. */
const API_URL = apiBase() ?? "https://api.novawerk.io";
const MCP_URL = `${API_URL}/mcp`;

const SCOPE_TEXT: Record<TokenScope, { what: string; note?: string }> = {
  "tasks:read": { what: "Read your tasks and guides", note: "Always on. Public reads need no token at all." },
  "proposals:write": { what: "Draft proposals", note: "You confirm each one here before it counts." },
  "discussion:write": { what: "Post and reply in task threads", note: "Posts show “via agent”." },
  "tasks:work": { what: "Link pull requests and release your own tasks" },
  "suggestions:write": { what: "Suggest tasks and +1 suggestions" },
  "profile:write": { what: "Edit your profile text" },
};

const TOOLS: [string, string][] = [
  ["list_tasks, get_task, list_contributors", "no token"],
  ["whoami, my_tasks, get_guide", "tasks:read"],
  ["propose", "proposals:write"],
  ["post_comment", "discussion:write"],
  ["suggest_task, upvote_task, remove_upvote", "suggestions:write"],
  ["link_pr, release_task", "tasks:work"],
  ["update_profile", "profile:write"],
];

const fetchTokens = () => api<ContributorTokenInfo[]>("/contrib/tokens");

const card = "grid gap-4 border border-line bg-paper p-5 sm:p-6";

/** Personal access tokens for coding agents, and how to connect one. Browser only: a token can't manage tokens. */
export function TokenSettings() {
  const { session } = useSession();
  return (
    <>
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Tokens &amp; agents</h2>
        <p className="max-w-[62ch] text-muted">
          Give your coding agent a token and it works on the board as you. Everything it does shows your handle, marked &ldquo;via agent&rdquo;. Tokens
          can&apos;t change your account or make more tokens.
        </p>
      </section>
      {session.status === "loading" ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : session.status !== "signed-in" ? (
        <div className="max-w-[460px] border border-line bg-paper p-6">
          <SignInPanel returnTo="/settings/tokens" heading={false} />
        </div>
      ) : (
        <Tokens />
      )}
      <Connect />
    </>
  );
}

function Tokens() {
  const toast = useToast();
  const [tokens, setTokens] = useState<ContributorTokenInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const apply = (res: Awaited<ReturnType<typeof fetchTokens>>) => {
    if (res.ok) setTokens(res.data);
    else setFailed(true);
  };
  const load = async () => apply(await fetchTokens());
  useEffect(() => {
    let cancelled = false;
    void fetchTokens().then((res) => {
      if (cancelled) return;
      if (res.ok) setTokens(res.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const revoke = async (id: string) => {
    const res = await api(`/contrib/tokens/${id}`, { method: "DELETE" });
    setRevoking(null);
    if (!res.ok) return toast(res.error);
    toast("Token revoked. Agents using it stop now.");
    if (created?.id === id) setCreated(null);
    await load();
  };

  return (
    <>
      <section aria-labelledby="your-tokens" className={card}>
        <h3 id="your-tokens" className="text-lg font-semibold tracking-tight">
          Your tokens
        </h3>
        {failed ? (
          <p className="text-sm text-danger">We couldn&apos;t load your tokens. Please reload the page.</p>
        ) : tokens === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : tokens.length === 0 ? (
          <EmptyState title="No tokens yet">Make one below and give it to your agent.</EmptyState>
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left font-mono text-xs text-muted">
                  <th className="border-b border-line px-3.5 py-2.5 font-medium">Name</th>
                  <th className="border-b border-line px-3.5 py-2.5 font-medium">Scopes</th>
                  <th className="border-b border-line px-3.5 py-2.5 font-medium">Last used</th>
                  <th className="border-b border-line px-3.5 py-2.5 font-medium">Expires</th>
                  <th className="border-b border-line px-3.5 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="border-b border-line px-3.5 py-2.5">
                      {t.name}
                      <br />
                      <span className="font-mono text-xs text-muted">{t.prefix}…</span>
                    </td>
                    <td className="border-b border-line px-3.5 py-2.5 text-[13px]">
                      {t.scopes
                        .filter((s) => s !== "tasks:read")
                        .map((s) => s.split(":")[0])
                        .join(", ") || "read only"}
                    </td>
                    <td className="border-b border-line px-3.5 py-2.5 text-[13px] whitespace-nowrap">{t.lastUsedAt ? formatDate(t.lastUsedAt) : "Never"}</td>
                    <td className="border-b border-line px-3.5 py-2.5 text-[13px] whitespace-nowrap">
                      {t.expired ? <span className="text-danger">Expired {formatDate(t.expiresAt)}</span> : formatDate(t.expiresAt)}
                    </td>
                    <td className="border-b border-line px-3.5 py-2.5 text-right whitespace-nowrap">
                      {revoking === t.id ? (
                        <span className="inline-flex gap-1.5">
                          <button type="button" className={buttonSmallDanger} onClick={() => void revoke(t.id)}>
                            Revoke {t.name}
                          </button>
                          <button type="button" className={buttonSmallOutline} onClick={() => setRevoking(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button type="button" className={buttonSmallDanger} onClick={() => setRevoking(t.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="new-token" className={card}>
        <h3 id="new-token" className="text-lg font-semibold tracking-tight">
          New token
        </h3>
        {created ? (
          <CreatedSecret token={created} onDone={() => setCreated(null)} />
        ) : (
          <NewToken
            full={(tokens?.filter((t) => !t.expired).length ?? 0) >= TOKEN_LIMITS.activePerContributor}
            onCreated={async (t) => {
              setCreated(t);
              await load();
            }}
          />
        )}
      </section>
    </>
  );
}

function NewToken({ full, onCreated }: { full: boolean; onCreated: (t: CreatedToken) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<"30" | "90">("90");
  const [scopes, setScopes] = useState<TokenScope[]>(["proposals:write", "discussion:write", "tasks:work"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = tokenCreateInput.safeParse({ name, scopes, expiresInDays: Number(days) });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    setError(null);
    const res = await api<CreatedToken>("/contrib/tokens", { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) return setError(res.issues.name?.[0] ?? res.error);
    setName("");
    await onCreated(res.data);
  };

  if (full) {
    return <p className="text-sm text-muted">You have {TOKEN_LIMITS.activePerContributor} live tokens, the most there can be. Revoke one to make another.</p>;
  }

  return (
    <form onSubmit={create} noValidate className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1.5">
          <label htmlFor={nameId} className={fieldLabel}>
            Name <span className="text-[13px] font-normal text-muted">where it lives, e.g. claude-laptop</span>
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className={`${field} h-10`}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${nameId}-public`}
          />
          <p id={`${nameId}-public`} className="text-[13px] text-muted">
            Shown publicly next to what your agent posts. Don&apos;t put anything private in it.
          </p>
        </div>
        <Pills
          name="expires"
          legend="Expires in"
          options={TOKEN_EXPIRY_DAYS.map((d) => ({ value: String(d) as "30" | "90", label: `${d} days` }))}
          value={days}
          onChange={setDays}
        />
      </div>
      <fieldset className="grid gap-2.5">
        <legend className={`${fieldLabel} mb-1.5`}>Scopes</legend>
        {TOKEN_SCOPES.map((s) => (
          <Check
            key={s}
            checked={s === "tasks:read" || scopes.includes(s)}
            disabled={s === "tasks:read"}
            onChange={(on) => setScopes((x) => (on ? [...x, s] : x.filter((y) => y !== s)))}
          >
            <span className="font-mono text-[13px]">{s}</span> · {SCOPE_TEXT[s].what}
            {SCOPE_TEXT[s].note ? <span className="block text-[13px] text-muted">{SCOPE_TEXT[s].note}</span> : null}
          </Check>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={busy} className={buttonInk}>
          {busy ? "Creating…" : "Create token"}
        </button>
      </div>
    </form>
  );
}

function CreatedSecret({ token, onDone }: { token: CreatedToken; onDone: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token.secret);
      toast("Token copied.");
    } catch {
      toast("Couldn't copy. Select the token and copy it instead.");
    }
  };
  return (
    <Note tone="ok" className="grid gap-2.5">
      <b>Copy this token now. We show it once.</b>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-[1_1_220px] overflow-x-auto border border-line bg-paper px-2.5 py-2 font-mono text-[13px] whitespace-nowrap">{token.secret}</code>
        <button type="button" className={buttonSmallOutline} onClick={copy}>
          Copy
        </button>
      </div>
      <p className="text-[13px] text-muted">
        {token.name} · expires {formatDate(token.expiresAt)}. Lost it? Revoke it and make a new one.
      </p>
      <div>
        <button type="button" className={buttonSmallOutline} onClick={onDone}>
          I copied it
        </button>
      </div>
    </Note>
  );
}

function Connect() {
  return (
    <section aria-labelledby="connect" className={card}>
      <h3 id="connect" className="text-lg font-semibold tracking-tight">
        Connect your agent
      </h3>
      <p className="text-[13px] text-muted">MCP server, for Claude Code, Cursor and other MCP clients:</p>
      <Code>{`{
  "mcpServers": {
    "novawerk": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer \${NOVAWERK_TOKEN}" }
    }
  }
}`}</Code>
      <p className="text-[13px] text-muted">Or one line in the terminal:</p>
      <Code>{`claude mcp add --transport http novawerk ${MCP_URL} \\
  --header "Authorization: Bearer $NOVAWERK_TOKEN"`}</Code>
      <p className="text-[13px] text-muted">Plain HTTP works too:</p>
      <Code>{`curl -H "Authorization: Bearer $NOVAWERK_TOKEN" \\
  ${API_URL}/contrib/me`}</Code>
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left font-mono text-xs text-muted">
              <th className="border-b border-line px-3.5 py-2.5 font-medium">MCP tools</th>
              <th className="border-b border-line px-3.5 py-2.5 font-medium">Needs</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map(([tools, scope]) => (
              <tr key={tools}>
                <td className="border-b border-line px-3.5 py-2.5 font-mono text-[13px]">{tools}</td>
                <td className="border-b border-line px-3.5 py-2.5 font-mono text-[13px] whitespace-nowrap">{scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-muted">
        Limits stay the same with a token: 5 proposals and 30 posts a day per account. A proposal your agent makes is a draft until you confirm it on
        the task&apos;s page.
      </p>
    </section>
  );
}

function Code({ children }: { children: string }) {
  const toast = useToast();
  return (
    <div className="relative">
      <pre className="overflow-x-auto border border-line bg-subtle px-3 py-2.5 pr-16 font-mono text-[12.5px] leading-relaxed">{children}</pre>
      <button
        type="button"
        className={`${buttonSmallOutline} absolute top-2 right-2 h-7 px-2`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(children);
            toast("Copied.");
          } catch {
            toast("Couldn't copy.");
          }
        }}
      >
        Copy
      </button>
    </div>
  );
}
