// The admin assistant in the browser: one chat per pitch or application, resumed from
// localStorage, created on the first message. Talks to /admin/chat over the typed client and
// streams the answer (SSE). Sample mode never calls this; the panel shows a canned chat there.

import * as React from "react"

import type { AdminChatEvent, AdminChatMessage, AdminChatPart, AdminChatSubjectKind } from "@nw/contracts"

import { ApiError } from "./api"
import { client } from "./api-client"
import { readEvents } from "./sse"

export type ChatStatus = "loading" | "ready" | "submitted" | "streaming"
export type ChatSubject = { kind: AdminChatSubjectKind; id: string }

const storageKey = (s: ChatSubject) => `nw-admin-chat:${s.kind}:${s.id}`

function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSaved(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Private mode or blocked storage: the chat just won't resume after a reload.
  }
}

export async function failure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // Not JSON.
  }
  return new ApiError(response.status, null).message
}

/** Apply one streamed event to the assistant bubble being written. */
export function applyEvent(parts: AdminChatPart[], event: AdminChatEvent): AdminChatPart[] {
  switch (event.type) {
    case "text_delta": {
      const last = parts.at(-1)
      if (last?.type === "text") return [...parts.slice(0, -1), { ...last, text: last.text + event.text }]
      return [...parts, { type: "text", text: event.text }]
    }
    case "tool_call":
      return [...parts, { type: "tool", id: event.id, name: event.name, input: event.input, status: "running" }]
    case "tool_result":
      return parts.map((p) =>
        p.type === "tool" && p.id === event.id ? { ...p, output: event.output, status: event.isError ? "error" : "done" } : p,
      )
    default:
      return parts
  }
}

export function useAdminChat(subject: ChatSubject) {
  const key = storageKey(subject)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<AdminChatMessage[]>([])
  const [status, setStatus] = React.useState<ChatStatus>("loading")
  /** Why the last message failed, or why the assistant is off. */
  const [notice, setNotice] = React.useState<string | null>(null)
  const abort = React.useRef<AbortController | null>(null)

  // Resume this record's chat, if there is one.
  React.useEffect(() => {
    let cancelled = false
    const saved = readSaved(key)
    setMessages([])
    setSessionId(null)
    setNotice(null)
    if (!saved) {
      setStatus("ready")
      return
    }
    setStatus("loading")
    void (async () => {
      try {
        const res = await client.admin.chat.sessions[":id"].$get({ param: { id: saved } })
        if (cancelled) return
        if (res.ok) {
          const session = await res.json()
          setSessionId(session.id)
          setMessages(session.messages)
        } else if (res.status === 404) {
          writeSaved(key, null)
        } else {
          setNotice(await failure(res))
        }
      } catch {
        if (!cancelled) setNotice("We can't reach the API.")
      } finally {
        if (!cancelled) setStatus("ready")
      }
    })()
    return () => {
      cancelled = true
      abort.current?.abort()
    }
  }, [key])

  const send = React.useCallback(
    async (text: string) => {
      const now = new Date().toISOString()
      const assistantId = `pending-${Date.now()}`
      setNotice(null)
      setStatus("submitted")
      setMessages((list) => [
        ...list,
        { id: `user-${Date.now()}`, role: "user", text, createdAt: now },
        { id: assistantId, role: "assistant", parts: [], createdAt: now },
      ])
      const update = (fn: (parts: AdminChatPart[]) => AdminChatPart[]) =>
        setMessages((list) => list.map((m) => (m.id === assistantId && m.role === "assistant" ? { ...m, parts: fn(m.parts) } : m)))
      const dropEmptyBubble = () =>
        setMessages((list) => list.filter((m) => !(m.id === assistantId && m.role === "assistant" && m.parts.length === 0)))

      try {
        let id = sessionId
        if (!id) {
          const created = await client.admin.chat.sessions.$post()
          if (!created.ok) {
            setNotice(await failure(created))
            dropEmptyBubble()
            return
          }
          id = (await created.json()).id
          setSessionId(id)
          writeSaved(key, id)
        }

        const controller = new AbortController()
        abort.current = controller
        const res = await client.admin.chat.sessions[":id"].messages.$post(
          { param: { id }, json: { text, subject } },
          { init: { signal: controller.signal } },
        )
        if (!res.ok) {
          setNotice(await failure(res))
          dropEmptyBubble()
          return
        }
        await readEvents<AdminChatEvent>(res, (event) => {
          if (event.type === "error") setNotice(event.message)
          else if (event.type === "text_delta" || event.type === "tool_call") setStatus("streaming")
          update((parts) => applyEvent(parts, event))
        })
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) setNotice("The connection dropped. Try again.")
      } finally {
        abort.current = null
        dropEmptyBubble()
        setStatus("ready")
      }
    },
    [key, sessionId, subject],
  )

  const stop = React.useCallback(() => abort.current?.abort(), [])

  /** Forget this chat and start over (the old one stays on the server). */
  const reset = React.useCallback(() => {
    abort.current?.abort()
    writeSaved(key, null)
    setSessionId(null)
    setMessages([])
    setNotice(null)
    setStatus("ready")
  }, [key])

  return { messages, status, notice, send, stop, reset }
}
