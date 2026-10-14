import { createFileRoute, redirect } from "@tanstack/react-router"

/** Moved to /projects/new. */
export const Route = createFileRoute("/_app/portfolio/new")({
  beforeLoad: () => {
    throw redirect({ to: "/projects/new", replace: true })
  },
})
