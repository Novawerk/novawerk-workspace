"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { NEWSLETTER_PATHS, newsletterUnsubscribeQuery } from "@nw/contracts";

import { FormAlert } from "@/components/forms/fields";
import { buttonInk } from "@/components/ui";
import { postToApi } from "@/lib/api";
import { CONTACT_EMAIL, SEND_FAILED_MESSAGE } from "@/lib/site";

const BROKEN_LINK = `This link is incomplete. Use the link in the newsletter, or write to ${CONTACT_EMAIL} and we take you off the list.`;

export function UnsubscribeButton() {
  const router = useRouter();
  const query = newsletterUnsubscribeQuery.safeParse({ token: useSearchParams().get("token") ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(query.success ? null : BROKEN_LINK);

  const unsubscribe = async () => {
    if (!query.success) return;
    setBusy(true);
    setError(null);
    const result = await postToApi(
      `${NEWSLETTER_PATHS.unsubscribeApi}?token=${encodeURIComponent(query.data.token)}` as `/public/${string}`,
      {},
    );
    if (result.ok) return router.replace(NEWSLETTER_PATHS.unsubscribed);
    setBusy(false);
    setError(result.reason === "invalid" ? BROKEN_LINK : SEND_FAILED_MESSAGE);
  };

  return (
    <div className="space-y-4 pt-6">
      {query.success ? (
        <button type="button" onClick={() => void unsubscribe()} disabled={busy} className={buttonInk}>
          {busy ? "Unsubscribing…" : "Unsubscribe"}
        </button>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
    </div>
  );
}
