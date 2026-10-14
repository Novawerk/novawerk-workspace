import { ExternalLinkIcon } from "lucide-react"

import { splitLinks } from "@/lib/format"

/** The free-text "links" answer from a form, as clickable URLs. */
export function LinksList({ links }: { links: string | null }) {
  const urls = splitLinks(links)
  if (!urls.length) return null
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <h3 className="mb-2 text-sm font-medium">Links</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {urls.map((url) => (
          <li key={url}>
            <a
              href={/^https?:\/\//.test(url) ? url : `https://${url}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 break-all text-primary underline-offset-4 hover:underline"
            >
              {url}
              <ExternalLinkIcon className="size-3.5 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
