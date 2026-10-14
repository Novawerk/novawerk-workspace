import { statusLabel } from "@nw/ui/compound/status-badge"
import { Tabs, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"

/**
 * "All / New / Discussing / …" tabs above an inbox list. `undefined` means all.
 * On a narrow screen the row scrolls sideways instead of squeezing the labels.
 */
export function StatusFilter<S extends string>({
  statuses,
  value,
  onChange,
}: {
  statuses: readonly S[]
  value: S | undefined
  onChange: (value: S | undefined) => void
}) {
  return (
    <Tabs
      value={value ?? "all"}
      onValueChange={(next) => onChange(next === "all" ? undefined : (next as S))}
    >
      <TabsList className="w-full justify-start overflow-x-auto [scrollbar-width:none]">
        <TabsTrigger value="all">All</TabsTrigger>
        {statuses.map((status) => (
          <TabsTrigger key={status} value={status}>
            {statusLabel(status)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
