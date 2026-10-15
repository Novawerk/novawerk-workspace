"use client";

import { SessionProvider, ToastProvider } from "@/lib/session";

import { FirstRunDialog, PledgeProvider } from "./sign-in";
import { VotesProvider } from "./votes";

/** Everything the task board needs on every page: the session, toasts, the pledge, my +1s, first-run setup. */
export function BoardProviders({ pledge, children }: { pledge: string[]; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <PledgeProvider lines={pledge}>
          <VotesProvider>
            {children}
            <FirstRunDialog />
          </VotesProvider>
        </PledgeProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
