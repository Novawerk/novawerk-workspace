import { createFileRoute, redirect } from "@tanstack/react-router"

/** Pitches are the first stage on the Projects board now. Old links (emails, bookmarks) land there. */
export const Route = createFileRoute("/_app/inbox/projects")({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" && search.id ? search.id : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw search.id
      ? redirect({ to: "/projects/pitches/$submissionId", params: { submissionId: search.id }, replace: true })
      : redirect({ to: "/projects", replace: true })
  },
})
