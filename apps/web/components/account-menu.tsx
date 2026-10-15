"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { trackClick } from "@/lib/analytics";
import { usePassiveSession as useSession } from "@/lib/session";

import { Avatar } from "./board/bits";
import { buttonInk, buttonOutline } from "./ui";

/**
 * The header's actions. Visitors (and the first moment of every page, before the session is
 * known): Pitch a project + Contribute. Signed-in contributors: My tasks and their menu.
 */
export function HeaderActions() {
  const { session } = useSession();
  if (session.status !== "signed-in") {
    return (
      <div className="hidden gap-2 md:flex">
        <Link href="/submit" className={`${buttonOutline} h-10`} {...trackClick("cta_click", { target: "submit", placement: "header" })}>
          Pitch a project
        </Link>
        <Link href="/contribute" className={`${buttonInk} h-10`} {...trackClick("cta_click", { target: "contribute", placement: "header" })}>
          Contribute
        </Link>
      </div>
    );
  }
  return (
    <div className="hidden items-center gap-2 md:flex">
      <Link href="/tasks?mine=1" className="inline-flex h-10 items-center border border-transparent px-3 text-sm font-medium hover:border-line-strong">
        My tasks
      </Link>
      <AccountMenu />
    </div>
  );
}

function AccountMenu() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openOn, setOpenOn] = useState(pathname);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  if (openOn !== pathname) {
    setOpenOn(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      // Arrow keys, Home and End move between the items (a menu button pattern).
      const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      if (items.length === 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (session.status !== "signed-in") return null;
  const { me } = session;
  const item = "block px-3 py-2 text-left text-sm hover:bg-subtle focus-visible:bg-subtle";

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 border border-line-strong bg-paper px-3 text-sm font-medium hover:border-ink"
      >
        <Avatar name={me.displayName || me.handle} url={me.avatarUrl} accent={me.accent} size="xs" />
        @{me.handle}
      </button>
      {open ? (
        <div id={menuId} role="menu" className="absolute right-0 z-30 mt-1.5 grid min-w-[200px] border border-line-strong bg-paper p-1.5 shadow-lg">
          {me.public ? (
            <Link role="menuitem" className={item} href={`/u/${me.handle}`}>
              Profile
            </Link>
          ) : null}
          <Link role="menuitem" className={item} href={`/u/${me.handle}/edit`}>
            Edit profile
          </Link>
          <Link role="menuitem" className={item} href="/settings">
            Settings
          </Link>
          <Link role="menuitem" className={item} href="/settings/tokens">
            Tokens &amp; agents
          </Link>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The phone menu's account part. */
export function MobileAccountLinks({ linkClass }: { linkClass: string }) {
  const { session } = useSession();
  if (session.status !== "signed-in") return null;
  const { me } = session;
  return (
    <>
      <li>
        <Link href="/tasks?mine=1" className={linkClass}>
          My tasks
        </Link>
      </li>
      {me.public ? (
        <li>
          <Link href={`/u/${me.handle}`} className={linkClass}>
            Your profile
          </Link>
        </li>
      ) : null}
      <li>
        <Link href="/settings" className={linkClass}>
          Settings
        </Link>
      </li>
    </>
  );
}

export function useSignedIn() {
  return useSession().session.status === "signed-in";
}
