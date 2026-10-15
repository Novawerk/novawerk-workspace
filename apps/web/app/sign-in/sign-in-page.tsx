"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { SignInPanel } from "@/components/board/sign-in";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/session";

/** A path on this site to go back to after signing in; anything else falls back to the board. */
function safeReturn(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/tasks";
}

export function SignInPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useSession();
  const returnTo = safeReturn(params.get("returnTo"));
  const error = params.get("error");

  useEffect(() => {
    track("sign_in_open", { placement: "page" });
  }, []);

  // Already signed in (or just did, by email): carry on.
  useEffect(() => {
    if (session.status === "signed-in") router.replace(returnTo);
  }, [session.status, returnTo, router]);

  return <SignInPanel returnTo={returnTo} error={error} />;
}
