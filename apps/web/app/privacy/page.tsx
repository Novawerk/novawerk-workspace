import type { Metadata } from "next";

import { LegalArticle } from "@/components/legal-page";
import { getLegalPage } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What personal data novawerk.io collects, why, who processes it, how long we keep it, and your rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalArticle page={getLegalPage("privacy")} eyebrowText="Legal" />;
}
