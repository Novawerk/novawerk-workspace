"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  className = "py-2 text-sm",
}: {
  href: string;
  children: React.ReactNode;
  /** Size and spacing; the colours stay the same. */
  className?: string;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} text-muted transition-colors hover:text-ink aria-[current=page]:text-ink`}
    >
      {children}
    </Link>
  );
}
