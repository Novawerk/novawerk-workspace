import Link from "next/link";

import { NovaStar } from "@/components/nova-star";
import { buttonOutline, container } from "@/components/ui";

export default function NotFound() {
  return (
    <div className={`${container} py-24 sm:py-32`}>
      <NovaStar tone="neutral" className="size-10" />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">This page doesn&apos;t exist.</h1>
      <p className="mt-4 text-muted">It may have moved when we rebuilt the site.</p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonOutline}>
          See the projects
        </Link>
        <Link href="/about" className={buttonOutline}>
          About Novawerk
        </Link>
      </div>
    </div>
  );
}
