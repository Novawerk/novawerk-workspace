"use client";

import { intakeDraftIssues, type IntakeMode } from "@nw/contracts";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { useModalClose } from "@/components/modal";
import { NovaStar } from "@/components/nova-star";
import { flush, track } from "@/lib/analytics";
import { fieldsFor } from "@/lib/intake/fields";
import { turnsOf, useIntake } from "@/lib/intake/use-intake";

import { ChatPane } from "./chat";
import { DraftPanel } from "./draft-panel";

// The Intake Agent card: chat on the left, the live draft on the right (tabs on phones).
// It fills its parent: the route dialog. If the API answers 503 (agent unavailable), the plain
// step-by-step form takes its place.

type Tab = "chat" | "draft";

export function IntakeAgent({
  mode,
  title,
  subtitle,
  plainForm,
}: {
  mode: IntakeMode;
  title: string;
  subtitle: string;
  /** The plain step-by-step form, shown when the agent is unavailable. */
  plainForm: React.ReactNode;
}) {
  const intake = useIntake(mode);
  const { state, draft } = intake;
  const close = useModalClose();
  const [tab, setTab] = useState<Tab>("chat");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ chat: null, draft: null });

  const showForm = state.phase === "unavailable";

  const required = fieldsFor(draft.mode).filter((f) => !f.optional).length;
  const missing = Object.keys(intakeDraftIssues(draft)).length;
  const submitted = state.status === "submitted";
  const filled = Math.max(0, required - missing);
  const draftTabNote = submitted ? "sent" : `${filled}/${required}`;

  // ─── Usage counts (lib/analytics.ts): numbers only, never the draft's content ───

  const turns = turnsOf(state);
  const ready = state.phase === "ready";

  // The draft has every required field, once per chat.
  const readySessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || missing > 0 || !state.sessionId || readySessionRef.current === state.sessionId) return;
    readySessionRef.current = state.sessionId;
    track("intake_draft_ready", { mode: draft.mode, turns });
  }, [ready, missing, state.sessionId, draft.mode, turns]);

  // How far the visitor got when they leave: the dialog closes, the route hides, or the tab goes.
  const progressRef = useRef({ mode: draft.mode, turns, filled, required, submitted, ready });
  useLayoutEffect(() => {
    progressRef.current = { mode: draft.mode, turns, filled, required, submitted, ready };
  });
  useEffect(() => {
    let left = false;
    const leave = () => {
      const { ready: open, ...props } = progressRef.current;
      if (left || !open) return;
      left = true;
      track("intake_close", props);
    };
    const onPageHide = () => {
      leave();
      flush();
    };
    const onPageShow = () => {
      left = false;
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      leave();
    };
  }, []);

  const chooseTab = (next: Tab) => {
    if (next !== tab) track("intake_tab", { mode: draft.mode, tab: next });
    setTab(next);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Tab = tab === "chat" ? "draft" : "chat";
    chooseTab(next);
    tabRefs.current[next]?.focus();
  };

  const tabButton = (id: Tab, label: React.ReactNode) => (
    <button
      ref={(node) => {
        tabRefs.current[id] = node;
      }}
      type="button"
      role="tab"
      id={`intake-tab-${id}`}
      aria-selected={tab === id}
      aria-controls={`intake-panel-${id}`}
      tabIndex={tab === id ? 0 : -1}
      onClick={() => chooseTab(id)}
      onKeyDown={onTabKey}
      className="h-11 border-b-2 border-transparent text-sm text-muted transition-colors aria-selected:border-ink aria-selected:font-medium aria-selected:text-ink"
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <NovaStar className="size-7 shrink-0 animate-[spin_14s_linear_infinite] motion-reduce:animate-none" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
          <p className="hidden truncate text-sm text-muted sm:block">{subtitle}</p>
        </div>
        {close ? (
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-2 ml-1 inline-flex size-10 shrink-0 items-center justify-center text-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </button>
        ) : null}
      </header>

      {showForm ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
            <p role="status" className="mb-8 border border-line-strong bg-subtle p-4 text-sm">
              Our assistant is taking a break. Here&apos;s the plain form. It reaches the same people.
            </p>
            {plainForm}
          </div>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Chat or draft" className="grid shrink-0 grid-cols-2 border-b border-line lg:hidden">
            {tabButton("chat", "Chat")}
            {tabButton(
              "draft",
              <>
                Your draft <span className="font-normal text-muted">· {draftTabNote}</span>
              </>,
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
            <section
              id="intake-panel-chat"
              role="tabpanel"
              aria-labelledby="intake-tab-chat"
              aria-label="Chat"
              className={`${tab === "chat" ? "flex" : "hidden"} relative min-h-0 flex-1 flex-col lg:flex`}
            >
              <ChatPane intake={intake} mode={mode} />
            </section>

            <section
              id="intake-panel-draft"
              role="tabpanel"
              aria-labelledby="intake-tab-draft"
              aria-label="Your draft"
              className={`${tab === "draft" ? "flex" : "hidden"} relative min-h-0 flex-1 flex-col bg-subtle lg:flex lg:border-l lg:border-line`}
            >
              <DraftPanel key={state.sessionId ?? "starting"} intake={intake} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
