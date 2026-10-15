import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BuildersPreview } from "./preview";

export const metadata: Metadata = {
  title: "Builders scene (dev)",
  robots: { index: false, follow: false },
};

/** A dev-only preview of the builders scene with fixture data. A 404 in production builds. */
export default function BuildersDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BuildersPreview />;
}
