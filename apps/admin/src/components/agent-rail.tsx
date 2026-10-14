import * as React from "react"
import { createPortal } from "react-dom"
import { BotIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react"

import { Button } from "@nw/ui/core/components/ui/button"
import { cn } from "@nw/ui/lib/utils"

import { useMediaQuery } from "@/hooks/use-media-query"

// The agent rail: one panel on the right of every page, full height, for whichever agent the page
// offers (Ask the agent on a pitch or an application, the writer on a post). A page puts its
// panel in with <AgentRailContent>; pages without one show no rail. The member drags its left
// edge to resize it and folds it away to the right; both are remembered in this browser.
// On narrow screens it opens over the page instead.

const WIDTH_KEY = "nw-agent-rail:width"
const OPEN_KEY = "nw-agent-rail:open"
const MIN_WIDTH = 320
const MAX_WIDTH = 760
const DEFAULT_WIDTH = 400

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the rail just won't remember.
  }
}

const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))

interface RailContext {
  /** Where the page's panel is rendered. */
  slot: HTMLElement | null
  setSlot: (node: HTMLElement | null) => void
  /** The title of the panel the page offers, or null when it offers none. */
  title: string | null
  setTitle: (title: string | null) => void
  open: boolean
  setOpen: (open: boolean) => void
}

const Ctx = React.createContext<RailContext | null>(null)

function useRail(): RailContext {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("useRail() outside <AgentRailProvider>")
  return ctx
}

export function AgentRailProvider({ children }: { children: React.ReactNode }) {
  const wide = useMediaQuery("(min-width: 64rem)")
  const [slot, setSlot] = React.useState<HTMLElement | null>(null)
  const [title, setTitle] = React.useState<string | null>(null)
  // Open by default on wide screens (remembered), closed by default over the page on narrow ones.
  const [openWide, setOpenWide] = React.useState(() => read(OPEN_KEY) !== "false")
  const [openNarrow, setOpenNarrow] = React.useState(false)
  const open = wide ? openWide : openNarrow
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (wide) {
        setOpenWide(next)
        write(OPEN_KEY, String(next))
      } else setOpenNarrow(next)
    },
    [wide],
  )
  const value = React.useMemo(() => ({ slot, setSlot, title, setTitle, open, setOpen }), [slot, title, open, setOpen])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** The rail itself, next to the page. Renders nothing while the page offers no agent. */
export function AgentRail() {
  const { setSlot, title, open, setOpen } = useRail()
  const wide = useMediaQuery("(min-width: 64rem)")
  const [width, setWidth] = React.useState(() => clampWidth(Number(read(WIDTH_KEY)) || DEFAULT_WIDTH))
  const dragging = React.useRef<{ x: number; width: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, width }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setWidth(clampWidth(dragging.current.width + dragging.current.x - e.clientX))
  }
  const onPointerUp = () => {
    if (!dragging.current) return
    dragging.current = null
    write(WIDTH_KEY, String(width))
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16
    if (e.key === "ArrowLeft") setWidth((w) => clampWidth(w + step))
    else if (e.key === "ArrowRight") setWidth((w) => clampWidth(w - step))
    else return
    e.preventDefault()
  }
  React.useEffect(() => write(WIDTH_KEY, String(width)), [width])

  const hidden = !title || !open
  return (
    <>
      {!wide && open && title && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        aria-label={title ?? "Agent"}
        aria-hidden={hidden}
        style={wide ? { width } : undefined}
        className={cn(
          // Stays mounted while hidden: the page's panel lives in it, and keeps its chat.
          "relative flex h-svh shrink-0 flex-col border-l bg-background",
          hidden && "hidden",
          !wide && "fixed inset-y-0 right-0 z-50 w-full max-w-md shadow-xl",
        )}
      >
        {wide && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the agent panel"
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            aria-valuenow={width}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={onKeyDown}
            onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors hover:after:bg-primary/40 focus-visible:after:bg-primary"
          />
        )}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <BotIcon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setOpen(false)} aria-label="Fold the panel away">
            <PanelRightCloseIcon />
          </Button>
        </div>
        <div ref={setSlot} className="flex min-h-0 flex-1 flex-col" />
      </aside>
    </>
  )
}

/** The button in the top bar that brings a folded rail back. Shows only when there is one to open. */
export function AgentRailToggle() {
  const { title, open, setOpen } = useRail()
  if (!title || open) return null
  return (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
      <PanelRightOpenIcon /> {title}
    </Button>
  )
}

/** A page's panel in the rail. While it is mounted, the rail shows with this title. */
export function AgentRailContent({ title, children }: { title: string; children: React.ReactNode }) {
  const { slot, setTitle } = useRail()
  React.useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [title, setTitle])
  return slot ? createPortal(children, slot) : null
}
