import { useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { MegaphoneIcon } from "lucide-react"

import { EmptyState } from "@nw/ui/compound/empty-state"
import { Button } from "@nw/ui/core/components/ui/button"

import { PostEditor } from "@/components/posts/post-editor"
import { postQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/_app/posts/$postId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(postQueryOptions(params.postId)),
  component: PostPage,
  errorComponent: MissingPost,
})

function PostPage() {
  const { postId } = Route.useParams()
  const { data: post } = useSuspenseQuery(postQueryOptions(postId))
  return <PostEditor key={post.id} post={post} />
}

function MissingPost() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState icon={<MegaphoneIcon />} title="We can't find this post" description="Its project may have been deleted." className="max-w-lg">
        <Button nativeButton={false} render={<Link to="/posts" />}>
          Back to the posts
        </Button>
      </EmptyState>
    </div>
  )
}
