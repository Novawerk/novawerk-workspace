import type * as React from "react"

import { cn } from "@nw/ui/lib/utils"

/** Brand colours of the mark. Fixed on purpose: the mark looks the same in light and dark mode. */
export const NOVA_GREEN = "#1f7a4a"

export type NovaStarProps = Omit<React.ComponentProps<"svg">, "children"> & {
  /** Accessible name. Leave empty when the mark sits next to the word "Novawerk". */
  title?: string
}

/** The Novawerk NovaStar mark: a four-pointed star whose core is cut out to show the ground. */
export function NovaStar({ title, className, ...props }: NovaStarProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("size-6 shrink-0", className)}
      {...props}
    >
      {title && <title>{title}</title>}
      <path
        fill={NOVA_GREEN}
        fillRule="evenodd"
        d="M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z M50 36 L51.4 48.6 L64 50 L51.4 51.4 L50 64 L48.6 51.4 L36 50 L48.6 48.6 Z"
      />
    </svg>
  )
}
