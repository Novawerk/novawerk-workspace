import { container, eyebrow } from "./ui";
import type { LegalPage } from "@/lib/knowledge";

/** Long-form legal text from knowledge/legal, set for reading. */
export function LegalArticle({ page, eyebrowText }: { page: LegalPage; eyebrowText: string }) {
  return (
    <article className={`${container} py-16 sm:py-24`}>
      <div className="max-w-3xl">
        <p className={eyebrow}>{eyebrowText}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{page.title}</h1>
        {page.missing.length > 0 ? (
          <p role="note" className="mt-6 border border-line-strong bg-subtle p-4 text-sm">
            Draft — a few details are still missing and are highlighted below.
          </p>
        ) : null}
        <div className="legal mt-10" dangerouslySetInnerHTML={{ __html: page.html }} />
      </div>
    </article>
  );
}
