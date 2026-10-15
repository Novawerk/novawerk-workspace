import Link from "next/link";

import { trackClick } from "@/lib/analytics";
import { CONTACT_EMAIL, GITHUB_URL, TAGLINE } from "@/lib/site";

import { HeaderActions } from "./account-menu";
import { MobileMenu } from "./mobile-menu";
import { NavLink } from "./nav-link";
import { NewsletterForm } from "./newsletter-form";
import { NovaStar } from "./nova-star";
import { container, textLink } from "./ui";

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 py-1" aria-label="Novawerk — home">
      <NovaStar className="size-6 shrink-0" />
      <span className="text-lg font-semibold tracking-tight">Novawerk</span>
    </Link>
  );
}

/** One row: the logo, the links and the actions. Below md (768px) they sit behind Menu: four links and the actions need about 760px. */
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className={`${container} flex flex-wrap items-center justify-between gap-x-8 py-2.5 md:py-4`}>
        <div className="flex items-center gap-6 lg:gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-5 md:flex lg:gap-6">
            <NavLink href="/">Projects</NavLink>
            <NavLink href="/about">About</NavLink>
            <NavLink href="/tasks">Tasks</NavLink>
            <NavLink href="/contributors">Contributors</NavLink>
          </nav>
        </div>
        <MobileMenu />
        <HeaderActions />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className={`${container} grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.6fr]`}>
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted">{TAGLINE}</p>
        </div>
        <nav aria-label="Footer" className="text-sm">
          <ul className="space-y-2">
            <li><Link className={textLink} href="/">Projects</Link></li>
            <li><Link className={textLink} href="/about">About</Link></li>
            <li>
              <Link className={textLink} href="/submit" {...trackClick("cta_click", { target: "submit", placement: "footer" })}>
                Pitch a project
              </Link>
            </li>
            <li>
              <Link className={textLink} href="/contribute" {...trackClick("cta_click", { target: "contribute", placement: "footer" })}>
                Contribute
              </Link>
            </li>
            <li>
              <Link className={textLink} href="/tasks" {...trackClick("cta_click", { target: "tasks", placement: "footer" })}>
                Open tasks
              </Link>
            </li>
            <li><Link className={textLink} href="/contributors">Contributors</Link></li>
          </ul>
        </nav>
        <ul className="space-y-2 text-sm">
          <li>
            <a className={textLink} href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </li>
          <li>
            <a className={textLink} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
        <section aria-labelledby="footer-newsletter" className="space-y-2">
          <h2 id="footer-newsletter" className="text-sm font-semibold">
            Newsletter
          </h2>
          <p className="text-sm text-muted">Posts, open tasks and who shipped what. Monthly.</p>
          <NewsletterForm idPrefix="footer" />
        </section>
      </div>
      <div className={`${container} flex flex-col gap-3 border-t border-line py-6 sm:flex-row sm:items-center sm:justify-between`}>
        <p className="font-mono text-xs text-muted">© Novawerk · Non-profit community</p>
        <ul className="flex gap-5 text-xs text-muted">
          <li><Link className={textLink} href="/privacy">Privacy</Link></li>
          <li><Link className={textLink} href="/imprint">Imprint</Link></li>
        </ul>
      </div>
    </footer>
  );
}
