import { createFileRoute } from "@tanstack/react-router"
import { BotIcon, CodeIcon, ExternalLinkIcon, ShieldCheckIcon } from "lucide-react"

import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"

import { Page } from "@/components/page"
import { AGENTS, EFFECT_LABELS, sourceUrl, workflowUrl } from "@/lib/agents"

export const Route = createFileRoute("/_app/agents")({
  component: AgentsPage,
})

function AgentsPage() {
  return (
    <Page
      header={
        <PageHeader
          eyebrow="System"
          title="Agents"
          description="The agents that help us run Novawerk. Each one runs on GitHub Actions; its run history and logs live there."
        />
      }
    >
      <div className="flex gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          No agent can email anyone outside Novawerk. They queue drafts in the outbox; a member approves each one.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {AGENTS.map((agent) => (
          <Card key={agent.id} className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BotIcon className="size-4 text-primary" />
                {agent.name}
                <code className="ml-auto font-mono text-xs font-normal text-muted-foreground">{agent.id}</code>
              </CardTitle>
              <CardDescription>{agent.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                <span className="text-muted-foreground">Runs: </span>
                {agent.when}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {agent.effects.map((effect) => (
                  <Badge key={effect} variant={effect === "outbox" ? "outline" : "secondary"}>
                    {EFFECT_LABELS[effect]}
                  </Badge>
                ))}
              </div>
            </CardContent>
            <CardFooter className="mt-auto gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={workflowUrl(agent.id)} target="_blank" rel="noreferrer noopener" />}
              >
                <ExternalLinkIcon /> Runs on GitHub
              </Button>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<a href={sourceUrl(agent.id)} target="_blank" rel="noreferrer noopener" />}
              >
                <CodeIcon /> Code
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        To run one by hand: open its runs on GitHub, then “Run workflow”. From a terminal:{" "}
        <code className="font-mono">pnpm agent &lt;id&gt; --dry-run</code>.
      </p>
    </Page>
  )
}
