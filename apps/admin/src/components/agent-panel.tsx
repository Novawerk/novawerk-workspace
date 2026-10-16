import * as React from "react"
import { Link } from "@tanstack/react-router"
import { FlaskConicalIcon, MailIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@nw/ui/ai-elements/conversation"
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
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@nw/ui/ai-elements/reasoning"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@nw/ui/ai-elements/tool"
import type { AdminChatPart } from "@nw/contracts"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { cn } from "@nw/ui/lib/utils"

import { useAdminChat } from "@/lib/admin-chat"
import { USE_SAMPLE_DATA } from "@/lib/env"

// "Ask the agent": the admin assistant (/admin/chat) next to a pitch or an application. It reads
// the inbox, members and partners, and can draft an email into the outbox (pending). In
// sample-data mode the panel shows a canned conversation and never calls a model.

type DemoPart =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string; seconds: number }
  | { kind: "tool"; name: string; input: Record<string, unknown>; output: unknown }

type DemoMessage = { id: string; role: "user" | "assistant"; parts: DemoPart[] }

export type AgentSubject =
  | { kind: "pitch"; id: string; title: string; person: string }
  | { kind: "application"; id: string; title: string; person: string }

function demoConversation(subject: AgentSubject): DemoMessage[] {
  if (subject.kind === "pitch") {
    return [
      {
        id: "u1",
        role: "user",
        parts: [{ kind: "text", text: `Is “${subject.title}” a fit for Novawerk?` }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            kind: "reasoning",
            seconds: 4,
            text: "Read the five answers. Checked them against the three principles in knowledge/. Looked for similar projects in the portfolio.",
          },
          {
            kind: "tool",
            name: "search_knowledge",
            input: { query: "principles open by default", limit: 3 },
            output: {
              hits: [
                { file: "knowledge/identity/principles.md", heading: "Open by default" },
                { file: "knowledge/operations/process.md", heading: "From pitch to project" },
              ],
            },
          },
          {
            kind: "text",
            text: [
              `Mostly yes. ${subject.person} describes a real problem and a small first step.`,
              "",
              "- **Open by default:** the plan already says open source and open data.",
              "- **Small team, real users:** a pilot group is named. That's a good sign.",
              "- **Gap:** no designer yet. We could match them with a member from the applications inbox.",
              "",
              "Next step I'd suggest: invite them to the next dev review and ask how they keep the data fresh.",
            ].join("\n"),
          },
        ],
      },
    ]
  }
  return [
    {
      id: "u1",
      role: "user",
      parts: [{ kind: "text", text: `Where could ${subject.person} help first?` }],
    },
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          kind: "reasoning",
          seconds: 3,
          text: "Matched their functions and hours against open roles on current projects.",
        },
        {
          kind: "tool",
          name: "list_open_roles",
          input: { functions: ["design", "research"] },
          output: { roles: [{ project: "Kiez Pantry", role: "Design" }] },
        },
        {
          kind: "text",
          text: "Kiez Pantry needs a designer and runs user interviews soon. Their research background fits. Suggest an intro call with the initiator.",
        },
      ],
    },
  ]
}

const SAMPLE_REPLY = "Sample mode: this conversation is canned. Unset VITE_USE_SAMPLE_DATA to talk to the assistant."

export function AgentPanel(props: { subject: AgentSubject; className?: string }) {
  return USE_SAMPLE_DATA ? <SampleAgentPanel {...props} /> : <LiveAgentPanel {...props} />
}

function SampleAgentPanel({ subject, className }: { subject: AgentSubject; className?: string }) {
  const [messages, setMessages] = React.useState<DemoMessage[]>(() => demoConversation(subject))
  const [status, setStatus] = React.useState<"ready" | "submitted">("ready")
  const [text, setText] = React.useState("")
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  const handleSubmit = (message: PromptInputMessage) => {
    const prompt = message.text.trim()
    if (!prompt || status !== "ready") return
    setText("")
    setMessages((prev) => [
      ...prev,
      { id: `u${prev.length}`, role: "user", parts: [{ kind: "text", text: prompt }] },
    ])
    setStatus("submitted")
    timer.current = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: `a${prev.length}`, role: "assistant", parts: [{ kind: "text", text: SAMPLE_REPLY }] },
      ])
      setStatus("ready")
    }, 700)
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-6 p-4">
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, i) => {
                  if (part.kind === "reasoning") {
                    return (
                      <Reasoning key={i} defaultOpen={false} duration={part.seconds}>
                        <ReasoningTrigger />
                        <ReasoningContent>{part.text}</ReasoningContent>
                      </Reasoning>
                    )
                  }
                  if (part.kind === "tool") {
                    return (
                      <Tool key={i}>
                        <ToolHeader type={`tool-${part.name}`} state="output-available" title={part.name} />
                        <ToolContent>
                          <ToolInput input={part.input} />
                          <ToolOutput output={part.output} errorText={undefined} />
                        </ToolContent>
                      </Tool>
                    )
                  }
                  return message.role === "assistant" ? (
                    <MessageResponse key={i}>{part.text}</MessageResponse>
                  ) : (
                    <p key={i}>{part.text}</p>
                  )
                })}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t p-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              placeholder={
                subject.kind === "pitch" ? "Ask about this pitch…" : "Ask about this application…"
              }
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning">
                <FlaskConicalIcon />
                Sample
              </Badge>
              <span className="px-2 text-xs text-muted-foreground">Sample answers only</span>
            </PromptInputTools>
            <PromptInputSubmit status={status} disabled={!text.trim() && status === "ready"} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

// ─── Live: the admin assistant ───────────────────────────────────────────────

const TOOL_TITLES: Record<string, string> = {
  list_submissions: "Looked at pitches",
  get_submission: "Read the pitch",
  list_applications: "Looked at applications",
  get_application: "Read the application",
  list_members: "Looked at members",
  list_partners: "Looked at partners",
  list_projects: "Looked at the portfolio",
  draft_email: "Drafted an email",
}

const TOOL_STATES = { running: "input-available", done: "output-available", error: "output-error" } as const

/** Pretty-print JSON results; leave plain text alone. */
function formatOutput(output: string | undefined) {
  if (!output) return output
  try {
    return JSON.stringify(JSON.parse(output), null, 2)
  } catch {
    return output
  }
}

function ToolPart({ part }: { part: Extract<AdminChatPart, { type: "tool" }> }) {
  const outboxId = part.name === "draft_email" ? /outbox email ([0-9a-f-]{36})/.exec(part.output ?? "")?.[1] : undefined
  return (
    <div className="flex flex-col gap-2">
      <Tool>
        <ToolHeader type={`tool-${part.name}`} state={TOOL_STATES[part.status]} title={TOOL_TITLES[part.name] ?? part.name} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput
            output={part.status === "error" ? undefined : formatOutput(part.output)}
            errorText={part.status === "error" ? part.output : undefined}
          />
        </ToolContent>
      </Tool>
      {outboxId && part.status === "done" && (
        <Button variant="outline" size="sm" className="w-fit" nativeButton={false} render={<Link to="/outbox" search={{ id: outboxId, status: "all" }} />}>
          <MailIcon /> Review the draft in the outbox
        </Button>
      )}
    </div>
  )
}

function LiveAgentPanel({ subject, className }: { subject: AgentSubject; className?: string }) {
  const chat = useAdminChat({ kind: subject.kind === "pitch" ? "submission" : "application", id: subject.id })
  const [text, setText] = React.useState("")
  const busy = chat.status === "submitted" || chat.status === "streaming"

  const handleSubmit = (message: PromptInputMessage) => {
    const prompt = message.text.trim()
    if (!prompt || busy || chat.status === "loading") return
    setText("")
    void chat.send(prompt)
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-6 p-4">
          {chat.messages.length === 0 && chat.status !== "loading" && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                Ask about {subject.kind === "pitch" ? `“${subject.title}”` : `${subject.person}'s application`}, the
                inbox, members or partners.
              </p>
              <p>It can draft an email for you. Drafts wait in the outbox until a maintainer approves them.</p>
            </div>
          )}
          {chat.messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap">{message.text}</p>
                ) : (
                  message.parts.map((part, i) =>
                    part.type === "tool" ? (
                      <ToolPart key={part.id} part={part} />
                    ) : (
                      <MessageResponse key={i}>{part.text}</MessageResponse>
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
              placeholder={subject.kind === "pitch" ? "Ask about this pitch…" : "Ask about this application…"}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {chat.messages.length > 0 && (
                <Button variant="ghost" size="xs" onClick={chat.reset} disabled={busy}>
                  <RotateCcwIcon /> New chat
                </Button>
              )}
              <span className="px-2 text-xs text-muted-foreground">Reads only. Drafts need approval.</span>
            </PromptInputTools>
            <PromptInputSubmit
              status={chat.status === "loading" ? "ready" : chat.status}
              onStop={chat.stop}
              disabled={!busy && !text.trim()}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
