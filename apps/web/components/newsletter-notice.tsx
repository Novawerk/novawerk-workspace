// The short pages around the newsletter's double opt-in (app/newsletter/*): one star, one
// headline, a few lines, and a way back.

import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NovaStar } from "./nova-star";
import { buttonOutline, container, eyebrow } from "./ui";

/** These pages only make sense from an email: keep them out of search. */
export function noticeMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: false } };
}

export function NewsletterNotice({
  title,
  children,
  actions = [{ href: "/", label: "See the projects" }],
}: {
  title: string;
  children: ReactNode;
  actions?: { href: string; label: string }[];
}) {
  return (
    <div className={`${container} py-24 sm:py-32`}>
      <NovaStar tone="neutral" className="size-10" />
      <p className={`${eyebrow} mt-8`}>Newsletter</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <div className="mt-4 max-w-xl space-y-3 text-muted">{children}</div>
      {actions.length > 0 ? (
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          {actions.map((a) => (
            <Link key={a.href} href={a.href} className={buttonOutline}>
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
