import type * as React from "react"

import { cn } from "@nw/ui/lib/utils"

/**
 * List on the left, detail on the right. Below `lg` only one side shows at a time:
 * the list until something is selected, then the detail (which carries a back button
 * and its own title, so the page header steps aside to leave room).
 */
export function InboxSplitView({
  header,
  list,
  detail,
  hasSelection,
}: {
  header: React.ReactNode
  list: React.ReactNode
  detail: React.ReactNode
  hasSelection: boolean
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("shrink-0 border-b px-4 py-4 sm:px-6", hasSelection && "hidden lg:block")}>{header}</div>
      <div className="flex min-h-0 flex-1">
        <section
          aria-label="List"
          className={cn(
            "flex min-h-0 w-full flex-col gap-3 overflow-hidden p-4 lg:w-[400px] lg:shrink-0 lg:border-r xl:w-[440px]",
            hasSelection && "hidden lg:flex",
          )}
        >
          {list}
        </section>
        <section
          aria-label="Detail"
          className={cn("flex min-h-0 min-w-0 flex-1", !hasSelection && "hidden lg:flex")}
        >
          {detail}
        </section>
      </div>
    </div>
  )
}
