"use client";

import type { PublicTask } from "@nw/contracts";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { track } from "@/lib/analytics";
import { api } from "@/lib/contrib-api";
import { usePassiveSession, useSession, useToast } from "@/lib/session";

import { plural } from "./labels";

type Votes = {
  /** Task ids I +1'd; null until known (or signed out). */
  voted: Set<string> | null;
  /** Count changes made on this page, so a row updates without a reload. */
  delta: Record<string, number>;
  toggle: (taskId: string) => Promise<void>;
};

const VotesContext = createContext<Votes>({ voted: null, delta: {}, toggle: async () => {} });

/** My +1s (GET /contrib/me/votes), shared by every suggestion row on the page. */
export function VotesProvider({ children }: { children: React.ReactNode }) {
  const { session } = usePassiveSession();
  const toast = useToast();
  const [voted, setVoted] = useState<Set<string> | null>(null);
  const [delta, setDelta] = useState<Record<string, number>>({});
  const id = session.status === "signed-in" ? session.me.id : null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void api<{ taskIds: string[] }>("/contrib/me/votes").then((res) => {
      if (!cancelled && res.ok) setVoted(new Set(res.data.taskIds));
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggle = useCallback(
    async (taskId: string) => {
      if (!voted) return;
      const on = !voted.has(taskId);
      const res = await api(`/contrib/tasks/${taskId}/vote`, { method: on ? "PUT" : "DELETE" });
      if (!res.ok) return toast(res.error);
      track("vote", { on });
      setVoted((v) => {
        const next = new Set(v);
        if (on) next.add(taskId);
        else next.delete(taskId);
        return next;
      });
      setDelta((d) => ({ ...d, [taskId]: (d[taskId] ?? 0) + (on ? 1 : -1) }));
    },
    [voted, toast],
  );

  return <VotesContext.Provider value={{ voted: id ? voted : null, delta, toggle }}>{children}</VotesContext.Provider>;
}

/**
 * The +1 on a suggestion row. Signed in: a toggle (not on your own suggestion). Otherwise the
 * count, read-only; signing in and voting work on the task page too.
 */
export function RowVote({ task }: { task: PublicTask }) {
  const { session } = useSession();
  const { voted, delta, toggle } = useContext(VotesContext);
  const [busy, setBusy] = useState(false);
  const count = task.voteCount + (delta[task.id] ?? 0);
  const me = session.status === "signed-in" ? session.me : null;
  const own = !!me && task.suggestedBy?.kind === "contributor" && task.suggestedBy.handle === me.handle;
  const on = voted?.has(task.id) ?? false;
  const pill = "relative z-10 inline-flex h-6 items-center gap-1.5 rounded-full border border-field bg-paper px-2.5 text-xs font-medium";

  if (!me || voted === null || task.status !== "suggested") {
    return (
      <span className={pill} title={`${plural(count, "+1")} so far`}>
        +1 <b className="font-mono font-medium tabular-nums">{count}</b>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={own || busy}
      title={own ? "You can't vote on your own suggestion." : undefined}
      aria-label={`${on ? "Remove your +1" : "+1 this suggestion"}, ${plural(count, "vote")}`}
      onClick={async () => {
        setBusy(true);
        await toggle(task.id);
        setBusy(false);
      }}
      className={`${pill} aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper disabled:cursor-default disabled:opacity-60`}
    >
      +1 <b className="font-mono font-medium tabular-nums">{count}</b>
    </button>
  );
}
