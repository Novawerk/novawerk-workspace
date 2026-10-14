import type { QueryClient } from "@tanstack/react-query"
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router"
import { CompassIcon } from "lucide-react"

import { EmptyState } from "@nw/ui/compound/empty-state"
import { Button } from "@nw/ui/core/components/ui/button"

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <EmptyState
        icon={<CompassIcon />}
        title="We can't find that page"
        description="The link may be old, or the page moved."
        className="max-w-lg"
      >
        <Button nativeButton={false} render={<Link to="/projects" />}>
          Go to the inbox
        </Button>
      </EmptyState>
    </div>
  )
}
