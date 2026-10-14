import { NewsletterNotice, noticeMetadata } from "@/components/newsletter-notice";

export const metadata = noticeMetadata("You're subscribed");

export default function SubscribedPage() {
  return (
    <NewsletterNotice title="You're subscribed.">
      <p>Thanks for confirming. We write when there&apos;s something to show.</p>
      <p>Every newsletter has a link to unsubscribe. One click, and we stop.</p>
    </NewsletterNotice>
  );
}
