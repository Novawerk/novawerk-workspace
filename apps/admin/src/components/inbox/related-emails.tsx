import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, MailIcon } from "lucide-react"

import { StatusBadge } from "@nw/ui/compound/status-badge"

import { formatRelative } from "@/lib/format"
import { outboxQueryOptions } from "@/lib/queries"
import type { OutboxRelatedTable } from "@/lib/types"

/** Outbox emails about one pitch, application or partner. Hidden while there are none. */
export function RelatedEmails({ table, id }: { table: OutboxRelatedTable; id: string }) {
  const { data = [] } = useQuery(outboxQueryOptions({ relatedTable: table, relatedId: id }))
  if (data.length === 0) return null
  return (
    <section className="rounded-lg border bg-card">
      <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <MailIcon className="size-4 text-muted-foreground" />
        Emails about this
      </h3>
      <ul className="divide-y">
        {data.map((email) => (
          <li key={email.id}>
            <Link
              to="/outbox"
              search={{ id: email.id, status: "all" }}
              className="flex items-center gap-3 px-4 py-2.5 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{email.subject}</span>
                <span className="truncate text-xs text-muted-foreground">
                  To {email.to} · {formatRelative(email.createdAt)}
                </span>
              </div>
              <StatusBadge kind="outbox" status={email.status} />
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
