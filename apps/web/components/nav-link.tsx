"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

type Props = {
  href: string;
  children: React.ReactNode;
  /** Size and spacing; the colours stay the same. */
  className?: string;
};

const colours = "text-muted transition-colors hover:text-ink aria-[current=page]:text-ink";

/**
 * A header link that marks the current page. The path is request data on dynamic routes
 * (/tasks/NW-42), so the prerendered page shows the plain link and the mark streams in.
 */
export function NavLink(props: Props) {
  return (
    <Suspense
      fallback={
        <Link href={props.href} className={`${props.className ?? "py-2 text-sm"} ${colours}`}>
          {props.children}
        </Link>
      }
    >
      <ActiveLink {...props} />
    </Suspense>
  );
}

function ActiveLink({
  href,
  children,
  className = "py-2 text-sm",
}: Props) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${colours}`}
    >
      {children}
    </Link>
  );
}
