import { NEWSLETTER_CONFIRM_TTL_HOURS } from "@nw/contracts";

import { NewsletterNotice, noticeMetadata } from "@/components/newsletter-notice";

export const metadata = noticeMetadata("This link has expired");

export default function LinkExpiredPage() {
  return (
    <NewsletterNotice
      title="This link doesn't work anymore."
      actions={[{ href: "/about#newsletter", label: "Sign up again" }]}
    >
      <p>
        A confirmation link works for {NEWSLETTER_CONFIRM_TTL_HOURS} hours, and only the newest one counts. You&apos;re
        not on the list yet.
      </p>
      <p>Sign up again and we send you a fresh link.</p>
    </NewsletterNotice>
  );
}
