import { NEWSLETTER_CONFIRM_TTL_HOURS } from "@nw/contracts";

import { NewsletterNotice, noticeMetadata } from "@/components/newsletter-notice";

export const metadata = noticeMetadata("Check your inbox");

export default function CheckInboxPage() {
  return (
    <NewsletterNotice title="Check your inbox.">
      <p>We sent you an email with a link. Open it to confirm, and you&apos;re on the list.</p>
      <p>
        The link works for {NEWSLETTER_CONFIRM_TTL_HOURS} hours. No email after a few minutes? Look in your spam folder,
        or sign up again.
      </p>
    </NewsletterNotice>
  );
}
