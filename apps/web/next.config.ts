import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root. `knowledge/` lives there, and the server bundle has to carry those
// Markdown files so pages that re-render at request time (ISR after `revalidateTag`,
// HTML-limited bots) can still read them.
const repoRoot = path.join(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  // Data fetching is dynamic by default; we opt in with `"use cache"` + `cacheTag`.
  cacheComponents: true,
  // @nw/contracts ships TypeScript source.
  transpilePackages: ["@nw/contracts"],
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/*": [
      "../../knowledge/culture/**/*.md",
      "../../knowledge/operations/how-we-work.md",
      "../../knowledge/legal/*.md",
    ],
  },
  poweredByHeader: false,
  async redirects() {
    // The old site's sections. Temporary (307) on purpose: portfolio detail pages may
    // come back, and a 308 would stay cached in browsers forever.
    return [
      { source: "/portfolio", destination: "/", permanent: false },
      { source: "/portfolio/:path*", destination: "/", permanent: false },
      { source: "/blog", destination: "/about", permanent: false },
      { source: "/blog/:path*", destination: "/about", permanent: false },
      { source: "/community", destination: "/about", permanent: false },
    ];
  },
};

export default nextConfig;
