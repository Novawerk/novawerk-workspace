"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Note } from "@/components/board/bits";
import { PledgeLink } from "@/components/board/sign-in";
import { container, textLink } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Someone followed an old /join link (next.config redirects it here with ?from=join). */
export function FromJoinNote() {
  const params = useSearchParams();
  if (params.get("from") !== "join") return null;
  return (
    <div className={`${container} pt-5`}>
      <Note tone="info">
        You followed an old link. Applications to join are closed; the way in now is the task board. Have an idea for a new project?{" "}
        <Link className={textLink} href="/submit">
          Pitch it
        </Link>
        .
      </Note>
    </div>
  );
}

/** Visitors: a small way to sign in. Signed-in people find My tasks in the header. */
export function VisitorSignInLine() {
  const { session } = useSession();
  if (session.status === "signed-in" || session.status === "unavailable") return null;
  return (
    <p className="mt-3.5 text-sm text-muted">
      New here?{" "}
      <Link className={textLink} href="/sign-in?returnTo=/tasks">
        Sign in with GitHub
      </Link>{" "}
      when you&apos;re ready to propose.
    </p>
  );
}

export function PledgeLine() {
  return (
    <p className="mt-4 text-sm text-muted">
      Everyone here works by our <PledgeLink />.
    </p>
  );
}
