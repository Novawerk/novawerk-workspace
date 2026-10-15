import type { LinkProps } from "@tanstack/react-router"
import {
  BotIcon,
  ClipboardListIcon,
  CoinsIcon,
  LightbulbIcon,
  ListChecksIcon,
  ShieldIcon,
  ChartColumnIcon,
  LayoutTemplateIcon,
  ListIcon,
  FileTextIcon,
  HandshakeIcon,
  LayoutGridIcon,
  MailIcon,
  MegaphoneIcon,
  SendIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  title: string
  to: NonNullable<LinkProps["to"]>
  icon: LucideIcon
  /** Extra words the ⌘K palette matches on. */
  keywords?: string[]
  /** Open to every member, not only admins. */
  members?: boolean
  /** Pages under this one, shown nested in the sidebar. They share the parent's access. */
  children?: NavSubItem[]
}

export type NavSubItem = {
  title: string
  to: NonNullable<LinkProps["to"]>
  icon: LucideIcon
  keywords?: string[]
}

export type NavGroup = { label: string; items: NavItem[] }

/** The sidebar and the ⌘K palette both read this list. */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Metrics",
        to: "/metrics",
        icon: ChartColumnIcon,
        keywords: ["analytics", "stats", "funnel", "traffic"],
      },
    ],
  },
  {
    label: "Projects",
    items: [
      {
        title: "Projects",
        to: "/projects",
        icon: LayoutGridIcon,
        keywords: ["pitches", "submissions", "ideas", "portfolio", "website", "deliverables", "files", "lifecycle"],
        members: true,
      },
      {
        title: "Posts",
        to: "/posts",
        icon: MegaphoneIcon,
        keywords: ["promotion", "social", "xiaohongshu", "linkedin", "launch"],
        members: true,
        children: [
          { title: "List", to: "/posts", icon: ListIcon, keywords: ["board", "posts"] },
          { title: "Templates", to: "/posts/templates", icon: LayoutTemplateIcon, keywords: ["card", "kickoff", "launch", "examples"] },
        ],
      },
    ],
  },
  {
    label: "Inbox",
    items: [
      { title: "Applications", to: "/inbox/applications", icon: UserPlusIcon, keywords: ["join", "members"] },
      { title: "Outbox", to: "/outbox", icon: SendIcon, keywords: ["email", "approve"] },
    ],
  },
  {
    label: "Contributors",
    items: [
      {
        title: "Tasks",
        to: "/tasks",
        icon: ListChecksIcon,
        keywords: ["task board", "contributors", "nw-", "open source", "drafts"],
      },
      { title: "Proposals", to: "/proposals", icon: ClipboardListIcon, keywords: ["plans", "assign", "choose"] },
      { title: "Suggestions", to: "/suggestions", icon: LightbulbIcon, keywords: ["triage", "ideas", "bugs", "votes"] },
      { title: "Moderation", to: "/moderation", icon: ShieldIcon, keywords: ["hide", "suspend", "spam", "discussions"] },
      { title: "Werk", to: "/werk", icon: CoinsIcon, keywords: ["points", "ledger", "adjust"] },
    ],
  },
  {
    label: "Organisation",
    items: [
      { title: "Members", to: "/members", icon: UsersIcon, keywords: ["people", "team"] },
      { title: "Partners", to: "/partners", icon: HandshakeIcon, keywords: ["sponsors", "crm"] },
      { title: "Finance", to: "/finance", icon: WalletIcon, keywords: ["ledger", "money"] },
      { title: "Documents", to: "/documents", icon: FileTextIcon, keywords: ["contracts", "files"] },
      { title: "Subscribers", to: "/subscribers", icon: MailIcon, keywords: ["newsletter"] },
    ],
  },
  {
    label: "System",
    items: [{ title: "Agents", to: "/agents", icon: BotIcon, keywords: ["automation", "runs"] }],
  },
]

/** The pages a member without admin access may open (their own projects and posts). */
export const MEMBER_PATHS = NAV.flatMap((g) => g.items.filter((i) => i.members).map((i) => i.to as string))

/** …except these, under the paths above: pitches and starting a project are for admins. */
const ADMIN_ONLY_UNDER = ["/projects/pitches", "/projects/new"]

/**
 * Whether a sub-item is the page you are on. The parent's own path ("List" at /posts) also
 * covers the pages below it that no other sub-item claims (a post at /posts/<id>).
 */
export function subItemActive(item: NavItem, sub: NavSubItem, pathname: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`)
  const claimed = (s: NavSubItem) => s.to !== item.to && under(s.to)
  if (sub.to !== item.to) return claimed(sub)
  return under(sub.to) && !item.children!.some(claimed)
}

/** True when a member without admin access may open this path. */
export function memberMayOpen(pathname: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`)
  return MEMBER_PATHS.some(under) && !ADMIN_ONLY_UNDER.some(under)
}

/** The navigation this person sees: everything for admins, their own work for other members. */
export function navFor(me: { canAdmin: boolean }): NavGroup[] {
  if (me.canAdmin) return NAV
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.members) })).filter((g) => g.items.length > 0)
}
