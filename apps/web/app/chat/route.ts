import { redirect } from "next/navigation";

import { CHAT_URL } from "@/lib/site";

/** novawerk.io/chat: a short address for the team chat (the welcome email links here). */
export function GET() {
  redirect(CHAT_URL);
}
