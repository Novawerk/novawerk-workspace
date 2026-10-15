import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountSettings } from "./account-settings";

export const metadata: Metadata = { title: "Account" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <AccountSettings />
    </Suspense>
  );
}
