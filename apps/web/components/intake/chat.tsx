"use client";

import { RESUME_ATTACHED_TEXT, type IntakeDisplayMessage, type IntakeMode } from "@nw/contracts";
import { memo, useCallback, useLayoutEffect, useRef, useState, type UIEvent } from "react";

import type { IntakeController } from "@/lib/intake/use-intake";
import type { AssistantMessage, ToolPart } from "@/lib/intake/reducer";

import { NovaStar } from "@/components/nova-star";

import { Composer } from "./composer";
import { Markdown } from "./markdown";

const INTRO: Record<IntakeMode, string> = {
  pitch:
    "Hi! Tell us about the project you want to start: what it is, and who it's for. Plain words are fine.\n\nWe'll ask a few questions and fill in your draft as we go. You check it and send it when it's ready.",
  join: "Hi! Tell us a little about yourself: what you do, and what you'd like to build or learn at Novawerk.\n\nWe'll ask a few questions and fill in your intro as we go. You check it and send it when it's ready.",
};

const PLACEHOLDER: Record<IntakeMode, string> = {
  pitch: "Describe your idea…",
  join: "Tell us about you…",
};

/** One-tap openers for people who don't know where to start. Sent as the first message. */
const SUGGESTIONS: Record<IntakeMode, string[]> = {
  pitch: [
    "I have an idea for an app, but it's still rough",
    "I want to fix a problem in my neighbourhood",
    "I'm not sure it's a project yet. Help me think it through",
  ],
  join: [
    "I'm a developer and want to build something useful",
    "I design things and want a real project to work on",
    "I'd like to help, but I don't know where yet",
  ],
};

// ─── Auto-scroll ─────────────────────────────────────────────────────────────

const STICK_THRESHOLD = 80;

/** Follow new content while the reader is at the bottom; leave them alone once they scroll up. */
function useStickToBottom(content: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    stick.current = bottom;
    setAtBottom(bottom);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [content]);

  // The pane changed size (phone keyboard, or the Chat tab shown again): stay at the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const jump = useCallback(() => {
    stick.current = true;
    setAtBottom(true);
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  return { ref, onScroll, atBottom, jump, follow: () => void (stick.current = true) };
}

// ─── Messages ────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  update_draft: { running: "Updating your draft", done: "Updated your draft" },
  review_draft: { running: "Checking what's missing", done: "Checked what's missing" },
  check_draft: { running: "Checking what's missing", done: "Checked what's missing" },
};

function toolLabel(part: ToolPart): string {
  const known =
    TOOL_LABELS[part.name] ??
    (/draft|update|save/i.test(part.name)
      ? TOOL_LABELS.update_draft
      : /review|check|missing|complete/i.test(part.name)
        ? TOOL_LABELS.review_draft
        : { running: "Working on it", done: "Done" });
  if (part.status === "error") return `${known.running} didn't work`;
  return part.status === "running" ? `${known.running}…` : known.done;
}

function ToolChip({ part }: { part: ToolPart }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        part.status === "error" ? "text-danger" : part.status === "done" ? "text-accent" : "text-muted"
      }`}
    >
      {part.status === "running" ? (
        <span aria-hidden="true" className="size-2.5 animate-spin rounded-full border border-current border-t-transparent" />
      ) : part.status === "done" ? (
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
          <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
        </svg>
      ) : (
        <span aria-hidden="true">!</span>
      )}
      {toolLabel(part)}
    </span>
  );
}

/** Three dots while the agent is thinking. Still (no bounce) for reduced motion. */
function Typing() {
  return (
    <span role="status" aria-label="Thinking" className="inline-flex h-7 items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 rounded-full bg-muted motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}

/** An assistant turn: the star on the left, text and status lines on the right. */
function AssistantText({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <NovaStar className="mt-1 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-[15px] leading-7 text-ink">{children}</div>
    </div>
  );
}

const Message = memo(function Message({
  message,
  streaming,
  stopped,
}: {
  message: IntakeDisplayMessage;
  streaming: boolean;
  stopped: boolean;
}) {
  if (message.role === "user") {
    const attachment = message.text === RESUME_ATTACHED_TEXT;
    return (
      <div className="flex justify-end pl-10">
        <p
          className={`max-w-[85%] bg-ink px-4 py-2.5 text-[15px] leading-7 break-words whitespace-pre-wrap text-paper ${
            attachment ? "inline-flex items-center gap-2" : ""
          }`}
        >
          <span className="sr-only">You: </span>
          {attachment ? (
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
              <path d="M4 1.75h5.25L12.5 5v9.25h-8.5z M9 1.75V5.25h3.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          ) : null}
          {message.text}
        </p>
      </div>
    );
  }
  return <AssistantBubble message={message} streaming={streaming} stopped={stopped} />;
});

function AssistantBubble({ message, streaming, stopped }: { message: AssistantMessage; streaming: boolean; stopped: boolean }) {
  const { parts } = message;
  const last = parts[parts.length - 1];
  // An empty reply that isn't streaming (failed turn) is explained by the error banner instead.
  if (!streaming && parts.length === 0 && !stopped) return null;

  // Text parts render as Markdown; runs of tool calls become one row of chips.
  const blocks: ({ kind: "text"; text: string; key: string } | { kind: "tools"; tools: ToolPart[]; key: string })[] = [];
  parts.forEach((part, i) => {
    const prev = blocks[blocks.length - 1];
    if (part.type === "text") blocks.push({ kind: "text", text: part.text, key: `t${i}` });
    else if (prev?.kind === "tools") prev.tools.push(part);
    else blocks.push({ kind: "tools", tools: [part], key: `c${i}` });
  });

  return (
    <AssistantText>
      <div className="space-y-3">
        {blocks.map((block) =>
          block.kind === "text" ? (
            <Markdown key={block.key} text={block.text} />
          ) : (
            <div key={block.key} className="flex flex-wrap gap-2">
              {block.tools.map((part) => (
                <ToolChip key={part.id} part={part} />
              ))}
            </div>
          ),
        )}
        {streaming && last?.type !== "text" ? <Typing /> : null}
        {stopped ? <p className="text-xs text-muted">Stopped.</p> : null}
      </div>
    </AssistantText>
  );
}

const textOf = (message: AssistantMessage) =>
  message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

// ─── Pane ────────────────────────────────────────────────────────────────────

export function ChatPane({ intake, mode }: { intake: IntakeController; mode: IntakeMode }) {
  const { state, streaming } = intake;
  const { ref: scrollRef, onScroll, atBottom, jump, follow } = useStickToBottom(state.messages);
  const submitted = state.status === "submitted";
  const name = intake.draft[intake.draft.mode].name?.trim().split(/\s+/)[0];

  // Screen readers hear each finished reply once, not every streamed word.
  const lastDone = [...state.messages]
    .reverse()
    .find((m): m is AssistantMessage => m.role === "assistant" && m.id !== state.streamingId);

  const outOfTurns = state.turnsLeft === 0;
  const showSuggestions =
    state.phase === "ready" && !submitted && !streaming && !state.messages.some((m) => m.role === "user");
  const disabledReason = submitted
    ? "Your draft is sent."
    : outOfTurns
      ? "This chat has reached its limit. Check your draft and send it."
      : undefined;

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto overscroll-contain"
          aria-busy={streaming || state.phase === "starting"}
        >
          <div className="mx-auto w-full max-w-2xl space-y-7 px-4 py-8 sm:px-8">
            {state.phase === "starting" ? (
              <AssistantText>
                <Typing />
              </AssistantText>
            ) : state.phase === "error" ? (
              <div role="alert" className="border border-danger px-4 py-3 text-sm text-danger">
                <p>{state.loadError}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  <button type="button" onClick={intake.reload} className="font-medium underline underline-offset-4">
                    Try again
                  </button>
                </div>
              </div>
            ) : (
              <>
                {state.messages.length === 0 ? (
                  <AssistantText>
                    <Markdown text={INTRO[mode]} />
                  </AssistantText>
                ) : null}
                {state.messages.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    streaming={message.id === state.streamingId}
                    stopped={Boolean(state.stopped[message.id])}
                  />
                ))}
                {showSuggestions ? (
                  <div className="flex flex-col items-start gap-2 pl-8">
                    {SUGGESTIONS[mode].map((text) => (
                      <button
                        key={text}
                        type="button"
                        onClick={() => {
                          follow();
                          void intake.send(text, { suggestion: true });
                        }}
                        className="border border-line-strong bg-paper px-3.5 py-2 text-left text-sm transition-colors hover:border-ink hover:bg-subtle"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                ) : null}
                {submitted ? (
                  <AssistantText>
                    <p>
                      Thanks{name ? `, ${name}` : ""}. Your {intake.draft.mode === "pitch" ? "pitch" : "intro"} is
                      with the team now. We usually reply within a few days.
                    </p>
                  </AssistantText>
                ) : null}
              </>
            )}
          </div>
        </div>

        {!atBottom ? (
          <button
            type="button"
            onClick={jump}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 border border-line-strong bg-paper px-3 py-1.5 text-xs text-ink shadow-sm hover:border-ink"
          >
            Jump to latest
          </button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {lastDone ? textOf(lastDone) : ""}
      </p>

      {state.failed ? (
        <div role="alert" className="shrink-0 border-t border-danger bg-paper px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-danger">
            <p>{state.failed.message}</p>
            {state.failed.gone ? (
              <button type="button" onClick={intake.startOver} className="font-medium underline underline-offset-4">
                Start over
              </button>
            ) : (
              <button type="button" onClick={intake.retry} className="font-medium underline underline-offset-4">
                Try again
              </button>
            )}
          </div>
        </div>
      ) : null}

      {state.turnsLeft !== null && state.turnsLeft > 0 && state.turnsLeft <= 3 && !submitted ? (
        <p className="shrink-0 border-t border-line px-4 py-2 text-center text-xs text-muted sm:px-6">
          {state.turnsLeft === 1 ? "One message left in this chat." : `${state.turnsLeft} messages left in this chat.`}
        </p>
      ) : null}

      <Composer
        streaming={streaming}
        disabled={state.phase !== "ready" || submitted || outOfTurns}
        disabledReason={disabledReason}
        placeholder={PLACEHOLDER[mode]}
        onSend={(text) => {
          follow();
          return intake.send(text);
        }}
        onStop={intake.stop}
        onAttach={(resume) => {
          follow();
          void intake.attachResume(resume);
        }}
      />
    </>
  );
}
