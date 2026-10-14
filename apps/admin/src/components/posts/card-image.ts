// The template card as a picture: rendered by the API (POST /admin/cards) a moment after each
// edit, so the preview shows the editor's unsaved text and the download is the same picture.

import * as React from "react"

import { CARD_FORMAT_NAMES, type CardFormat, type CardRenderInput, type PostCardInput, type PostLang } from "@nw/contracts"

import { dataSource } from "@/lib/data-source"
import { errorMessage } from "@/lib/errors"
import type { Post } from "@/lib/types"

import { cardFileName } from "./post-form"

/** Save a blob under a file name. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Render one card and download it. */
export async function downloadCard(post: Post, lang: PostLang, format: CardFormat, card: PostCardInput, photoUrl: string | null) {
  const blob = await dataSource.renderCard({ kind: post.kind, lang, format, card, photoUrl })
  saveBlob(blob, cardFileName(post, lang, format))
}

/** The card in every size. */
export async function downloadAllCards(post: Post, lang: PostLang, card: PostCardInput, photoUrl: string | null) {
  for (const format of CARD_FORMAT_NAMES) await downloadCard(post, lang, format, card, photoUrl)
}

/** Download one of the post's own pictures; if the browser can't fetch it, open it instead. */
export async function downloadPicture(url: string, name: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    saveBlob(await res.blob(), name)
  } catch {
    window.open(url, "_blank", "noopener")
  }
}

/** "…/abc-poster.png?x" → "poster.png" */
export const pictureName = (url: string, fallback: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || fallback).replace(/^[0-9a-f]{16}-/, "")
  } catch {
    return fallback
  }
}

/** The card for `request`, re-rendered a moment after it changes. Null request: nothing. */
export function useCardImage(request: CardRenderInput | null) {
  const [image, setImage] = React.useState<{ url: string; key: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const key = request ? JSON.stringify(request) : null

  React.useEffect(() => {
    if (!request || image?.key === key) return
    let stale = false
    const timer = setTimeout(
      async () => {
        setLoading(true)
        try {
          const blob = await dataSource.renderCard(request)
          if (stale) return
          setImage({ url: URL.createObjectURL(blob), key: key! })
          setError(null)
        } catch (err) {
          if (!stale) setError(errorMessage(err))
        } finally {
          if (!stale) setLoading(false)
        }
      },
      image ? 600 : 0,
    )
    return () => {
      stale = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Free each picture once the next one replaces it, and the last one on unmount.
  React.useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url)
    },
    [image],
  )

  return { url: request ? (image?.url ?? null) : null, loading, error, current: image?.key === key }
}
