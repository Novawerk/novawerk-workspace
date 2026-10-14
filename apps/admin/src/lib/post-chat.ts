// The post writer in the browser: the one shared chat of a post (/admin/posts/:id/chat), loaded
// when the editor opens, streamed (SSE) like the admin assistant. When the writer saves the brief
// or rewrites the post, the post is fetched again so the editor and preview show it.

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import type { AdminChatEvent, AdminChatMessage, AdminChatPart } from "@nw/contracts"

import { applyEvent, failure, type ChatStatus } from "./admin-chat"
import { client } from "./api-client"
import { queryKeys } from "./queries"
import { readEvents } from "./sse"

/** Tools whose result changes the post. */
const CHANGES_POST = new Set(["save_brief", "rewrite_post"])

export function usePostChat(postId: string) {
  const queryClient = useQueryClient()
  const [messages, setMessages] = React.useState<AdminChatMessage[]>([])
  const [status, setStatus] = React.useState<ChatStatus>("loading")
  /** Why the last message failed, or why the writer is off. */
  const [notice, setNotice] = React.useState<string | null>(null)
  /** The writer is rewriting the post right now. */
  const [rewriting, setRewriting] = React.useState(false)
  const abort = React.useRef<AbortController | null>(null)

  const refreshPost = React.useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) }),
    [queryClient, postId],
  )

  React.useEffect(() => {
    let cancelled = false
    setMessages([])
    setNotice(null)
    setStatus("loading")
    void (async () => {
      try {
        const res = await client.admin.posts[":id"].chat.$get({ param: { id: postId } })
        if (cancelled) return
        if (res.ok) setMessages((await res.json()).messages)
        else setNotice(await failure(res))
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
  }, [postId])

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

      try {
        const controller = new AbortController()
        abort.current = controller
        const res = await client.admin.posts[":id"].chat.messages.$post(
          { param: { id: postId }, json: { text } },
          { init: { signal: controller.signal } },
        )
        if (!res.ok) {
          setNotice(await failure(res))
          return
        }
        await readEvents<AdminChatEvent>(res, (event) => {
          if (event.type === "error") setNotice(event.message)
          else if (event.type === "text_delta" || event.type === "tool_call") setStatus("streaming")
          if (event.type === "tool_call" && event.name === "rewrite_post") setRewriting(true)
          if (event.type === "tool_result" && CHANGES_POST.has(event.name)) {
            if (event.name === "rewrite_post") setRewriting(false)
            refreshPost()
          }
          update((parts) => applyEvent(parts, event))
        })
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) setNotice("The connection dropped. Try again.")
      } finally {
        abort.current = null
        setRewriting(false)
        setMessages((list) => list.filter((m) => !(m.id === assistantId && m.role === "assistant" && m.parts.length === 0)))
        setStatus("ready")
        refreshPost()
      }
    },
    [postId, refreshPost],
  )

  const stop = React.useCallback(() => abort.current?.abort(), [])

  return { messages, status, notice, rewriting, send, stop }
}
