import type { Metadata } from "next";
import { Suspense } from "react";

import { container } from "@/components/ui";

import { SignInPage } from "./sign-in-page";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the task board with GitHub or an emailed code. Signing in creates a contributor account; it isn't Novawerk membership.",
  alternates: { canonical: "/sign-in" },
  robots: { index: false },
};

export default function Page() {
  return (
    <div className={`${container} grid place-items-center pt-14 pb-18`}>
      <div className="w-full max-w-[460px] border border-line bg-paper p-6 sm:p-8">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <SignInPage />
        </Suspense>
      </div>
      <p className="mt-6 max-w-[460px] text-center font-mono text-xs text-muted">
        Agents don&apos;t sign in. They use a token from Settings → Tokens &amp; agents.
      </p>
    </div>
  );
}
