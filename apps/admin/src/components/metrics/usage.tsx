import {
  CTA_PLACEMENTS,
  CTA_TARGETS,
  FORM_KINDS,
  INTAKE_FAILURE_REASONS,
  type CtaPlacement,
  type CtaTarget,
  type FormKind,
  type IntakeFailureReason,
} from "@nw/contracts"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@nw/ui/core/components/ui/table"

import { formatCompact, formatCount, formatPercent, formatSeconds, ratio } from "@/lib/format"
import type { AdminMetrics } from "@/lib/types"

import { BarList, Panel, Section, StatTile } from "./parts"

const TARGET_LABELS: Record<CtaTarget, string> = {
  submit: "Submit",
  join: "Join (old)",
  contribute: "Contribute",
  tasks: "Find a task",
  agent: "Set up your agent",
}

const PLACEMENT_LABELS: Record<CtaPlacement, string> = {
  header: "Header",
  hero: "Hero",
  "get-involved": "Get involved",
  footer: "Footer",
  contribute: "/contribute",
}

const AGENT_LABELS: Record<string, string> = { intake: "Intake Agent", "admin-assistant": "Admin assistant" }

/** What each failure means, from the HTTP status the browser saw. */
const FAILURE_LABELS: Record<IntakeFailureReason, { label: string; hint: string }> = {
  network: { label: "Network", hint: "The browser couldn't reach us" },
  busy: { label: "Busy", hint: "A reply was still running" },
  limit: { label: "Limit", hint: "Out of messages, or too many chats" },
  gone: { label: "Gone", hint: "The chat had ended or was sent" },
  unavailable: { label: "Switched off", hint: "The assistant was off" },
  error: { label: "Error", hint: "Something failed on our side" },
}

const FORM_LABELS: Record<FormKind, string> = { pitch: "Pitch", join: "Join", newsletter: "Newsletter" }

const num = "text-right tabular-nums"

export function CtaSection({ traffic }: { traffic: AdminMetrics["traffic"] }) {
  const clicks = (target: CtaTarget, placement: CtaPlacement) =>
    traffic.ctaClicks.find((c) => c.target === target && c.placement === placement)?.clicks ?? 0
  const byTarget = (target: CtaTarget) => CTA_PLACEMENTS.reduce((sum, p) => sum + clicks(target, p), 0)
  const byPlacement = (placement: CtaPlacement) => CTA_TARGETS.reduce((sum, t) => sum + clicks(t, placement), 0)
  const total = CTA_TARGETS.reduce((sum, t) => sum + byTarget(t), 0)
  const projectTotal = traffic.projectClicks.reduce((sum, p) => sum + p.clicks, 0)

  return (
    <Section
      id="metrics-cta"
      title="Calls to action"
      description="Clicks on the “Pitch a project” and “Join” links, by where they sit on the site."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Link clicks" description={`${formatCount(total)} clicks in the range`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placement</TableHead>
                {CTA_TARGETS.map((t) => (
                  <TableHead key={t} className="text-right">
                    {TARGET_LABELS[t]}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CTA_PLACEMENTS.map((placement) => (
                <TableRow key={placement}>
                  <TableCell>{PLACEMENT_LABELS[placement]}</TableCell>
                  {CTA_TARGETS.map((t) => (
                    <TableCell key={t} className={num}>
                      {formatCount(clicks(t, placement))}
                    </TableCell>
                  ))}
                  <TableCell className={num}>{formatCount(byPlacement(placement))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                {CTA_TARGETS.map((t) => (
                  <TableCell key={t} className={num}>
                    {formatCount(byTarget(t))}
                  </TableCell>
                ))}
                <TableCell className={num}>{formatCount(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Panel>
        <Panel title="Project clicks" description="Portfolio cards people opened">
          <BarList
            total={projectTotal}
            empty="No project clicks in this range."
            rows={traffic.projectClicks.map((p) => ({ key: p.project, label: p.project, value: p.clicks }))}
          />
        </Panel>
      </div>
    </Section>
  )
}

export function AgentsSection({ agents, intake }: { agents: AdminMetrics["agents"]; intake: AdminMetrics["intake"] }) {
  const failures = (reason: IntakeFailureReason) => intake.replyFailures.find((f) => f.reason === reason)?.count ?? 0
  const failureTotal = INTAKE_FAILURE_REASONS.reduce((sum, r) => sum + failures(r), 0)

  return (
    <Section
      id="metrics-agents"
      title="Chat health and agents"
      description="Every model reply in the range: how many, how fast, and the tokens it took."
    >
      <Panel title="Replies by agent" description="Reply time is from the visitor's message to the end of the reply.">
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent replies in this range.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
                <TableHead className="text-right">Input tokens</TableHead>
                <TableHead className="text-right">Cached</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.agent}>
                  <TableCell className="font-medium">{AGENT_LABELS[a.agent] ?? a.agent}</TableCell>
                  <TableCell className={num}>{formatCount(a.turns)}</TableCell>
                  <TableCell className={num}>
                    {formatCount(a.errors)}
                    <span className="ml-1.5 text-xs text-muted-foreground">{formatPercent(ratio(a.errors, a.turns))}</span>
                  </TableCell>
                  <TableCell className={num}>{formatSeconds(a.p50Ms)}</TableCell>
                  <TableCell className={num}>{formatSeconds(a.p95Ms)}</TableCell>
                  <TableCell className={num} title={formatCount(a.inputTokens)}>
                    {formatCompact(a.inputTokens)}
                  </TableCell>
                  <TableCell className={num} title={`${formatCount(a.cachedInputTokens)} cached`}>
                    {formatPercent(ratio(a.cachedInputTokens, a.inputTokens))}
                  </TableCell>
                  <TableCell className={num} title={formatCount(a.outputTokens)}>
                    {formatCompact(a.outputTokens)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Replies that didn't arrive" description="Seen by the visitor's browser, by reason">
          {failureTotal === 0 ? (
            <p className="text-sm text-muted-foreground">Every reply arrived.</p>
          ) : (
            <Table>
              <TableBody>
                {INTAKE_FAILURE_REASONS.map((reason) => (
                  <TableRow key={reason}>
                    <TableCell>
                      <span className="font-medium">{FAILURE_LABELS[reason].label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{FAILURE_LABELS[reason].hint}</span>
                    </TableCell>
                    <TableCell className={num}>{formatCount(failures(reason))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <StatTile
          label="Plain form stood in"
          value={formatCount(intake.fallbacks)}
          detail="Times the assistant was off and the step-by-step form took its place."
        />
      </div>
    </Section>
  )
}

export function FormsSection({ forms }: { forms: AdminMetrics["forms"] }) {
  return (
    <Section id="metrics-forms" title="Forms" description="The plain step-by-step forms and the newsletter box.">
      <Panel title="Sends and failures" description="Sends from the chat count in the funnel, not here.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Form</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Failed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FORM_KINDS.map((kind) => (
              <TableRow key={kind}>
                <TableCell>{FORM_LABELS[kind]}</TableCell>
                <TableCell className={num}>{formatCount(forms[kind].submitted)}</TableCell>
                <TableCell className={num}>{formatCount(forms[kind].failed)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </Section>
  )
}
