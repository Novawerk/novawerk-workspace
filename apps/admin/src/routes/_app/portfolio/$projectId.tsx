import { createFileRoute, redirect } from "@tanstack/react-router"

/** Moved to /projects/:id. */
export const Route = createFileRoute("/_app/portfolio/$projectId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId", params: { projectId: params.projectId }, replace: true })
  },
})
