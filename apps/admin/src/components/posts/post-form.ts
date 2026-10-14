// The post editor's form, as plain strings, and the way back to the API's shapes.
// Lists are edited as text: one point per line, one number per line as "value | label".

import {
  POST_LANGS,
  emptyPostCard,
  type CardFormat,
  type PostCardInput,
  type PostContentInput,
  type PostCopyInput,
  type PostImageInput,
  type PostLang,
  type PostPlatform,
} from "@nw/contracts"

import type { Post, PostPatch } from "@/lib/types"

export type CardForm = {
  eyebrow: string
  headline: string
  lede: string
  points: string
  quoteText: string
  quoteBy: string
  stats: string
  footer: string
}

export type CopyForm = { title: string; body: string; card: CardForm }

export type PostForm = {
  label: string
  dueOn: string
  langs: PostLang[]
  /** Null: the kind's usual platforms. */
  platforms: PostPlatform[] | null
  withCard: boolean
  images: PostImageInput[]
  brief: string
  photoUrl: string | null
  zh: CopyForm
  en: CopyForm
}

const cardForm = (card: PostCardInput): CardForm => ({
  eyebrow: card.eyebrow,
  headline: card.headline,
  lede: card.lede,
  points: card.points.join("\n"),
  quoteText: card.quote.text,
  quoteBy: card.quote.by,
  stats: card.stats.map((s) => `${s.value} | ${s.label}`).join("\n"),
  footer: card.footer,
})

const copyForm = (copy?: PostCopyInput): CopyForm => ({
  title: copy?.title ?? "",
  body: copy?.body ?? "",
  card: cardForm(copy?.card ?? emptyPostCard()),
})

export const toPostForm = (post: Post): PostForm => ({
  label: post.label ?? "",
  dueOn: post.dueOn,
  langs: [...post.langs],
  platforms: post.platforms ? ([...post.platforms] as PostPlatform[]) : null,
  withCard: post.withCard,
  images: post.images.map((i) => ({ ...i })),
  brief: post.brief ?? "",
  photoUrl: post.photoUrl,
  zh: copyForm(post.content?.zh),
  en: copyForm(post.content?.en),
})

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

export function toCard(card: CardForm): PostCardInput {
  return {
    eyebrow: card.eyebrow.trim(),
    headline: card.headline.trim(),
    lede: card.lede.trim(),
    points: lines(card.points),
    quote: { text: card.quoteText.trim(), by: card.quoteBy.trim() },
    stats: lines(card.stats).map((line) => {
      const bar = line.indexOf("|")
      return bar === -1
        ? { value: line, label: "" }
        : { value: line.slice(0, bar).trim(), label: line.slice(bar + 1).trim() }
    }),
    footer: card.footer.trim(),
  }
}

const toCopy = (copy: CopyForm): PostCopyInput => ({ title: copy.title.trim(), body: copy.body, card: toCard(copy.card) })

export const toContent = (form: PostForm): PostContentInput => ({ zh: toCopy(form.zh), en: toCopy(form.en) })

/** True when nothing has been written in the post's languages. */
export function isBlank(form: PostForm): boolean {
  const content = toContent(form)
  return form.langs.every((lang) => {
    const { title, body, card } = content[lang]
    return !title && !body.trim() && JSON.stringify(card) === JSON.stringify(emptyPostCard())
  })
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** What changed between the saved form and this one, as a PATCH. */
export function formPatch(saved: PostForm, form: PostForm, kind: Post["kind"]): PostPatch {
  const patch: PostPatch = {}
  if (kind === "custom" && form.label !== saved.label) patch.label = form.label
  if (form.dueOn !== saved.dueOn) patch.dueOn = form.dueOn
  if (!same(form.langs, saved.langs)) patch.langs = form.langs
  if (!same(form.platforms, saved.platforms)) patch.platforms = form.platforms
  if (form.withCard !== saved.withCard) patch.withCard = form.withCard
  if (!same(form.images, saved.images)) patch.images = form.images
  if (form.brief !== saved.brief) patch.brief = form.brief
  if (form.photoUrl !== saved.photoUrl) patch.photoUrl = form.photoUrl ?? ""
  if (POST_LANGS.some((l) => !same(form[l], saved[l]))) patch.content = toContent(form)
  return patch
}

/** "kiez-pantry-progress-4-zh-portrait.png", "novawerk-open-day-zh-portrait.png" */
export function cardFileName(post: Post, lang: PostLang, format: CardFormat) {
  const kind = post.kind === "custom" && post.label ? kebab(post.label) || "post" : post.kind.replace(/_/g, "-")
  return `${post.project?.slug ?? "novawerk"}-${kind}${post.seq && post.kind !== "custom" ? `-${post.seq}` : ""}-${lang}-${format}.png`
}

const kebab = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)

/** Pictures a card can draw: PNG, JPEG, GIF. Guessed from the file name. */
export const isDrawable = (url: string) => /\.(png|jpe?g|gif)(\?|#|$)/i.test(url)

/** Title, a blank line, the text: what goes into a platform's composer. */
export const copyText = (copy: CopyForm) => [copy.title.trim(), copy.body.trim()].filter(Boolean).join("\n\n")
