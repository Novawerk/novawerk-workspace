import type { Metadata } from "next";

import { LegalArticle } from "@/components/legal-page";
import { getLegalPage } from "@/lib/knowledge";

export const metadata: Metadata = {
  title: "Imprint",
  description: "Legal notice (Impressum) for novawerk.io.",
  alternates: { canonical: "/imprint" },
};

export default function ImprintPage() {
  return <LegalArticle page={getLegalPage("imprint")} eyebrowText="Legal" />;
}
