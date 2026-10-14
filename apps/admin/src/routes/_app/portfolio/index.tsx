import { createFileRoute, redirect } from "@tanstack/react-router"

/** The portfolio is now the Projects board. Old links land there. */
export const Route = createFileRoute("/_app/portfolio/")({
  beforeLoad: () => {
    throw redirect({ to: "/projects", replace: true })
  },
})
