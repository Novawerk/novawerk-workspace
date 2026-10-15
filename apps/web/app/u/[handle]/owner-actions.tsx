"use client";

import Link from "next/link";

import { buttonOutline } from "@/components/ui";
import { useMe } from "@/lib/session";

/** "Edit profile", for the person whose profile this is. */
export function OwnerActions({ handle }: { handle: string }) {
  const me = useMe();
  if (me?.handle !== handle) return null;
  return (
    <Link href={`/u/${handle}/edit`} className={`${buttonOutline} h-10`}>
      Edit profile
    </Link>
  );
}
