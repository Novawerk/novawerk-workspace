import type { Metadata } from "next";

import { LegalArticle } from "@/components/legal-page";
import { getContributingGuide } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "Contribution guide",
  description: "How the task board works: proposals, linking GitHub, pull requests, DCO sign-off, review and Werk.",
  alternates: { canonical: "/contribute/guide" },
};

/** CONTRIBUTING.md, the one general guide (NB-ADR-0014). The welcome email links here. */
export default function ContributionGuidePage() {
  return <LegalArticle page={getContributingGuide()} eyebrowText="Contribute" />;
}
