"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { SignInPanel, needsSetup } from "@/components/board/sign-in";
import { track } from "@/lib/analytics";
import { safeReturnTo } from "@/lib/contrib-api";
import { useSession } from "@/lib/session";

export function SignInPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useSession();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const error = params.get("error");

  useEffect(() => {
    track("sign_in_open", { placement: "page" });
  }, []);

  // Already signed in (or just did, by Google or email): carry on, here or in one of our apps. A new
  // account first finishes the setup dialog (handle, pledge); leaving now would take it to the chat
  // with a placeholder handle, and the chat sends it back here anyway.
  const setupPending = session.status === "signed-in" && needsSetup(session.me);
  useEffect(() => {
    if (session.status !== "signed-in" || setupPending) return;
    if (returnTo.startsWith("/")) router.replace(returnTo);
    else window.location.assign(returnTo);
  }, [session.status, setupPending, returnTo, router]);

  return <SignInPanel returnTo={returnTo} error={error} />;
}
