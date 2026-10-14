import type * as React from "react"

import { cn } from "@nw/ui/lib/utils"

/** A scrolling page with the standard width and padding. `header` is usually a PageHeader. */
export function Page({
  header,
  children,
  className,
  width = "default",
}: {
  header: React.ReactNode
  children: React.ReactNode
  className?: string
  width?: "default" | "wide"
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-6 p-4 sm:p-6",
          width === "wide" ? "max-w-7xl" : "max-w-5xl",
          className,
        )}
      >
        {header}
        {children}
      </div>
    </div>
  )
}
