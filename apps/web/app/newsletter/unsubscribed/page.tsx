import { NewsletterNotice, noticeMetadata } from "@/components/newsletter-notice";

export const metadata = noticeMetadata("You're unsubscribed");

export default function UnsubscribedPage() {
  return (
    <NewsletterNotice
      title="You're unsubscribed."
      actions={[
        { href: "/", label: "See the projects" },
        { href: "/about#newsletter", label: "Changed your mind?" },
      ]}
    >
      <p>We don&apos;t send you the newsletter anymore.</p>
      <p>We keep only a note that you unsubscribed, so we never email you by mistake.</p>
    </NewsletterNotice>
  );
}
