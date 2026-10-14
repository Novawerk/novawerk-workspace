import type { PublicProject } from "@nw/contracts";

/**
 * Shown when API_URL is unset or GET /public/projects fails, so the home page always
 * renders. Keep in step with the real portfolio; the API is the source of truth.
 */
export const FALLBACK_PROJECTS: PublicProject[] = [
  {
    slug: "berlin-food-map",
    title: "Berlin Chinese Food Map",
    tagline: "A community-curated guide to eating well in Berlin.",
    description:
      "An open, non-profit digital guide to Chinese restaurants in Berlin — built and edited by the people who actually eat there.",
    status: "building",
    year: 2026,
    link: "https://berlinfoodmap.novawerk.io/",
    coverUrl: null,
    featured: true,
    team: [],
  },
  {
    slug: "yima-app",
    title: "YIMA",
    tagline: "Privacy-first period calendar.",
    description:
      "A small tool, designed without profit as a constraint — to see whether the experience can become good again.",
    status: "launched",
    year: 2026,
    link: "https://novawerk.github.io/YIMA/",
    coverUrl: null,
    featured: true,
    team: [],
  },
];
