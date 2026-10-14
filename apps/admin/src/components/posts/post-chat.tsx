import * as React from "react"
import { CheckIcon, ChevronDownIcon, CornerDownLeftIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react"

import type { AdminChatPart } from "@nw/contracts"
import { Conversation, ConversationContent, ConversationScrollButton } from "@nw/ui/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@nw/ui/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@nw/ui/ai-elements/prompt-input"
import { Shimmer } from "@nw/ui/ai-elements/shimmer"
import { Button } from "@nw/ui/core/components/ui/button"
import { cn } from "@nw/ui/lib/utils"

import { usePostChat } from "@/lib/post-chat"
import type { Post } from "@/lib/types"

// The post writer: a chat next to the post instead of a brief to fill in. The member says what
// the post should tell; the writer asks for what's missing, keeps the brief, and has the promo
// agent rewrite the draft, which shows up on the left and in the preview.

const STEPS: Record<string, { running: string; done: string }> = {
  read_post: { running: "Reading the post…", done: "read the post" },
  save_brief: { running: "Noting it down…", done: "noted it in the brief" },
  rewrite_post: { running: "Rewriting the post (about half a minute)…", done: "rewrote the post" },
}

type ToolPart = Extract<AdminChatPart, { type: "tool" }>

/** A run of tool calls as one quiet line: "Read the post · noted it in the brief", or what's running now. */
function Steps({ parts }: { parts: ToolPart[] }) {
  const running = parts.find((p) => p.status === "running")
  if (running) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircleIcon className="size-3.5 animate-spin" />
        <Shimmer>{STEPS[running.name]?.running ?? running.name}</Shimmer>
      </p>
    )
  }
  // Reading is routine; it only shows when it's all that happened.
  const shown = parts.length > 1 ? parts.filter((p) => p.name !== "read_post" || p.status === "error") : parts
  const failed = shown.some((p) => p.status === "error")
  const text = [...new Set(shown.map((p) => `${STEPS[p.name]?.done ?? p.name}${p.status === "error" ? " (failed)" : ""}`))].join(" · ")
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
      {failed ? <TriangleAlertIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
      <span className="first-letter:uppercase">{text}</span>
    </p>
  )
}

/** Text parts as they are; consecutive tool parts grouped into one line of steps. */
function groupParts(parts: AdminChatPart[]) {
  const out: ({ kind: "text"; text: string; key: string } | { kind: "steps"; parts: ToolPart[]; key: string })[] = []
  parts.forEach((part, i) => {
    if (part.type === "tool") {
      const last = out.at(-1)
      if (last?.kind === "steps") last.parts.push(part)
      else out.push({ kind: "steps", parts: [part], key: part.id })
    } else if (part.text.trim()) out.push({ kind: "text", text: part.text, key: String(i) })
  })
  return out
}

const SUGGESTIONS = {
  zh: ["帮我把【待补充】的地方补上", "标题再抓人一点", "语气轻松一些", "写短一点"],
  en: ["Help me fill in the gaps", "A sharper title", "Shorter, please"],
}

/** "【待补充：怎样算做完】" → "怎样算做完"; "[To fill in: owner's name]" → "owner's name". */
const gapText = (gap: string) => gap.replace(/^【待补充[：:]\s*|】$/g, "").replace(/^\[To fill in:\s*|\]$/gi, "")

/** The open points (placeholders) left in the draft, once each. Clicking one starts an answer to it. */
function OpenPoints({ gaps, onPick, disabled }: { gaps: string[]; onPick: (gap: string) => void; disabled: boolean }) {
  const [open, setOpen] = React.useState(true)
  const unique = [...new Set(gaps)]
  if (unique.length === 0) return null
  return (
    <section className="shrink-0 border-b px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs"
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-warning/15 text-[11px] font-semibold text-warning tabular-nums">
          {unique.length}
        </span>
        <span className="font-medium">Open {unique.length === 1 ? "point" : "points"}</span>
        <span className="text-muted-foreground">to fill in before you approve</span>
        <ChevronDownIcon className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <ul className="mt-1 flex max-h-44 flex-col overflow-y-auto pb-1">
          {unique.map((gap) => (
            <li key={gap}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(gap)}
                className="group flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-[13px] leading-snug hover:bg-muted disabled:pointer-events-none"
              >
                <span className="mt-px w-6 shrink-0 rounded bg-muted px-1 text-center text-[10px] font-medium text-muted-foreground group-hover:bg-background">
                  {gap.startsWith("【") ? "中" : "EN"}
                </span>
                <span className="min-w-0 flex-1">{gapText(gap)}</span>
                <CornerDownLeftIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function PostChat({ post, gaps, className }: { post: Post; gaps: string[]; className?: string }) {
  const chat = usePostChat(post.id)
  const [text, setText] = React.useState("")
  const busy = chat.status === "submitted" || chat.status === "streaming"
  const closed = post.status === "published" || post.status === "skipped"
  const zh = post.langs.includes("zh")

  const say = (prompt: string) => {
    if (!prompt.trim() || busy || chat.status === "loading") return
    setText("")
    void chat.send(prompt.trim())
  }
  const handleSubmit = (message: PromptInputMessage) => say(message.text)

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <OpenPoints gaps={gaps} disabled={closed} onPick={(gap) => setText(`${gapText(gap)}${gap.startsWith("【") ? "：" : ": "}`)} />
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 p-4">
          {chat.messages.length === 0 && chat.status !== "loading" && (
            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                {zh
                  ? "跟我说说这篇要讲什么：发生了什么、谁做的、有什么真实的数字或原话。缺什么我会问你，然后让写稿的 agent 重写左边的草稿。"
                  : "Tell me what this post should say: what happened, who did it, real numbers or quotes. I'll ask for what's missing, then have the writer redo the draft on the left."}
              </p>
              {!closed && (
                <div className="flex flex-wrap gap-2">
                  {(zh ? SUGGESTIONS.zh : SUGGESTIONS.en).map((s) => (
                    <Button key={s} variant="outline" size="sm" className="h-auto py-1 text-xs" onClick={() => say(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          {chat.messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap">{message.text}</p>
                ) : (
                  groupParts(message.parts).map((group) =>
                    group.kind === "steps" ? (
                      <Steps key={group.key} parts={group.parts} />
                    ) : (
                      <MessageResponse key={group.key}>{group.text}</MessageResponse>
                    ),
                  )
                )}
              </MessageContent>
            </Message>
          ))}
          {chat.notice && (
            <p role="alert" className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              {chat.notice}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t p-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              disabled={closed}
              placeholder={closed ? "This post is closed." : zh ? "比如：这周上线了第一版，是 Yu 做的…" : "e.g. The first version went live this week; Yu built it…"}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <span className="px-2 text-xs text-muted-foreground">
                {chat.rewriting ? "Rewriting the draft…" : "It rewrites the draft; you still approve it."}
              </span>
            </PromptInputTools>
            <PromptInputSubmit
              status={chat.status === "loading" ? "ready" : chat.status}
              onStop={chat.stop}
              disabled={closed || (!busy && !text.trim())}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
