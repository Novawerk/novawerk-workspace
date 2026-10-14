import { cn } from "@nw/ui/lib/utils"

import { formatCount, formatPercent, ratio } from "@/lib/format"
import type { AdminMetrics } from "@/lib/types"

import { BarList, Figure, Panel, Section, barWidth } from "./parts"

type Intake = AdminMetrics["intake"]
type Funnel = Intake["funnel"]["pitch"]
type Mode = keyof Intake["funnel"]

/**
 * The four steps, lightest to darkest: one hue, so the order reads in the colour too. The theme
 * has no fourth step that clears the light surface, so the first is a mix of two of its steps.
 */
const STEPS = [
  {
    key: "opened",
    label: "Opened the chat",
    fill: "bg-[color-mix(in_oklch,var(--chart-2)_55%,var(--chart-5))] dark:bg-chart-5",
  },
  { key: "engaged", label: "Sent a message", fill: "bg-chart-2" },
  { key: "ready", label: "Draft complete", fill: "bg-chart-1" },
  { key: "submitted", label: "Sent", fill: "bg-chart-3" },
] as const satisfies readonly { key: keyof Funnel; label: string; fill: string }[]

const MODES: { mode: Mode; title: string; page: string }[] = [
  { mode: "pitch", title: "Pitch a project", page: "/submit" },
  { mode: "join", title: "Join", page: "/join" },
]

export function IntakeSection({ intake }: { intake: Intake }) {
  return (
    <Section
      id="metrics-intake"
      title="Intake funnel"
      description="How far people get with the Intake Agent before they send a pitch or an application."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {MODES.map(({ mode, title, page }) => (
          <Panel key={mode} title={title} description={`The chat on ${page}`}>
            <div className="flex flex-col gap-5">
              <FunnelSteps funnel={intake.funnel[mode]} />
              <Exits exits={intake.exits[mode]} />
              <ServerSide chats={intake.chats[mode]} />
            </div>
          </Panel>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        The funnel comes from the browser, so ad blockers can hide some of it. The server side counts every chat,
        which is why its numbers can be higher.
      </p>
    </Section>
  )
}

function FunnelSteps({ funnel }: { funnel: Funnel }) {
  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map((step, i) => {
        const value = funnel[step.key]
        const ofOpened = ratio(value, funnel.opened)
        const before = i > 0 ? STEPS[i - 1] : undefined
        const previous = before ? funnel[before.key] : 0
        const drop = ratio(Math.max(0, previous - value), previous)
        return (
          <li key={step.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{step.label}</span>
              <Figure value={value} share={ofOpened} />
            </div>
            <div aria-hidden className="h-2 rounded-[3px] bg-muted">
              <div className={cn("h-full rounded-[3px]", step.fill)} style={{ width: barWidth(ofOpened) }} />
            </div>
            {before && (
              <p className="text-xs text-muted-foreground">
                {drop === null
                  ? `No one reached “${before.label}”.`
                  : `${formatPercent(drop)} lost since “${before.label}”`}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Exits({ exits }: { exits: Intake["exits"]["pitch"] }) {
  const total = exits.beforeFirstMessage + exits.whileDrafting + exits.withDraftReady
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">Where people left</h3>
      <BarList
        total={total}
        empty="No one closed the chat without sending."
        rows={[
          { key: "before", label: "Before the first message", value: exits.beforeFirstMessage },
          { key: "drafting", label: "While drafting", value: exits.whileDrafting },
          { key: "ready", label: "With the draft complete", value: exits.withDraftReady },
        ]}
      />
    </div>
  )
}

function ServerSide({ chats }: { chats: Intake["chats"]["pitch"] }) {
  const facts = [
    { label: "Chats started", value: formatCount(chats.started) },
    { label: "With a message", value: formatCount(chats.engaged) },
    { label: "Sent", value: formatCount(chats.submitted) },
    {
      label: "Messages per sent chat",
      value: chats.avgTurnsToSubmit === null ? "—" : chats.avgTurnsToSubmit.toFixed(1),
    },
  ]
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
      <h3 className="text-xs font-medium text-muted-foreground">Server side</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="text-sm font-medium tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
