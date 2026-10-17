export const SITE_URL = "https://novawerk.io";
export const SITE_NAME = "Novawerk";
export const TAGLINE = "An open workshop for early ideas.";
export const CONTACT_EMAIL = "info@novawerk.io";
export const GITHUB_URL = "https://github.com/Novawerk";
/** Novawerk Chat, for every member; it signs in with the Novawerk account (NB-ADR-0014). */
// Must be referenced literally so Next inlines it into the client bundle.
export const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL?.trim() || "https://chat.novawerk.io";

/** Shown whenever a form can't reach the API. */
export const SEND_FAILED_MESSAGE = `We couldn't send this. Please try again, or email ${CONTACT_EMAIL}`;
