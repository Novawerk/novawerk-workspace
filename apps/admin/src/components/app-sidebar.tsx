import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { ChevronsUpDownIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserRoundIcon } from "lucide-react"

import { NovaStar } from "@nw/ui/compound/nova-star"
import { useTheme } from "@nw/ui/compound/theme-provider"
import { Avatar, AvatarFallback } from "@nw/ui/core/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nw/ui/core/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@nw/ui/core/components/ui/sidebar"

import { dataSource } from "@/lib/data-source"
import { initials } from "@/lib/format"
import { isMaintainer, navFor, subItemActive } from "@/lib/nav"
import { applicationsQueryOptions, outboxQueryOptions, submissionsQueryOptions } from "@/lib/queries"
import type { Me } from "@/lib/types"

export function AppSidebar({ me }: { me: Me }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  // Counts are for maintainers; other members can't read the inbox or the outbox.
  const maintainer = isMaintainer(me)
  const { data: newPitches } = useQuery({ ...submissionsQueryOptions("new"), enabled: maintainer })
  const { data: newApplications } = useQuery({ ...applicationsQueryOptions("new"), enabled: maintainer })
  const { data: pendingEmails } = useQuery({ ...outboxQueryOptions({ status: "pending" }), enabled: maintainer })
  // On a phone the sidebar is a sheet over the page: close it once a link is picked.
  const { isMobile, setOpenMobile } = useSidebar()
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  const counts: Record<string, number | undefined> = {
    "/projects": newPitches?.length,
    "/inbox/applications": newApplications?.length,
    "/outbox": pendingEmails?.length,
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/projects" />} tooltip="Novawerk Admin" onClick={closeOnMobile}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand-deep/5 dark:bg-white/5">
                <NovaStar className="size-6!" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">Novawerk</span>
                <span className="truncate text-xs text-muted-foreground">{maintainer ? "Maintainer" : "Member"}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navFor(me).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const count = counts[item.to]
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      render={<Link to={item.to} />}
                      isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
                      tooltip={item.title}
                      onClick={closeOnMobile}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {count ? (
                      <SidebarMenuBadge aria-label={item.to === "/outbox" ? `${count} waiting` : `${count} new`}>
                        {count}
                      </SidebarMenuBadge>
                    ) : null}
                    {item.children && (
                      <SidebarMenuSub>
                        {item.children.map((sub) => (
                          <SidebarMenuSubItem key={sub.to}>
                            <SidebarMenuSubButton
                              render={<Link to={sub.to} />}
                              isActive={subItemActive(item, sub, pathname)}
                              onClick={closeOnMobile}
                            >
                              <sub.icon />
                              <span>{sub.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu me={me} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function UserMenu({ me }: { me: Me }) {
  const { theme = "system", setTheme } = useTheme()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const signOut = async () => {
    try {
      await dataSource.signOut()
    } finally {
      queryClient.clear()
      void navigate({ to: "/login" })
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg">{initials(me.displayName)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{me.displayName}</span>
              <span className="truncate text-xs text-muted-foreground">{me.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(String(value))}>
                <DropdownMenuRadioItem value="light">
                  <SunIcon /> Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon /> Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorIcon /> System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void navigate({ to: "/profile" })}>
              <UserRoundIcon /> Your profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOutIcon /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
