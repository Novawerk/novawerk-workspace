import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { continueRender, delayRender } from "remotion";

// Latin: Geist, the website's face (Geist Mono for labels). Chinese: Noto Sans SC, subset by
// Google Fonts to the characters the video uses (the full family is ~100 chunks per weight).
const geist = loadGeist("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });
const geistMono = loadGeistMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

/** Load every @font-face in a stylesheet under `family`. */
async function loadCss(family: string, url: string) {
  const css = await (await fetch(url)).text();
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]!);
  await Promise.all(
    faces.map(async (body) => {
      const weight = /font-weight:\s*(\d+)/.exec(body)?.[1] ?? "400";
      let src = /src:\s*url\(['"]?([^'")]+)['"]?\)/.exec(body)?.[1];
      if (!src) return;
      if (src.startsWith("//")) src = `https:${src}`;
      const face = new FontFace(family, `url(${src})`, { weight });
      await face.load();
      document.fonts.add(face);
    }),
  );
}

function loadSubset(family: string, weights: string, chars: string) {
  const text = encodeURIComponent([...new Set(chars)].join(""));
  return loadCss(family, `https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@${weights}&text=${text}&display=block`);
}

/** Call once from a project's index.ts with every Chinese character it puts on screen. */
export function loadFonts(text: string) {
  const handle = delayRender("CJK font subsets and the wordmark face");
  Promise.all([
    loadSubset("Noto Sans SC", "500;700;900", text),
    // The wordmark's face, from Fontshare like the brand SVGs.
    loadCss("Cabinet Grotesk", "https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800&display=block"),
  ]).finally(() => continueRender(handle));
}

export const fontFamily = `${geist.fontFamily}, "Noto Sans SC", sans-serif`;
export const wordmarkFamily = `"Cabinet Grotesk", "Inter Tight", system-ui, sans-serif`;
export const monoFamily = `${geistMono.fontFamily}, "Noto Sans SC", monospace`;
