import type { Metadata } from "next";
import { Suspense } from "react";

import { NewsletterNotice, noticeMetadata } from "@/components/newsletter-notice";

import { UnsubscribeButton } from "./unsubscribe-button";

// The token is in the address: never send it on as a Referer.
export const metadata: Metadata = { ...noticeMetadata("Unsubscribe"), referrer: "no-referrer" };

/**
 * The footer link of every newsletter. Opening it changes nothing (mail scanners open links too);
 * the button does. Mail clients with one-click unsubscribe POST to the API directly (RFC 8058).
 */
export default function UnsubscribePage() {
  return (
    <NewsletterNotice title="Unsubscribe from the newsletter?" actions={[]}>
      <p>We stop writing to you right away. We keep only a note that you unsubscribed.</p>
      <Suspense fallback={<div className="h-11" />}>
        <UnsubscribeButton />
      </Suspense>
    </NewsletterNotice>
  );
}
