"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { trackClick } from "@/lib/analytics";

import { NavLink } from "./nav-link";
import { buttonInk, buttonOutline } from "./ui";

/**
 * The header on a phone: one Menu button that opens the links and both actions in a panel
 * under the header row. Rendered inside the header's wrapping flex row, so the panel takes a
 * line of its own (`basis-full`) and pushes the page down instead of covering it.
 * It closes on a route change, when a link is picked, and on Escape.
 */
export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openOn, setOpenOn] = useState(pathname);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Another page (Back, Forward, a link): close. Adjusting state during render, not in an effect.
  if (openOn !== pathname) {
    setOpenOn(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="-mr-2 inline-flex h-10 items-center gap-2 px-2 text-sm font-medium sm:hidden"
      >
        Menu
        <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          )}
        </svg>
      </button>

      <div
        id={panelId}
        hidden={!open}
        // Same page (Projects while on /) doesn't change the route, so close on any link click.
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpen(false);
        }}
        className="basis-full border-t border-line pt-1 pb-2 sm:hidden"
      >
        <nav aria-label="Main">
          <ul className="divide-y divide-line">
            <li>
              <NavLink href="/" className="block py-3 text-base">
                Projects
              </NavLink>
            </li>
            <li>
              <NavLink href="/about" className="block py-3 text-base">
                About
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {/* Counted as the header: on a phone this panel is the header's actions. */}
          <Link
            href="/submit"
            className={buttonOutline}
            {...trackClick("cta_click", { target: "submit", placement: "header" })}
          >
            Pitch a project
          </Link>
          <Link href="/join" className={buttonInk} {...trackClick("cta_click", { target: "join", placement: "header" })}>
            Join
          </Link>
        </div>
      </div>
    </>
  );
}
