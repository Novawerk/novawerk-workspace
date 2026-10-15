import type { Metadata } from "next";
import Link from "next/link";

import { container, textLink } from "@/components/ui";

import { SuggestForm } from "./suggest-form";

export const metadata: Metadata = {
  title: "Suggest a task",
  description: "Suggest an improvement or report a bug in Novawerk's own tools: the site, the admin panel, the API or the agents.",
  alternates: { canonical: "/tasks/suggest" },
  robots: { index: false },
};

export default function SuggestPage() {
  return (
    <>
      <div className={container}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-6 text-[13px] text-muted">
          <Link className={textLink} href="/tasks">
            Tasks
          </Link>
          <span aria-hidden="true">/</span>
          <span>Suggest a task</span>
        </nav>
      </div>
      <SuggestForm />
    </>
  );
}
