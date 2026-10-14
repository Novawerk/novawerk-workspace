import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "@nw/ui/compound/theme-provider"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@nw/ui/core/components/ui/command"

import { navFor } from "@/lib/nav"
import type { Me } from "@/lib/types"

/** ⌘K / Ctrl+K: jump to any page, or switch the theme. */
export function CommandPalette({
  me,
  open,
  onOpenChange,
}: {
  me: Me
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { setTheme } = useTheme()

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump to a page"
      description="Search pages and actions."
    >
      <Command>
        <CommandInput placeholder="Type a page or an action…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          {navFor(me).map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.flatMap((item) => [
                <CommandItem
                  key={item.to}
                  value={`${group.label} ${item.title}`}
                  keywords={item.keywords}
                  onSelect={() => run(() => void navigate({ to: item.to }))}
                >
                  <item.icon />
                  {item.title}
                </CommandItem>,
                ...(item.children ?? [])
                  .filter((sub) => sub.to !== item.to)
                  .map((sub) => (
                    <CommandItem
                      key={sub.to}
                      value={`${group.label} ${item.title} ${sub.title}`}
                      keywords={sub.keywords}
                      onSelect={() => run(() => void navigate({ to: sub.to }))}
                    >
                      <sub.icon />
                      {item.title} · {sub.title}
                    </CommandItem>
                  )),
              ])}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Theme">
            <CommandItem value="Theme light" onSelect={() => run(() => setTheme("light"))}>
              <SunIcon /> Light theme
            </CommandItem>
            <CommandItem value="Theme dark" onSelect={() => run(() => setTheme("dark"))}>
              <MoonIcon /> Dark theme
            </CommandItem>
            <CommandItem value="Theme system" onSelect={() => run(() => setTheme("system"))}>
              <MonitorIcon /> Match the system
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
