import * as React from "react"
import { Outlet, createFileRoute, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { CloudOffIcon, SearchIcon, TriangleAlertIcon } from "lucide-react"

import { EmptyState } from "@nw/ui/compound/empty-state"
import { Button } from "@nw/ui/core/components/ui/button"
import { Kbd } from "@nw/ui/core/components/ui/kbd"
import { Separator } from "@nw/ui/core/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@nw/ui/core/components/ui/sidebar"

import { AgentRail, AgentRailProvider, AgentRailToggle } from "@/components/agent-rail"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/command-palette"
import { SampleDataBadge } from "@/components/sample-data-badge"
import { isForbidden, isUnauthorized } from "@/lib/api"
import { API_URL } from "@/lib/env"
import { isMaintainer, memberMayOpen } from "@/lib/nav"
import { meQueryOptions } from "@/lib/queries"

/**
 * Pathless layout for every signed-in page. `beforeLoad` asks GET /admin/me; a 401 sends
 * the visitor to /login, a 403 (an account the panel doesn't open for) too, saying why. Members who aren't maintainers only get their own projects and posts;
 * anything else sends them to /projects. In sample-data mode the data source answers with a
 * sample member.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    let me
    try {
      me = await context.queryClient.ensureQueryData(meQueryOptions)
    } catch (error) {
      if (isUnauthorized(error)) throw redirect({ to: "/login" })
      if (isForbidden(error)) throw redirect({ to: "/login", search: { denied: true } })
      throw error
    }
    if (!isMaintainer(me) && !memberMayOpen(location.pathname)) throw redirect({ to: "/projects" })
    return { me }
  },
  component: AppLayout,
  errorComponent: LayoutError,
})

function AppLayout() {
  const { me } = Route.useRouteContext()
  const [paletteOpen, setPaletteOpen] = React.useState(false)

  return (
    <SidebarProvider>
      <AgentRailProvider>
        <AppSidebar me={me} />
        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
            <Button
              variant="outline"
              size="sm"
              className="min-w-0 flex-1 justify-start gap-2 text-muted-foreground sm:max-w-64"
              onClick={() => setPaletteOpen(true)}
            >
              <SearchIcon />
              <span className="flex-1 text-left">Jump to…</span>
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
            </Button>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SampleDataBadge />
              <AgentRailToggle />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </SidebarInset>
        <AgentRail />
        <CommandPalette me={me} open={paletteOpen} onOpenChange={setPaletteOpen} />
      </AgentRailProvider>
    </SidebarProvider>
  )
}

/** fetch() rejects with a TypeError when the server can't be reached (down, CORS, offline). */
const isNetworkError = (error: unknown) => error instanceof TypeError && /fetch|network|load/i.test(error.message)

function LayoutError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)
  const offline = isNetworkError(error)
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <EmptyState
        icon={offline ? <CloudOffIcon /> : <TriangleAlertIcon />}
        title={offline ? "We can't reach the API" : "Something went wrong"}
        description={
          offline ? (
            <>
              The admin panel talks to <code className="font-mono text-xs">{API_URL}</code>. Start apps/api,
              or set <code className="font-mono text-xs">VITE_USE_SAMPLE_DATA=true</code> to browse sample
              data.
            </>
          ) : (
            <code className="font-mono text-xs">{message}</code>
          )
        }
        className="max-w-xl"
      >
        <Button
          onClick={() => {
            reset()
            void router.invalidate()
          }}
        >
          Try again
        </Button>
      </EmptyState>
    </div>
  )
}
