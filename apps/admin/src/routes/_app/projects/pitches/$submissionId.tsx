import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { SubmissionDetail } from "@/components/inbox/submission-detail"
import { submissionQueryOptions } from "@/lib/queries"

/**
 * A pitch before it is a project: read it, review it, reply, accept or decline. Once accepted
 * it lives on as the Pitch tab of its project, so an accepted pitch opens there.
 */
export const Route = createFileRoute("/_app/projects/pitches/$submissionId")({
  loader: async ({ context, params }) => {
    const pitch = await context.queryClient.ensureQueryData(submissionQueryOptions(params.submissionId)).catch(() => null)
    if (pitch?.status === "accepted" && pitch.projectId) {
      throw redirect({ to: "/projects/$projectId", params: { projectId: pitch.projectId }, search: { tab: "pitch" } })
    }
  },
  component: PitchPage,
})

function PitchPage() {
  const { submissionId } = Route.useParams()
  const navigate = Route.useNavigate()
  const { data: pitch } = useQuery(submissionQueryOptions(submissionId))

  // Accepting it here starts the project: go there.
  React.useEffect(() => {
    if (pitch?.status === "accepted" && pitch.projectId) {
      void navigate({ to: "/projects/$projectId", params: { projectId: pitch.projectId }, replace: true })
    }
  }, [pitch?.status, pitch?.projectId, navigate])

  return <SubmissionDetail key={submissionId} id={submissionId} />
}
