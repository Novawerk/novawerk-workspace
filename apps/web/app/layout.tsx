import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { BoardProviders } from "@/components/board/providers";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getIdentity, getPledge } from "@/lib/knowledge";
import { SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const { description } = getIdentity();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f4f5",
  colorScheme: "light",
  // Phones shrink the page when the keyboard opens, so the Intake Agent's message box stays in
  // view. Set here, not on /submit: a link opens it as an intercepted route, which
  // doesn't apply that page's viewport.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children, modal }: LayoutProps<"/">) {
  return (
    // The site is light only until dark mode ships (NW-43). data-theme pins the components that
    // already have dark tokens (the builders scene) to light, so they match the page.
    <html lang="en" data-theme="light" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
        >
          Skip to content
        </a>
        <BoardProviders pledge={getPledge()}>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          {modal}
        </BoardProviders>
      </body>
    </html>
  );
}
