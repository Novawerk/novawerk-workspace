import type { Metadata } from "next";

import { Section } from "@/components/section";
import { buttonSmallInk, buttonSmallOutline, container, eyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Brand",
  description: "Download the Novawerk logo (Nova Star and horizontal lockup) as SVG or PNG, with our colours.",
  alternates: { canonical: "/brand" },
};

type Asset = {
  file: string;
  name: string;
  note: string;
  /** Preview ground: the dark variants carry their own ink background. */
  ground: "paper" | "ink";
  wide?: boolean;
};

const ASSETS: Asset[] = [
  { file: "nova-star-horizontal", name: "Horizontal, colour", note: "The default. Headers, slides, partner pages.", ground: "paper", wide: true },
  { file: "nova-star-horizontal-mixed", name: "Horizontal, green mark + ink wordmark", note: "When the name needs the most contrast.", ground: "paper", wide: true },
  { file: "nova-star-horizontal-bw", name: "Horizontal, single ink", note: "One-colour print.", ground: "paper", wide: true },
  { file: "nova-star-horizontal-dark", name: "Horizontal, dark", note: "Dark surfaces and social cards.", ground: "ink", wide: true },
  { file: "nova-star", name: "Nova Star, colour", note: "Avatars and small spaces.", ground: "paper" },
  { file: "nova-star-bw", name: "Nova Star, single ink", note: "One-colour print.", ground: "paper" },
  { file: "nova-star-dark", name: "Nova Star, dark", note: "Cream star on ink.", ground: "ink" },
];

const COLOURS = [
  { name: "Novawerk green", hex: "#1f7a4a", swatch: "bg-[#1f7a4a]", text: "text-paper" },
  { name: "Cream", hex: "#efe9d8", swatch: "bg-[#efe9d8]", text: "text-ink" },
  { name: "Ink", hex: "#0f0f0f", swatch: "bg-[#0f0f0f]", text: "text-paper" },
];

export default function BrandPage() {
  return (
    <>
      <section aria-labelledby="brand" className={`${container} py-16 sm:py-24`}>
        <p className={eyebrow}>Brand</p>
        <h1 id="brand" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          Logo &amp; colours
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-balance text-muted sm:text-xl">
          Writing about us, or putting Novawerk on a poster or a partner page? Take what you need. PNG works everywhere;
          SVG scales, but the wordmark loads its font from the web.
        </p>
      </section>

      <Section id="logos" title="Logos" intro="The core of the star is a cutout: it always shows the background behind it.">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
          {ASSETS.map((a) => (
            <li key={a.file} className={`flex flex-col border border-line ${a.wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
              <div
                className={`flex items-center justify-center p-8 sm:p-10 ${a.ground === "ink" ? "bg-[#0f0f0f]" : "bg-paper"} ${a.wide ? "h-48 sm:h-56" : "h-48"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- static PNG preview, no optimisation needed */}
                <img src={`/brand/png/${a.file}.png`} alt={a.name} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
                <div className="min-w-0">
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-muted">{a.note}</p>
                </div>
                <div className="flex gap-2">
                  <a className={buttonSmallInk} href={`/brand/png/${a.file}.png`} download>
                    PNG
                  </a>
                  <a className={buttonSmallOutline} href={`/brand/${a.file}.svg`} download>
                    SVG
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="colours" title="Colours">
        <ul className="grid gap-4 sm:grid-cols-3 sm:gap-6">
          {COLOURS.map((c) => (
            <li key={c.hex} className={`flex h-36 flex-col justify-end border border-line p-5 ${c.swatch} ${c.text}`}>
              <p className="font-medium">{c.name}</p>
              <p className="font-mono text-sm opacity-80">{c.hex}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="rules" title="A few rules">
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-muted">
          <li>Use the files as they are: no other colours, gradients, shadows or outlines.</li>
          <li>Don&apos;t put the star in a circle, a rounded square or any other shape. It stands alone.</li>
          <li>Leave space around the logo, at least as much as the star is tall.</li>
          <li>Don&apos;t fill the core of the star. It is a cutout.</li>
        </ul>
      </Section>
    </>
  );
}
