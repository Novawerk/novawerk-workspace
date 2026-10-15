// @nw/email — outbound email for Novawerk.
//
// Five doors, and only five:
//   - The outbox (./outbox.ts) for anyone outside Novawerk. Agents queue; a member approves;
//     only then can sendApproved() send it, once.
//   - notifyTeam() (./notify.ts) for our own inbox. It refuses any non-novawerk.io address.
//   - sendSignInCode() (./sign-in.ts): a fixed email with a 6-digit code, which the API sends
//     to an active member's own address, or a contributor's, when they sign in by email.
//   - sendNewsletterConfirmation() (./newsletter.ts): a fixed double opt-in email with one
//     confirmation link, to the address that just asked for the newsletter (NB-ADR-0011).
//   - sendContributorNotice() (./contributor-notices.ts): fixed emails to a contributor about
//     their own account and tasks, to their own verified address (NB-ADR-0013).

export {
  approveEmail,
  emailsAbout,
  OutboxError,
  queueEmail,
  rejectEmail,
  sendApproved,
  type OutboxEmail,
  type OutboxErrorCode,
  type QueueEmailInput,
  type SendOptions,
  type SendResult,
} from "./outbox.js";

export { notifyTeam, type NotifyOptions, type TeamNotification } from "./notify.js";

export { SIGN_IN_CODE_PATTERN, sendSignInCode, signInCodeEmail, type SignInAudience, type SignInCodeOptions } from "./sign-in.js";

export {
  newsletterConfirmationEmail,
  newsletterConfirmUrl,
  newsletterUnsubscribe,
  sendNewsletterConfirmation,
  type NewsletterConfirmationOptions,
  type NewsletterUnsubscribe,
  type NewsletterUrls,
} from "./newsletter.js";

export {
  ContributorNoticeError,
  contributorNoticeContent,
  contributorNoticeEmail,
  sendContributorNotice,
  type ContributorNoticeMail,
  type ContributorNoticeOptions,
  type NoticeTask,
} from "./contributor-notices.js";
