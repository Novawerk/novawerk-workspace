"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { SignInPanel } from "@/components/board/sign-in";
import { track } from "@/lib/analytics";
import { safeReturnPath } from "@/lib/contrib-api";
import { useSession } from "@/lib/session";

export function SignInPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useSession();
  const returnTo = safeReturnPath(params.get("returnTo"));
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
