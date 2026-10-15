"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { eyebrow } from "@/components/ui";
import { useMe } from "@/lib/session";

/** The heading (`side` false) or the section links (`side`): a column on desktop, a row of tabs on a phone. */
export function SettingsNav({ side = false }: { side?: boolean }) {
  const me = useMe();
  const pathname = usePathname();
  if (!side) {
    return (
      <div className="pt-7">
        <p className={eyebrow}>{me ? `@${me.handle}` : "Contributors"}</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">Settings</h1>
      </div>
    );
  }
  const links = [
    { href: "/settings", label: "Account" },
    ...(me ? [{ href: `/u/${me.handle}/edit`, label: "Profile" }] : []),
    { href: "/settings/tokens", label: "Tokens & agents" },
  ];
  return (
    <nav aria-label="Settings" className="flex gap-0.5 overflow-x-auto border-b border-line md:sticky md:top-20 md:grid md:border-b-0">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={pathname === l.href ? "page" : undefined}
          className="border-b-2 border-transparent px-2.5 py-2 text-sm whitespace-nowrap text-muted hover:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink md:border-b-0 md:border-l-2"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
