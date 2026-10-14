import { createFileRoute } from "@tanstack/react-router"

import { ProjectEditor } from "@/components/portfolio/project-editor"
import { membersQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/_app/projects/new")({
  loader: ({ context }) => context.queryClient.ensureQueryData(membersQueryOptions),
  component: () => <ProjectEditor />,
})
